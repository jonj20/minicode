/**
 * Local model auto-discovery — probes common local LLM endpoints
 * (llama.cpp, Ollama, LM Studio, vLLM, LocalAI) via /v1/models.
 *
 * If models.json contains a "localModels" section, those endpoints are used
 * exclusively. Otherwise, default endpoints are probed concurrently.
 *
 * Additionally, endpoints from "providers.*.baseUrl" in models.json are probed
 * to discover models on custom servers (e.g., a custom llama.cpp instance on
 * a non-standard port).
 */

import type { Api, Model } from "@earendil-works/pi-ai/compat";

const PROBE_TIMEOUT_MS = 2000;

/** Default local endpoints to probe when no config is provided. */
const DEFAULT_ENDPOINTS: LocalEndpoint[] = [
	{ name: "llamacpp", baseUrl: "http://localhost:8080" },
	{ name: "ollama", baseUrl: "http://localhost:11434", modelsPath: "/api/tags", format: "ollama" },
	{ name: "lmstudio", baseUrl: "http://localhost:1234" },
	{ name: "vllm", baseUrl: "http://localhost:8000" },
	{ name: "localai", baseUrl: "http://localhost:8080" },
];

export interface LocalEndpoint {
	/** Display name for this endpoint (used as provider name). */
	name: string;
	/** Base URL (e.g. "http://localhost:8080"). */
	baseUrl: string;
	/** Custom path for model listing (default: "/v1/models"). */
	modelsPath?: string;
	/** Response format: "openai" (default) or "ollama". */
	format?: "openai" | "ollama";
}

interface OpenAIModelsResponse {
	data?: Array<{ id: string; object?: string }>;
}

interface OllamaTagsResponse {
	models?: Array<{ name: string; model?: string; size?: number }>;
}

/**
 * Probe a single endpoint for available models.
 * Returns an array of Model objects if successful, empty array otherwise.
 */
async function probeEndpoint(endpoint: LocalEndpoint): Promise<Model<Api>[]> {
	const modelsPath = endpoint.modelsPath ?? "/v1/models";
	const url = `${endpoint.baseUrl}${modelsPath}`;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

		const response = await fetch(url, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		clearTimeout(timer);

		if (!response.ok) return [];

		const data = await response.json();

		if (endpoint.format === "ollama") {
			return parseOllamaResponse(endpoint, data as OllamaTagsResponse);
		}
		return parseOpenAIResponse(endpoint, data as OpenAIModelsResponse);
	} catch {
		return [];
	}
}

function parseOpenAIResponse(endpoint: LocalEndpoint, data: OpenAIModelsResponse): Model<Api>[] {
	if (!data.data || !Array.isArray(data.data)) return [];

	return data.data
		.filter((m) => m.object === "model" || m.id)
		.map((m) => ({
			id: m.id,
			name: m.id,
			provider: endpoint.name,
			api: "openai-completions" as const,
			baseUrl: endpoint.baseUrl,
			input: ["text"] as ("text" | "image")[],
			reasoning: false,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 8192,
			maxTokens: 4096,
			compat: {},
		}));
}

function parseOllamaResponse(endpoint: LocalEndpoint, data: OllamaTagsResponse): Model<Api>[] {
	if (!data.models || !Array.isArray(data.models)) return [];

	return data.models.map((m) => ({
		id: m.name,
		name: m.name,
		provider: endpoint.name,
		api: "openai-completions" as const,
		baseUrl: `${endpoint.baseUrl}/v1`,
		input: ["text"] as ("text" | "image")[],
		reasoning: false,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 4096,
		compat: {},
	}));
}

export interface LocalModelsConfig {
	/** Explicit endpoints to probe (replaces defaults). */
	endpoints?: LocalEndpoint[];
	/** Set to false to disable auto-discovery entirely. */
	enabled?: boolean;
}

/**
 * Provider endpoint from models.json "providers.*.baseUrl".
 * Used to probe custom servers for additional models.
 */
interface ProviderEndpoint {
	name: string;
	baseUrl: string;
}

/**
 * Probe local LLM endpoints for available models.
 *
 * @param config - Optional config from models.json "localModels" section.
 *                 If provided with endpoints, only those are probed.
 *                 If provided with enabled:false, returns empty.
 *                 If not provided, default endpoints are probed.
 * @param providerEndpoints - Endpoints from models.json "providers.*.baseUrl".
 *                            These are probed in addition to defaults/config endpoints.
 */
export async function probeLocalModels(
	config?: LocalModelsConfig,
	providerEndpoints?: ProviderEndpoint[],
): Promise<Model<Api>[]> {
	if (config?.enabled === false) return [];

	const endpoints = config?.endpoints ?? DEFAULT_ENDPOINTS;

	// Merge with provider endpoints from models.json
	const allEndpoints: LocalEndpoint[] = [...endpoints];
	if (providerEndpoints) {
		for (const pe of providerEndpoints) {
			allEndpoints.push({ name: pe.name, baseUrl: pe.baseUrl });
		}
	}

	// Deduplicate by baseUrl (e.g. llamacpp and localai share port 8080)
	const seen = new Set<string>();
	const unique = allEndpoints.filter((e) => {
		if (seen.has(e.baseUrl)) return false;
		seen.add(e.baseUrl);
		return true;
	});

	const results = await Promise.all(unique.map(probeEndpoint));
	return results.flat();
}
