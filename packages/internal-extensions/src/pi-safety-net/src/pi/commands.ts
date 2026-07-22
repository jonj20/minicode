import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type PiCommandApi = {
	registerCommand: (
		name: string,
		command: {
			description: string;
			handler: (args: string, ctx: PiCommandContext) => Promise<void>;
		},
	) => void;
};

type PiCommandContext = {
	ui: {
		notify: (message: string, type?: string) => void;
	};
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

// Get global config path
function getGlobalConfigPath(): string {
	return join(homedir(), ".minicode", "safety-net", "config.json");
}

// Ensure default config exists
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

// Load config
function loadConfig(): Record<string, unknown> {
	ensureDefaultConfig();
	const configPath = getGlobalConfigPath();
	try {
		if (existsSync(configPath)) {
			return JSON.parse(readFileSync(configPath, "utf-8"));
		}
	} catch {
		// Ignore invalid config
	}
	return { ...DEFAULT_CONFIG };
}

// Save config
function saveConfig(config: Record<string, unknown>): void {
	const configPath = getGlobalConfigPath();
	try {
		const dir = join(homedir(), ".minicode", "safety-net");
		mkdirSync(dir, { recursive: true });
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
	} catch {
		// Ignore write errors
	}
}

// Format status message
function formatStatus(config: Record<string, unknown>): string {
	const lines = [
		"=== Safety Net Status ===",
		"",
		`Config: ${getGlobalConfigPath()}`,
		"",
		"Settings:",
		`  strict:              ${config.strict ?? false}`,
		`  paranoid:            ${config.paranoid ?? false}`,
		`  paranoidRm:          ${config.paranoidRm ?? false}`,
		`  paranoidInterpreters: ${config.paranoidInterpreters ?? false}`,
		`  worktreeMode:        ${config.worktreeMode ?? false}`,
		`  debug:               ${config.debug ?? false}`,
		"",
		"Blocked commands (always):",
		"  - git checkout -- (discards changes)",
		"  - git restore (discards changes)",
		"  - git reset --hard (destroys changes)",
		"  - git push --force (destroys remote)",
		"  - rm -rf / ~ $HOME (recursive delete root)",
		"  - mkfs, dd, shred (format/destroy disk)",
		"",
		"Allowed commands:",
		"  - git checkout -b (create branch)",
		"  - git restore --staged (unstage only)",
		"  - git branch -d (safe delete)",
		"  - git clean -n (dry run)",
		"  - rm -rf ./node_modules (within cwd, unless paranoidRm=true)",
	];
	return lines.join("\n");
}

// Format doctor output
function formatDoctor(): string {
	const lines = ["=== Safety Net Doctor ===", "", "Checks:"];

	// Check config file
	const configPath = getGlobalConfigPath();
	if (existsSync(configPath)) {
		lines.push("  [OK] Config file exists");
		try {
			JSON.parse(readFileSync(configPath, "utf-8"));
			lines.push("  [OK] Config file is valid JSON");
		} catch {
			lines.push("  [ERROR] Config file is invalid JSON");
		}
	} else {
		lines.push("  [WARN] Config file not found (will use defaults)");
	}

	// Check config values
	const currentConfig = loadConfig();
	const validKeys = ["strict", "paranoid", "paranoidRm", "paranoidInterpreters", "worktreeMode", "debug"];
	for (const key of validKeys) {
		if (currentConfig[key] !== undefined && typeof currentConfig[key] !== "boolean") {
			lines.push(`  [ERROR] ${key} should be boolean, got ${typeof currentConfig[key]}`);
		} else {
			lines.push(`  [OK] ${key}: ${currentConfig[key] ?? "undefined"}`);
		}
	}

	lines.push("");
	lines.push("All checks passed.");
	return lines.join("\n");
}

export function registerBuiltinCommands(pi: PiCommandApi): void {
	// Ensure default config exists on startup
	ensureDefaultConfig();

	// Register /safety-net command
	pi.registerCommand("safety-net", {
		description: "Manage Safety Net (status, doctor, set)",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			// Parse subcommand
			const parts = trimmed.split(/\s+/);
			const subcommand = parts[0]?.toLowerCase() || "status";

			switch (subcommand) {
				case "status": {
					const config = loadConfig();
					ctx.ui.notify(formatStatus(config), "info");
					break;
				}

				case "doctor": {
					const output = formatDoctor();
					ctx.ui.notify(output, "info");
					break;
				}

				case "set": {
					// /safety-net set key=value
					const keyValue = parts.slice(1).join(" ");
					const eqIndex = keyValue.indexOf("=");
					if (eqIndex <= 0) {
						ctx.ui.notify(
							"Usage: /safety-net set key=value\nExample: /safety-net set worktreeMode=true",
							"warning",
						);
						return;
					}

					const key = keyValue.slice(0, eqIndex).trim();
					const valueStr = keyValue.slice(eqIndex + 1).trim();

					// Parse value
					let value: unknown;
					if (valueStr === "true") value = true;
					else if (valueStr === "false") value = false;
					else if (!Number.isNaN(Number(valueStr))) value = Number(valueStr);
					else value = valueStr;

					// Validate key
					const validKeys = ["strict", "paranoid", "paranoidRm", "paranoidInterpreters", "worktreeMode", "debug"];
					if (!validKeys.includes(key)) {
						ctx.ui.notify(`Invalid key: ${key}\nValid keys: ${validKeys.join(", ")}`, "warning");
						return;
					}

					// Save
					const config = loadConfig();
					config[key] = value;
					saveConfig(config);
					ctx.ui.notify(`Set ${key} = ${value}`, "info");
					break;
				}

				default: {
					// Show help
					ctx.ui.notify(
						[
							"Usage: /safety-net [command]",
							"",
							"Commands:",
							"  status     Show current configuration",
							"  doctor     Run diagnostics",
							"  set K=V    Set a configuration value",
							"",
							"Examples:",
							"  /safety-net status",
							"  /safety-net set worktreeMode=true",
							"  /safety-net set paranoid=false",
						].join("\n"),
						"info",
					);
					break;
				}
			}
		},
	});
}
