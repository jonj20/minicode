import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeCommand, loadConfig } from "@/core/analyze";
import { redactSecrets, writeAuditLog } from "@/core/audit";
import type { LoadConfigOptions } from "@/core/config";
import { getCCSafetyNetEnvModes } from "@/core/env";
import { formatBlockedMessage } from "@/core/format";
import { REASON_SAFETY_NET_FAILED_CLOSED } from "@/types";

type PiApi = {
	on: (event: "tool_call", handler: (event: unknown, ctx: PiToolCallContext) => PiToolCallResult) => void;
};

type PiToolCallContext = {
	cwd: string;
	sessionManager: {
		getSessionFile: () => string | undefined;
	};
	safetyNetAnalyzeCommand?: typeof analyzeCommand;
	safetyNetConfigOptions?: LoadConfigOptions;
};

type PiToolCallResult = { block: true; reason: string } | undefined;

type PiToolCallEvent = {
	type?: string;
	toolName?: string;
	input?: Record<string, unknown>;
};

type PiShellToolAdapter = {
	commandField: string;
	cwdField?: string;
};

const PI_SHELL_TOOL_ADAPTERS: Partial<Record<string, PiShellToolAdapter>> = {
	bash: {
		commandField: "command",
	},
	Shell: {
		commandField: "command",
		cwdField: "working_directory",
	},
};

type PiShellToolCall =
	| {
			command: string;
			cwd: string;
	  }
	| {
			malformed: true;
	  };

// Default config
const DEFAULT_CONFIG = {
	strict: false,
	paranoid: false,
	paranoidRm: false,
	paranoidInterpreters: false,
	worktreeMode: false,
	debug: false,
};

// Get global config path: ~/.minicode/safety-net/config.json
function getGlobalConfigPath(): string {
	return join(homedir(), ".minicode", "safety-net", "config.json");
}

// Get project config path: {cwd}/.minicode/safety-net/config.json
function getProjectConfigPath(cwd: string): string {
	return join(cwd, ".minicode", "safety-net", "config.json");
}

// Create default config file if not exists
function ensureDefaultConfig(): void {
	const configPath = getGlobalConfigPath();
	if (!existsSync(configPath)) {
		try {
			const dir = join(homedir(), ".minicode", "safety-net");
			mkdirSync(dir, { recursive: true });
			writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
		} catch {
			// Ignore write errors
		}
	}
}

// Load safety-net config (global + project overlay)
function loadSafetyNetConfig(cwd?: string): Record<string, unknown> {
	// Ensure default config exists
	ensureDefaultConfig();

	// Load global config
	let config: Record<string, unknown> = { ...DEFAULT_CONFIG };
	const globalPath = getGlobalConfigPath();
	try {
		if (existsSync(globalPath)) {
			const content = readFileSync(globalPath, "utf-8");
			config = { ...config, ...JSON.parse(content) };
		}
	} catch {
		// Ignore invalid config
	}

	// Load project config (overlay on global)
	if (cwd) {
		const projectPath = getProjectConfigPath(cwd);
		try {
			if (existsSync(projectPath)) {
				const content = readFileSync(projectPath, "utf-8");
				config = { ...config, ...JSON.parse(content) };
			}
		} catch {
			// Ignore invalid project config
		}
	}

	return config;
}

export function registerToolCallEvent(pi: PiApi): void {
	// Ensure default config exists on startup
	ensureDefaultConfig();
	pi.on("tool_call", handlePiToolCall);
}

/** @internal - exported for test coverage */
export function handlePiToolCall(event: unknown, ctx: PiToolCallContext): PiToolCallResult {
	const shellToolCall = getPiShellToolCall(event, ctx);
	if (!shellToolCall) return undefined;

	if ("malformed" in shellToolCall) {
		return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED);
	}

	const command = shellToolCall.command;
	const cwd = shellToolCall.cwd;

	// Load config (global + project overlay)
	const safetyNetConfig = loadSafetyNetConfig(cwd);
	const modes = getCCSafetyNetEnvModes(safetyNetConfig);

	let result: ReturnType<typeof analyzeCommand>;
	try {
		result = (ctx.safetyNetAnalyzeCommand ?? analyzeCommand)(command, {
			cwd,
			config: loadConfig(cwd, {
				repairLocalRulebooks: true,
				...ctx.safetyNetConfigOptions,
			}),
			strict: modes.strict,
			paranoidRm: modes.paranoidRm,
			paranoidInterpreters: modes.paranoidInterpreters,
			worktreeMode: modes.worktreeMode,
		});
	} catch (error) {
		if (safetyNetConfig.debug) {
			console.error(
				`CC Safety Net debug: pi tool_call analysis failed: ${redactSecrets(error instanceof Error ? error.message : String(error))}`,
			);
		}
		return blockPiToolCall(REASON_SAFETY_NET_FAILED_CLOSED, command, command);
	}

	if (!result) {
		const sessionId = ctx.sessionManager.getSessionFile();
		if (sessionId && safetyNetConfig.debug) {
			writeAuditLog(sessionId, command, command, "allowed", cwd, {
				decision: "allow",
			});
		}
		return undefined;
	}

	const sessionId = ctx.sessionManager.getSessionFile();
	if (sessionId) {
		writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
	}
	return blockPiToolCall(result.reason, command, result.segment, result.manualPermissionAdvice);
}

function getPiShellToolCall(event: unknown, ctx: PiToolCallContext): PiShellToolCall | undefined {
	if (!event || typeof event !== "object") return undefined;
	const toolCall = event as PiToolCallEvent;
	if (typeof toolCall.toolName !== "string") return undefined;

	const adapter = PI_SHELL_TOOL_ADAPTERS[toolCall.toolName];
	if (!adapter) return undefined;
	if (!toolCall.input || typeof toolCall.input !== "object") return { malformed: true };

	const command = toolCall.input[adapter.commandField];
	if (typeof command !== "string") return { malformed: true };

	const cwdInput = adapter.cwdField ? toolCall.input[adapter.cwdField] : undefined;
	const cwd = typeof cwdInput === "string" ? resolve(ctx.cwd, cwdInput) : ctx.cwd;
	return { command, cwd };
}

function blockPiToolCall(
	reason: string,
	command?: string,
	segment?: string,
	manualPermissionAdvice?: boolean,
): PiToolCallResult {
	return {
		block: true,
		reason: formatBlockedMessage({
			reason,
			command,
			segment,
			redact: redactSecrets,
			manualPermissionAdvice,
		}),
	};
}
