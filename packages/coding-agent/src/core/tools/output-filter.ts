import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "./truncate.ts";

export type CommandCategory =
	| "ls"
	| "git"
	| "npm"
	| "grep"
	| "find"
	| "build"
	| "test"
	| "output"
	| "docker"
	| "system"
	| "network"
	| "archive"
	| "general";

export interface OutputFilterConfig {
	maxLines: number;
	maxBytes: number;
}

const PER_CATEGORY_LIMITS: Record<CommandCategory, OutputFilterConfig> = {
	ls: { maxLines: 200, maxBytes: 10 * 1024 },
	git: { maxLines: 400, maxBytes: 25 * 1024 },
	npm: { maxLines: 100, maxBytes: 10 * 1024 },
	grep: { maxLines: 500, maxBytes: 30 * 1024 },
	find: { maxLines: 500, maxBytes: 30 * 1024 },
	build: { maxLines: 200, maxBytes: 20 * 1024 },
	test: { maxLines: 300, maxBytes: 30 * 1024 },
	docker: { maxLines: 150, maxBytes: 15 * 1024 },
	system: { maxLines: 100, maxBytes: 10 * 1024 },
	network: { maxLines: 150, maxBytes: 15 * 1024 },
	archive: { maxLines: 100, maxBytes: 10 * 1024 },
	output: { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES },
	general: { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES },
};

export function classifyCommand(command: string): CommandCategory {
	const trimmed = command.trim();

	if (/^(?:ls|dir|tree|e?xdir|Get-ChildItem|gci)\b/i.test(trimmed)) return "ls";
	if (/^git\b/i.test(trimmed)) return "git";
	if (/^(?:npm|pnpm|yarn|bun|npx)\b/i.test(trimmed)) return "npm";
	if (/^(?:grep|rg|ag|ack|findstr|Select-String|sls)\b/i.test(trimmed)) return "grep";
	if (/^find\b/i.test(trimmed)) return "find";
	if (/^(?:npm run (?:build|compile|tsc|typecheck)|tsc|webpack|vite build|esbuild|rollup)\b/i.test(trimmed))
		return "build";
	if (/^(?:npm (?:test|run test)|vitest|jest|mocha|ava|nyc)\b/i.test(trimmed)) return "test";
	if (/^(?:docker|podman|container)\b/i.test(trimmed)) return "docker";
	if (/^(?:systemctl|service|ps|top|htop|free|df|du|uptime)\b/i.test(trimmed)) return "system";
	if (/^(?:curl|wget|ping|traceroute|nslookup|dig|netstat|ss)\b/i.test(trimmed)) return "network";
	if (/^(?:tar|zip|unzip|gzip|gunzip|7z|rar)\b/i.test(trimmed)) return "archive";

	const shortOutputPatterns = /^(?:echo|printf|cat|type|where|which|pwd|whoami|hostname|date|time)\b/i;
	if (shortOutputPatterns.test(trimmed)) return "output";

	return "general";
}

export function getOutputFilterConfig(command: string): OutputFilterConfig {
	const category = classifyCommand(command);
	return PER_CATEGORY_LIMITS[category];
}

export interface OutputSummary {
	totalLines: number;
	totalBytes: number;
	firstLines: string[];
	lastLines: string[];
	errorLines: string[];
	hasError: boolean;
}

export function summarizeOutput(output: string, maxLines: number = 10): OutputSummary {
	const lines = output.split("\n");
	const totalLines = lines.length;
	const totalBytes = Buffer.byteLength(output, "utf-8");

	const firstLines = lines.slice(0, maxLines);
	const lastLines = lines.slice(-maxLines);

	const errorLines = lines.filter(
		(line) =>
			line.toLowerCase().includes("error") ||
			line.toLowerCase().includes("warning") ||
			line.toLowerCase().includes("fatal") ||
			line.toLowerCase().includes("failed"),
	);

	return {
		totalLines,
		totalBytes,
		firstLines,
		lastLines,
		errorLines,
		hasError: errorLines.length > 0,
	};
}

export function formatOutputSummary(summary: OutputSummary): string {
	const parts: string[] = [];

	parts.push(`[Output: ${summary.totalLines} lines, ${(summary.totalBytes / 1024).toFixed(1)}KB]`);

	if (summary.hasError) {
		parts.push(`[Errors/Warnings: ${summary.errorLines.length} lines]`);
		if (summary.errorLines.length > 0) {
			parts.push("Error highlights:");
			summary.errorLines.slice(0, 5).forEach((line) => {
				parts.push(`  ${line.trim()}`);
			});
		}
	}

	return parts.join("\n");
}
