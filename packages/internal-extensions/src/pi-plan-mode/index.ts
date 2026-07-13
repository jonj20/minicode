/**
 * Plan Mode - Read-only exploration mode for safe code analysis.
 *
 * When enabled:
 * - Built-in edit/write tools are disabled
 * - Write filtering: only .md/.mdx in cwd, /tmp/, ~/.pi/
 * - Bash is restricted to an allowlist of read-only commands
 * - Mutating subagents (general-purpose) are blocked
 * - System prompt injects plan mode context
 *
 * Usage: /plan command or --plan CLI flag
 *
 * This is a core module, not an extension. It registers itself with the extension API.
 */

import { homedir, tmpdir } from "node:os";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { isSafeCommand } from "./safety.ts";

const PLAN_MODE_PROMPT = `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- Built-in edit and write tools are disabled
- Writes limited to markdown (.md/.mdx) in project dir, /tmp/, ~/.pi/
- Bash is restricted to read-only commands
- Mutating subagents (general-purpose) are blocked

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`;

// Tools allowed in plan mode (read-only subset)
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

/** Extensions allowed for write in plan mode */
const ALLOWED_WRITE_EXTENSIONS = new Set([".md", ".mdx"]);

/** Subagent types blocked in plan mode (have full tool access) */
const BLOCKED_SUBAGENT_TYPES = new Set(["general-purpose"]);

export interface PlanModeState {
	enabled: boolean;
}

// ─── Write Filtering ───────────────────────────────────────────────────────

export function isWriteAllowed(inputPath: string, cwd: string): boolean {
	if (!inputPath) return false;
	const abs = resolve(cwd, inputPath);

	// 1. Markdown files inside cwd
	const rel = relative(resolve(cwd), abs);
	if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
		if (ALLOWED_WRITE_EXTENSIONS.has(extname(abs).toLowerCase())) return true;
	}

	// 2. Anything under /tmp/ or OS tmpdir
	const tmp = tmpdir();
	if (abs.startsWith("/tmp/") || abs.startsWith(`${tmp}/`)) return true;

	// 3. Anything under ~/.pi/
	const piDir = `${homedir()}/.pi`;
	if (abs.startsWith(`${piDir}/`)) return true;

	return false;
}

/**
 * Register plan mode with the extension API.
 * Call this during extension registration to set up plan mode functionality.
 */
export function registerPlanMode(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let toolsBeforePlanMode: string[] | undefined;
	let latestCwd = process.cwd();

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function enablePlanMode(): void {
		if (toolsBeforePlanMode === undefined) {
			toolsBeforePlanMode = pi.getActiveTools();
		}
		const uniqueTools = [
			...new Set([...toolsBeforePlanMode.filter((n) => n !== "edit" && n !== "write"), ...PLAN_MODE_TOOLS]),
		];
		pi.setActiveTools(uniqueTools);
	}

	function restoreNormalMode(): void {
		if (toolsBeforePlanMode !== undefined) {
			pi.setActiveTools(toolsBeforePlanMode);
			toolsBeforePlanMode = undefined;
		}
	}

	function updateModeWidget(ctx: ExtensionContext): void {
		const text = planModeEnabled ? ctx.ui.theme.fg("success", "plan") : ctx.ui.theme.fg("accent", "build");
		ctx.ui.setStatus("plan-mode", text);
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;

		if (planModeEnabled) {
			enablePlanMode();
			ctx.ui.setEditorBorderColor((text) => `\x1b[38;2;80;200;120m${text}\x1b[0m`);
		} else {
			restoreNormalMode();
			ctx.ui.setEditorBorderColor(undefined);
		}
		updateModeWidget(ctx);
		pi.appendEntry("plan-mode", { enabled: planModeEnabled } satisfies PlanModeState);
	}

	// /plan command
	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	// Keyboard shortcuts: Ctrl+Alt+P and TAB
	pi.registerShortcut("ctrl+alt+p" as any, {
		description: "Toggle plan mode",
		handler: (ctx) => togglePlanMode(ctx),
	});

	pi.registerShortcut("tab" as any, {
		description: "Toggle plan mode (TAB)",
		handler: (ctx) => togglePlanMode(ctx),
	});

	// Tool call hooks: bash safety + write filtering + subagent gating
	pi.on("tool_call", async (event: ToolCallEvent): Promise<ToolCallEventResult | undefined> => {
		if (!planModeEnabled) return undefined;

		// 1. Bash safety — block non-read-only commands
		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode: command blocked (not read-only). Use /plan to disable plan mode first.\nCommand: ${command}`,
				};
			}
			return undefined;
		}

		// 2. Write filtering — only allow .md/.mdx in cwd, /tmp/, ~/.pi/
		if (event.toolName === "write" || event.toolName === "edit") {
			const inputPath = (event.input as { path?: string }).path ?? "";
			if (!isWriteAllowed(inputPath, latestCwd)) {
				return {
					block: true,
					reason:
						`Plan mode: write blocked for '${inputPath}'. ` +
						`Only markdown (.md/.mdx) in project dir, /tmp/, ~/.pi/ are allowed. ` +
						`Use /plan to disable plan mode for unrestricted writes.`,
				};
			}
			return undefined;
		}

		// 3. Subagent gating — block mutating subagent types
		if (event.toolName === "Agent") {
			const subagentType = (event.input as { subagent_type?: string }).subagent_type ?? "";
			if (BLOCKED_SUBAGENT_TYPES.has(subagentType)) {
				return {
					block: true,
					reason:
						`Plan mode: subagent '${subagentType}' blocked (has full tool access). ` +
						`Use Explore or Plan subagents instead, or /plan to disable plan mode.`,
				};
			}
			return undefined;
		}

		return undefined;
	});

	// Inject plan mode context before agent starts
	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: PLAN_MODE_PROMPT,
					display: false,
				},
			};
		}
		return undefined;
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		latestCwd = ctx.cwd;

		// Check --plan flag
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		// Restore from persisted state
		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: PlanModeState } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
		}

		if (planModeEnabled) {
			enablePlanMode();
			ctx.ui.setEditorBorderColor((text) => `\x1b[38;2;80;200;120m${text}\x1b[0m`);
		}

		updateModeWidget(ctx);
	});
}
