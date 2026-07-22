import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import contextCompactExtension from "./p2-context-compact/index.ts";
import p2HandoffExtension from "./p2-handoff/index.ts";
import initExtension from "./p2-init/index.ts";
import p2MultiEditExtension from "./p2-multi-edit/index.ts";
import p2SubagentsExtension from "./p2-subagents/src/index.ts";
import webExtension from "./p2-web-search/index.ts";
import p2WorkflowExtension from "./p2-workflow/extensions/workflow.ts";
import btwExtension from "./pi-btw/index.ts";
import cavemanExtension from "./pi-caveman/index.ts";
import commandHistoryExtension from "./pi-command-history/index.ts";
import contextUsageExtension from "./pi-context-usage/src/index.ts";
import executionTimeExtension from "./pi-execution-time/index.ts";
import fffExtension from "./pi-fff/index.ts";
import piGoalExtension from "./pi-goal/index.ts";
import piHermesMemoryExtension from "./pi-hermes-memory/src/index.ts";
import piLensExtension from "./pi-lens/index.ts";
import piLoopPoliceExtension from "./pi-loop-police/index.ts";
import { registerPlanMode } from "./pi-plan-mode/index.ts";
import rewindExtension from "./pi-rewind/index.ts";
import rtkOptimizerExtension from "./pi-rtk-optimizer/index.ts";

/**
 * Extensions that register tools and consume system prompt tokens.
 * Configurable via ~/.minicode/extensions.json.
 * Default: all disabled. Set true to enable.
 */
const TOOL_EXTENSIONS = new Set(["pi-lens", "pi-goal", "pi-hermes-memory", "p2-workflow"]);

const DEFAULT_CONFIG: Record<string, boolean> = {
	"pi-lens": false,
	"pi-goal": false,
	"pi-hermes-memory": false,
	"p2-workflow": false,
};

function loadExtensionsConfig(): Record<string, boolean> {
	const configDir = path.join(os.homedir(), ".minicode", "agent");
	const configPath = path.join(configDir, "extensions.json");

	try {
		const raw = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") {
			return parsed as Record<string, boolean>;
		}
	} catch {
		// Config missing or corrupt — create with defaults
	}

	try {
		if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
		fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
	} catch {
		// Non-fatal: extensions will use runtime defaults
	}

	return { ...DEFAULT_CONFIG };
}

function isExtensionEnabled(name: string, config: Record<string, boolean>): boolean {
	// Non-tool extensions always enabled
	if (!TOOL_EXTENSIONS.has(name)) return true;
	// Tool extensions: only enabled when explicitly set to true in config
	return config[name] === true;
}

export default function (pi: ExtensionAPI) {
	const config = loadExtensionsConfig();
	const load = (name: string, ext: (pi: ExtensionAPI) => void) => {
		if (isExtensionEnabled(name, config)) ext(pi);
	};

	// Always loaded (no tools, no context cost)
	// Core platform feature — plan mode (read-only exploration)
	registerPlanMode(pi);

	// Multi-edit replaces built-in edit tool — always loaded
	p2MultiEditExtension(pi);

	cavemanExtension(pi);
	contextCompactExtension(pi);
	contextUsageExtension(pi);
	rtkOptimizerExtension(pi);
	executionTimeExtension(pi);
	commandHistoryExtension(pi);
	initExtension(pi);
	btwExtension(pi);
	rewindExtension(pi);
	piLoopPoliceExtension(pi);
	webExtension(pi);
	fffExtension(pi);
	p2HandoffExtension(pi);

	// Always loaded (subagent capability is a core platform feature)
	p2SubagentsExtension(pi);

	// Configurable (register tools, consume context)
	load("pi-lens", piLensExtension);
	load("pi-goal", piGoalExtension);
	load("pi-hermes-memory", piHermesMemoryExtension);
	load("p2-workflow", p2WorkflowExtension);
}
