import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WorkflowConfig {
	/** Max concurrent agents per run. Default: 4. */
	concurrency?: number;
	/** Max token budget per run. Default: null (unlimited). */
	tokenBudget?: number | null;
	/** Max agent call count per run. Default: 100. */
	maxAgentCalls?: number;
	/** Agent timeout in ms. Default: 600000 (10 min). */
	agentTimeoutMs?: number;
}

const CONFIG_DIR = join(homedir(), ".minicode");
const CONFIG_FILE = join(CONFIG_DIR, "workflow.json");

const DEFAULTS: Required<WorkflowConfig> = {
	concurrency: 4,
	tokenBudget: null,
	maxAgentCalls: 100,
	agentTimeoutMs: 600_000,
};

export function loadWorkflowConfig(): WorkflowConfig {
	if (!existsSync(CONFIG_FILE)) return {};
	try {
		const raw = readFileSync(CONFIG_FILE, "utf-8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as WorkflowConfig;
		}
	} catch {
		// Corrupt config — use defaults
	}
	return {};
}

export function getWorkflowConfig(): Required<WorkflowConfig> {
	const user = loadWorkflowConfig();
	return {
		concurrency: user.concurrency ?? DEFAULTS.concurrency,
		tokenBudget: user.tokenBudget ?? DEFAULTS.tokenBudget,
		maxAgentCalls: user.maxAgentCalls ?? DEFAULTS.maxAgentCalls,
		agentTimeoutMs: user.agentTimeoutMs ?? DEFAULTS.agentTimeoutMs,
	};
}

export function saveWorkflowConfig(config: WorkflowConfig): void {
	if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
	const existing = loadWorkflowConfig();
	const merged = { ...existing, ...config };
	writeFileSync(CONFIG_FILE, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
}
