import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { fetchUrl, searchWeb } from "./search.ts";

const WEB_CACHE_FILE = path.join(getAgentDir(), "memory", "web-cache.md");
const WEB_CACHE_MAX_ENTRIES = 50;

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen - 3)}...`;
}

function appendToWebCache(title: string, url: string, content: string): void {
	try {
		const dir = path.dirname(WEB_CACHE_FILE);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const snippet = truncate(content, 2000);
		const entry = `### ${title}\nSource: ${url}\n\n${snippet}\n\n---\n\n`;
		fs.appendFileSync(WEB_CACHE_FILE, entry, "utf-8");
		rotateWebCache();
	} catch {
		/* best effort */
	}
}

function rotateWebCache(): void {
	try {
		if (!fs.existsSync(WEB_CACHE_FILE)) return;
		const content = fs.readFileSync(WEB_CACHE_FILE, "utf-8");
		const entries = content.split(/\n---\n\n/).filter(Boolean);
		if (entries.length > WEB_CACHE_MAX_ENTRIES) {
			const trimmed = `${entries.slice(-WEB_CACHE_MAX_ENTRIES).join("\n---\n\n")}\n`;
			fs.writeFileSync(WEB_CACHE_FILE, trimmed, "utf-8");
		}
	} catch {
		/* best effort */
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using DuckDuckGo. Returns titles, snippets, and URLs. " +
			"Use for finding documentation, API references, error solutions, or any real-time information.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query string" }),
			max_results: Type.Optional(Type.Number({ description: "Maximum results to return (default 8, max 20)" })),
			save_to_memory: Type.Optional(
				Type.Boolean({ description: "Save search results to memory for future reference (default false)" }),
			),
		}),
		async execute(_toolCallId, params) {
			const max = Math.min(params.max_results ?? 8, 20);
			try {
				const results = await searchWeb(params.query, max);
				if (results.length === 0) {
					return {
						content: [{ type: "text", text: `No results found for: ${params.query}` }],
						details: { query: params.query, count: 0 },
					};
				}
				if (params.save_to_memory) {
					const entry = results
						.map(
							(r, i) =>
								`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet ? truncate(r.snippet, 200) : "(no snippet)"}`,
						)
						.join("\n\n");
					appendToWebCache(`Search: ${params.query}`, `search://${encodeURIComponent(params.query)}`, entry);
				}
				const lines = results.map(
					(r, i) =>
						`${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet ? truncate(r.snippet, 200) : "(no snippet)"}`,
				);
				return {
					content: [{ type: "text", text: lines.join("\n\n") }],
					details: { query: params.query, count: results.length, savedToMemory: params.save_to_memory ?? false },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Search failed: ${msg}` }],
					details: { query: params.query, error: msg },
				};
			}
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description:
			"Fetch and extract text content from a URL. Use after web_search to read a specific page. " +
			"Returns cleaned text content with HTML tags stripped.",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch (must be http or https)" }),
			max_chars: Type.Optional(Type.Number({ description: "Maximum characters to return (default 8000)" })),
			save_to_memory: Type.Optional(
				Type.Boolean({ description: "Save fetched content to memory for future reference (default false)" }),
			),
			title: Type.Optional(
				Type.String({ description: "Title for the memory entry (required when save_to_memory=true)" }),
			),
		}),
		async execute(_toolCallId, params) {
			const url = params.url;
			if (!url.startsWith("http://") && !url.startsWith("https://")) {
				return {
					content: [{ type: "text", text: "Error: URL must start with http:// or https://" }],
					details: {},
				};
			}
			try {
				const { content, contentType } = await fetchUrl(url);
				const maxChars = params.max_chars ?? 8000;
				const truncated = truncate(content, maxChars);
				if (params.save_to_memory && params.title) {
					appendToWebCache(params.title, url, content);
				}
				return {
					content: [{ type: "text", text: `Content from ${url} (${contentType}):\n\n${truncated}` }],
					details: {
						url,
						contentType,
						length: content.length,
						truncated: content.length > maxChars,
						savedToMemory: params.save_to_memory ?? false,
					},
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Fetch failed for ${url}: ${msg}` }],
					details: { url, error: msg },
				};
			}
		},
	});

	pi.registerCommand("web-cache", {
		description: "Manage web cache: show, clear, or trim saved web results",
		async handler(args, _ctx) {
			const sub = args.trim() || "show";
			if (sub === "clear") {
				try {
					if (fs.existsSync(WEB_CACHE_FILE)) fs.unlinkSync(WEB_CACHE_FILE);
					pi.sendMessage({ customType: "text", content: "Web cache cleared.", display: true });
				} catch {
					pi.sendMessage({ customType: "text", content: "Failed to clear web cache.", display: true });
				}
				return;
			}
			if (sub === "trim") {
				rotateWebCache();
				pi.sendMessage({ customType: "text", content: "Web cache trimmed.", display: true });
				return;
			}
			const content = (() => {
				try {
					return fs.existsSync(WEB_CACHE_FILE) ? fs.readFileSync(WEB_CACHE_FILE, "utf-8") : null;
				} catch {
					return null;
				}
			})();
			if (!content) {
				pi.sendMessage({ customType: "text", content: "Web cache is empty.", display: true });
				return;
			}
			const entries = content.split(/\n---\n\n/).filter(Boolean);
			pi.sendMessage({
				customType: "text",
				content: `Web cache: ${entries.length} entries\n\nUse /web-cache clear to clear, /web-cache trim to trim old entries.`,
				display: true,
			});
		},
	});
}
