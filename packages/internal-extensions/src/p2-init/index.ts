import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

interface ProjectInfo {
	name: string;
	description: string;
	language: string;
	packageManager: string;
	buildCommand: string;
	testCommand: string;
	lintCommand: string;
	framework: string;
	isMonorepo: boolean;
	platform: string;
	shell: string;
}

function detectPlatform(): { platform: string; shell: string } {
	const platform = process.platform;
	if (platform === "win32") {
		return { platform: "Windows", shell: "PowerShell" };
	}
	if (platform === "darwin") {
		return { platform: "macOS", shell: "bash/zsh" };
	}
	return { platform: "Linux", shell: "bash" };
}

function analyzeProject(cwd: string): ProjectInfo {
	const { platform, shell } = detectPlatform();
	const info: ProjectInfo = {
		name: basename(cwd),
		description: "",
		language: "Unknown",
		packageManager: "npm",
		buildCommand: "",
		testCommand: "",
		lintCommand: "",
		framework: "",
		isMonorepo: false,
		platform,
		shell,
	};

	// Check package.json
	const packageJsonPath = join(cwd, "package.json");
	if (existsSync(packageJsonPath)) {
		try {
			const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
			info.name = pkg.name || info.name;
			info.description = pkg.description || "";

			if (pkg.scripts) {
				info.buildCommand = pkg.scripts.build || "";
				info.testCommand = pkg.scripts.test || "";
				info.lintCommand = pkg.scripts.lint || pkg.scripts.check || "";
			}

			if (pkg.workspaces) {
				info.isMonorepo = true;
			}

			if (pkg.devDependencies || pkg.dependencies) {
				const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
				if (allDeps.next || allDeps.nuxt || allDeps.gatsby) {
					info.framework = "Next.js/Nuxt/Gatsby";
				} else if (allDeps.react) {
					info.framework = "React";
				} else if (allDeps.vue) {
					info.framework = "Vue";
				} else if (allDeps.svelte) {
					info.framework = "Svelte";
				} else if (allDeps.express || allDeps.fastify || allDeps.koa) {
					info.framework = "Node.js Backend";
				}
			}

			info.language = "TypeScript/JavaScript";
		} catch {
			// Ignore parse errors
		}
	}

	// Check for Python
	if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
		info.language = "Python";
		info.buildCommand = "python -m build";
		info.testCommand = "pytest";
	}

	// Check for Rust
	if (existsSync(join(cwd, "Cargo.toml"))) {
		info.language = "Rust";
		info.buildCommand = "cargo build";
		info.testCommand = "cargo test";
		info.lintCommand = "cargo clippy";
	}

	// Check for Go
	if (existsSync(join(cwd, "go.mod"))) {
		info.language = "Go";
		info.buildCommand = "go build";
		info.testCommand = "go test";
	}

	return info;
}

function generateAgentsMd(info: ProjectInfo): string {
	const lines: string[] = [];

	lines.push(`# ${info.name}`);
	lines.push("");
	if (info.description) {
		lines.push(info.description);
		lines.push("");
	}

	lines.push("## Platform");
	lines.push(`- OS: ${info.platform}`);
	lines.push(`- Shell: ${info.shell}`);
	lines.push("");

	if (info.platform === "Windows") {
		lines.push("## Windows Commands");
		lines.push("- Use `Get-ChildItem` instead of `find` or `ls`");
		lines.push("- Use `Select-String` instead of `grep`");
		lines.push("- Use `Copy-Item` instead of `cp`");
		lines.push("- Use `Move-Item` instead of `mv`");
		lines.push("- Use `Remove-Item` instead of `rm`");
		lines.push("- Use `New-Item` instead of `mkdir`");
		lines.push('- For bash commands: `& "D:\\dev\\Git\\bin\\bash.exe" -c "command"`');
		lines.push("");
	}

	lines.push("## Development");
	if (info.language !== "Unknown") {
		lines.push(`- Language: ${info.language}`);
	}
	if (info.framework) {
		lines.push(`- Framework: ${info.framework}`);
	}
	if (info.isMonorepo) {
		lines.push("- Monorepo: Yes");
	}
	lines.push("");

	if (info.buildCommand || info.testCommand || info.lintCommand) {
		lines.push("## Commands");
		if (info.buildCommand) {
			lines.push(`- Build: \`${info.buildCommand}\``);
		}
		if (info.testCommand) {
			lines.push(`- Test: \`${info.testCommand}\``);
		}
		if (info.lintCommand) {
			lines.push(`- Lint: \`${info.lintCommand}\``);
		}
		lines.push("");
	}

	lines.push("## Guidelines");
	lines.push("- Read files before making changes");
	lines.push("- Run tests after modifications");
	lines.push("- Follow existing code style");
	lines.push("- Keep changes minimal and focused");
	lines.push("");

	return lines.join("\n");
}

export default function initExtension(pi: ExtensionAPI) {
	console.log("[pi-init] Extension loaded");
	pi.registerCommand("init", {
		description: "Generate AGENTS.md file for the current project",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			console.log("[pi-init] Command handler called with args:", args);
			const cwd = process.cwd();
			const agentsPath = join(cwd, "AGENTS.md");
			console.log("[pi-init] Working directory:", cwd);
			console.log("[pi-init] AGENTS.md path:", agentsPath);

			if (existsSync(agentsPath) && !args.includes("--force")) {
				console.log("[pi-init] AGENTS.md exists, showing warning");
				ctx.ui.notify("AGENTS.md already exists. Use /init --force to overwrite.", "warning");
				return;
			}

			console.log("[pi-init] Analyzing project...");
			const info = analyzeProject(cwd);
			console.log("[pi-init] Project info:", JSON.stringify(info, null, 2));

			const content = generateAgentsMd(info);
			console.log("[pi-init] Generated content length:", content.length);

			writeFileSync(agentsPath, content, "utf-8");
			console.log("[pi-init] File written successfully");
			ctx.ui.notify(`Generated AGENTS.md for ${info.name}`, "success");
		},
	});
	console.log("[pi-init] Command registered");
}
