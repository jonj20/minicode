import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function isLegacyWindowsConsole(): boolean {
	if (process.platform !== "win32") return false;
	if (process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.ConEmuPID) return false;
	return true;
}

import type { AgentSession } from "../../../core/agent-session.ts";
import { areExperimentalFeaturesEnabled } from "../../../core/experimental.ts";
import type { ReadonlyFooterDataProvider } from "../../../core/footer-data-provider.ts";
import { theme } from "../theme/theme.ts";

const TASKS_FILE = join(os.homedir(), ".minicode", "agent", "tasks", "tasks.jsonl");

/**
 * Sanitize text for display in a single-line status.
 * Removes newlines, tabs, carriage returns, and other control characters.
 */
function _buildTaskStatusLine(): string {
	if (!existsSync(TASKS_FILE)) return "";

	try {
		const content = readFileSync(TASKS_FILE, "utf-8");
		const lines = content.split("\n").filter(Boolean);
		const tasks = new Map<string, { id: string; status: string; summary: string }>();

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as Record<string, unknown>;
				if (entry.type !== "task") continue;
				if (entry.action === "create" && entry.task) {
					const task = entry.task as { id: string; status: string; summary: string };
					tasks.set(task.id, { id: task.id, status: task.status, summary: task.summary });
				} else if (entry.action === "update_status" && typeof entry.id === "string") {
					const existing = tasks.get(entry.id);
					if (existing) {
						existing.status = entry.newStatus as string;
					}
				}
			} catch {
				// skip malformed lines
			}
		}

		const inProgress = [...tasks.values()].find((t) => t.status === "in_progress");
		if (!inProgress) return "";

		const summary = sanitizeStatusText(inProgress.summary);
		return `\u25C9 ${summary}`;
	} catch {
		return "";
	}
}

function sanitizeStatusText(text: string): string {
	// Replace newlines, tabs, carriage returns with space, then collapse multiple spaces
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

/**
 * Format token counts for compact footer display.
 */
function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function buildStatusPrefix(ext: ReadonlyMap<string, string>): string {
	const planMode = ext.get("plan-mode");
	return planMode ? `${planMode} ` : "";
}

/**
 * Build keybinding hints for the footer stats line.
 * When idle: show tab/@/$/ prefix hints. When streaming: show esc interrupt.
 */
function buildFooterKeybindingHints(isStreaming: boolean): string {
	if (isStreaming) {
		return theme.fg("text", "esc") + theme.fg("dim", " interrupt");
	}
	const tab = theme.fg("text", "tab") + theme.fg("dim", " 切换模式");
	const addFile = theme.fg("text", "@") + theme.fg("dim", " 添加文件");
	const subagent = theme.fg("text", "$") + theme.fg("dim", " 子智能体");
	const command = theme.fg("text", "/") + theme.fg("dim", " 唤起命令");
	return `${tab}  ${addFile}  ${subagent}  ${command}`;
}

/**
 * Footer component that shows pwd, token stats, and context usage.
 * Computes token/context stats from session, gets git branch and extension statuses from provider.
 */
export class FooterComponent implements Component {
	private autoCompactEnabled = true;
	private session: AgentSession;
	private footerData: ReadonlyFooterDataProvider;

	constructor(session: AgentSession, footerData: ReadonlyFooterDataProvider) {
		this.session = session;
		this.footerData = footerData;
	}

	setSession(session: AgentSession): void {
		this.session = session;
	}

	setAutoCompactEnabled(enabled: boolean): void {
		this.autoCompactEnabled = enabled;
	}

	/**
	 * No-op: git branch caching now handled by provider.
	 * Kept for compatibility with existing call sites in interactive-mode.
	 */
	invalidate(): void {
		// No-op: git branch is cached/invalidated by provider
	}

	/**
	 * Clean up resources.
	 * Git watcher cleanup now handled by provider.
	 */
	dispose(): void {
		// Git watcher cleanup handled by provider
	}

	render(width: number): string[] {
		const state = this.session.state;

		// Calculate cumulative usage from ALL session entries (not just post-compaction messages)
		let totalInput = 0;
		let totalOutput = 0;
		let totalCacheRead = 0;
		let totalCacheWrite = 0;
		let totalCost = 0;
		let latestCacheHitRate: number | undefined;

		for (const entry of this.session.sessionManager.getEntries()) {
			if (entry.type === "message" && entry.message.role === "assistant") {
				totalInput += entry.message.usage.input;
				totalOutput += entry.message.usage.output;
				totalCacheRead += entry.message.usage.cacheRead;
				totalCacheWrite += entry.message.usage.cacheWrite;
				totalCost += entry.message.usage.cost.total;

				const latestPromptTokens =
					entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
				latestCacheHitRate =
					latestPromptTokens > 0 ? (entry.message.usage.cacheRead / latestPromptTokens) * 100 : undefined;
			}
		}

		// Calculate context usage from session (handles compaction correctly).
		// After compaction, tokens are unknown until the next LLM response.
		const contextUsage = this.session.getContextUsage();
		const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
		const contextPercentValue = contextUsage?.percent ?? 0;
		const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

		// Replace home directory with ~
		let pwd = formatCwdForFooter(this.session.sessionManager.getCwd(), process.env.HOME || process.env.USERPROFILE);

		// Add git branch if available
		const branch = this.footerData.getGitBranch();
		if (branch) {
			pwd = `${pwd} (${branch})`;
		}

		// Add session name if set
		const sessionName = this.session.sessionManager.getSessionName();
		if (sessionName) {
			pwd = `${pwd} • ${sessionName}`;
		}

		// Build stats line
		const statsParts = [];
		if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
		if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
		if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
		if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);
		if ((totalCacheRead > 0 || totalCacheWrite > 0) && latestCacheHitRate !== undefined) {
			statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
		}

		// Show cost with "(sub)" indicator if using OAuth subscription
		const usingSubscription = state.model ? this.session.modelRegistry.isUsingOAuth(state.model) : false;
		if (totalCost || usingSubscription) {
			const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
			statsParts.push(costStr);
		}

		// Colorize context percentage based on usage
		let contextPercentStr: string;
		const autoIndicator = this.autoCompactEnabled ? " (auto)" : "";
		const contextPercentDisplay =
			contextPercent === "?"
				? `?/${formatTokens(contextWindow)}${autoIndicator}`
				: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
		if (contextPercentValue > 90) {
			contextPercentStr = theme.fg("error", contextPercentDisplay);
		} else if (contextPercentValue > 70) {
			contextPercentStr = theme.fg("warning", contextPercentDisplay);
		} else {
			contextPercentStr = contextPercentDisplay;
		}
		statsParts.push(contextPercentStr);
		if (areExperimentalFeaturesEnabled()) {
			statsParts.push(`${theme.fg("dim", "•")} ${theme.bold(theme.fg("warning", "xp"))}`);
		}

		const statsLeft = statsParts.join(" ");

		// Add model name on the right side, plus thinking level if model supports it
		const modelName = state.model?.id || "no-model";

		// Build LLM info line
		let llmInfo = modelName;
		if (state.model?.reasoning) {
			const thinkingLevel = state.thinkingLevel || "off";
			llmInfo = thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
		}
		if (this.footerData.getAvailableProviderCount() > 1 && state.model) {
			llmInfo = `(${state.model!.provider}) ${llmInfo}`;
		}

		// Apply colors
		const dimStatsLeft = theme.fg("dim", statsLeft);
		const softWhiteLlm = theme.fg("softWhite", llmInfo);

		// When sidebar is present, footer only gets (width - sidebarWidth) columns
		// Sidebar is 5 chars wide (│ + 4 content chars)
		const hasSidebar = !isLegacyWindowsConsole();
		const footerWidth = hasSidebar ? width - 5 : width;

		const _pwdLine = truncateToWidth(theme.fg("dim", pwd), footerWidth, theme.fg("dim", "..."));
		// On legacy Windows (no sidebar), show pwd and extension statuses in footer
		const statusPrefix = buildStatusPrefix(this.footerData.getExtensionStatuses());
		const truncatedLlm = truncateToWidth(statusPrefix + softWhiteLlm, footerWidth, theme.fg("softWhite", "..."));

		// Build stats line with keybinding hints on the right
		const isStreaming = this.session.isStreaming;
		const hints = buildFooterKeybindingHints(isStreaming);
		const dimHints = theme.fg("dim", hints);

		// Calculate available width for stats + hints
		const statsVisibleWidth = visibleWidth(dimStatsLeft);
		const hintsVisibleWidth = visibleWidth(dimHints);
		const gap = 2;
		let truncatedStats: string;
		if (statsVisibleWidth + gap + hintsVisibleWidth <= footerWidth) {
			// Both fit: stats on left, hints on right with padding
			const padding = " ".repeat(Math.max(0, footerWidth - statsVisibleWidth - hintsVisibleWidth));
			truncatedStats = dimStatsLeft + padding + dimHints;
		} else {
			// Truncate stats to make room for hints
			const maxStatsWidth = Math.max(0, footerWidth - hintsVisibleWidth - gap);
			const truncatedStatsText = truncateToWidth(dimStatsLeft, maxStatsWidth, theme.fg("dim", "..."));
			truncatedStats =
				truncatedStatsText +
				" ".repeat(Math.max(0, footerWidth - visibleWidth(truncatedStatsText) - hintsVisibleWidth)) +
				dimHints;
		}
		const lines = hasSidebar ? [truncatedLlm, truncatedStats] : [_pwdLine, truncatedLlm, truncatedStats];

		if (!hasSidebar) {
			// Extension statuses — shown in footer when sidebar unavailable
			const extensionStatuses = this.footerData.getExtensionStatuses();
			if (extensionStatuses.size > 0) {
				const sortedStatuses = Array.from(extensionStatuses.entries())
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([, text]) => sanitizeStatusText(text));
				const statusLine = sortedStatuses.join(" ");
				lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
			}
		}

		return lines;
	}
}
