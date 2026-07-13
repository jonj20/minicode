import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DP, evaluateDpCompaction, extractSessionStats, findPrevCompactionIndex } from "./dp-algorithm.ts";
import { getState, isEnabled, resolveStrategy } from "./hooks.ts";

export function registerCommands(pi: ExtensionAPI): void {
	// ─── /context-compact: unified status panel ───────────────────────────────
	pi.registerCommand("context-compact", {
		description: "Show unified context-compact status",
		handler: async (_args, ctx) => {
			const strategy = resolveStrategy(ctx, pi);
			const usage = ctx.getContextUsage();
			const s = getState(ctx.sessionManager.getSessionFile());
			const entries = ctx.sessionManager.getBranch();
			const stats = extractSessionStats(entries);
			const smallCtx = isEnabled(ctx, pi);

			const lines = [
				`Context Compact Status`,
				`Tier: ${strategy.tier} (${s.contextWindow.toLocaleString()} tokens)`,
				`Small context: ${smallCtx ? "yes" : "no"}`,
				`Context: ${(usage?.tokens ?? 0).toLocaleString()}/${s.contextWindow.toLocaleString()} (${(s.lastUsagePercent * 100).toFixed(1)}%)`,
				`Compact threshold: ${(strategy.compactThreshold * 100).toFixed(0)}%`,
				`Early compact at: ${(strategy.earlyCompactAt * 100).toFixed(0)}%`,
				`Auto-compactions: ${s.compactionsTriggered}`,
				`DP cancelled: ${s.dpCancelled}`,
				`Reserve: ${strategy.reserveTokens.toLocaleString()} tokens`,
				`Tool output: ${strategy.maxToolOutputLines} lines / ${(strategy.maxToolOutputBytes / 1024).toFixed(0)}KB`,
				`Turns: ${stats.turnCount}, Agent requests: ${stats.agentRequestCount}`,
				`Avg input tokens: ${stats.avgInputTokens}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ─── /dp-status: DP compaction status ──────────────────────────────────────
	pi.registerCommand("dp-status", {
		description: "Show DP compaction status and parameters",
		handler: async (_args, ctx) => {
			const usage = ctx.getContextUsage();
			const state = getState(ctx.sessionManager.getSessionFile());
			const entries = ctx.sessionManager.getBranch();
			const stats = extractSessionStats(entries);
			ctx.ui.notify(
				[
					`DP Compaction Status`,
					`Context: ${usage?.tokens ?? "?"} / ${usage?.contextWindow ?? "?"} tokens`,
					`Usage: ${usage?.percent?.toFixed(1) ?? "?"}%`,
					`Turns: ${stats.turnCount}, Agent requests: ${stats.agentRequestCount}`,
					`Avg input tokens: ${stats.avgInputTokens}`,
					`Compactions: ${stats.compactionCount}, Cancelled: ${state.dpCancelled}`,
					`Params: P_INPUT=${DP.P_INPUT} P_CACHE=${DP.P_CACHE} R=${DP.R} BETA=${DP.BETA}`,
				].join("\n"),
				"info",
			);
		},
	});

	// ─── /dp-eval: evaluate DP decision now ────────────────────────────────────
	pi.registerCommand("dp-eval", {
		description: "Evaluate DP compaction decision now",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getBranch();
			const usage = ctx.getContextUsage();
			const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 200000;
			const tokensBefore = usage?.tokens ?? 0;
			const prevCompactionIndex = findPrevCompactionIndex(entries);
			const dpResult = evaluateDpCompaction(entries, prevCompactionIndex, tokensBefore, contextWindow);
			if (!dpResult) {
				ctx.ui.notify("DP: no valid cut point found", "warning");
				return;
			}
			ctx.ui.notify(
				[
					`DP Evaluation`,
					`Net benefit: ${dpResult.netBenefit.toFixed(6)}`,
					`Force: ${dpResult.force}`,
					`Keep: ${dpResult.K} tokens, History: ${dpResult.H} tokens`,
					`Decision: ${dpResult.netBenefit > 0 || dpResult.force ? "COMPACT" : "SKIP"}`,
				].join("\n"),
				"info",
			);
		},
	});
}
