/**
 * Unified compaction strategy.
 *
 * Coordinates between context-compact (simple compression) and
 * context-handoff (full context replacement) based on context usage.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface CompactionDecision {
	strategy: "none" | "compact" | "handoff";
	reason: string;
	contextPercent: number;
}

export interface CompactionStrategyConfig {
	compactThreshold: number;
	handoffThreshold: number;
	forcedCompactThreshold: number;
}

/**
 * Decide compaction strategy based on context usage.
 */
export function decideCompactionStrategy(
	contextPercent: number,
	config: CompactionStrategyConfig = { compactThreshold: 50, handoffThreshold: 70, forcedCompactThreshold: 85 },
): CompactionDecision {
	if (contextPercent >= config.forcedCompactThreshold) {
		return {
			strategy: "compact",
			reason: `Context at ${Math.round(contextPercent)}% — emergency compact to prevent overflow`,
			contextPercent,
		};
	}

	if (contextPercent >= config.handoffThreshold) {
		return {
			strategy: "handoff",
			reason: `Context at ${Math.round(contextPercent)}% — handoff recommended for clean restart`,
			contextPercent,
		};
	}

	if (contextPercent >= config.compactThreshold) {
		return {
			strategy: "compact",
			reason: `Context at ${Math.round(contextPercent)}% — simple compact to free space`,
			contextPercent,
		};
	}

	return {
		strategy: "none",
		reason: `Context at ${Math.round(contextPercent)}% — no action needed`,
		contextPercent,
	};
}

/**
 * Get adaptive defaults based on context window size.
 */
function getAdaptiveDefaults(contextWindow: number | null): CompactionStrategyConfig {
	if (contextWindow === null) return { compactThreshold: 50, handoffThreshold: 70, forcedCompactThreshold: 85 };
	if (contextWindow <= 32_000) return { compactThreshold: 60, handoffThreshold: 80, forcedCompactThreshold: 90 };
	if (contextWindow <= 64_000) return { compactThreshold: 55, handoffThreshold: 75, forcedCompactThreshold: 88 };
	if (contextWindow <= 128_000) return { compactThreshold: 50, handoffThreshold: 70, forcedCompactThreshold: 85 };
	return { compactThreshold: 40, handoffThreshold: 60, forcedCompactThreshold: 80 };
}

/**
 * Get strategy config. CLI flags override adaptive defaults.
 */
export function getStrategyConfig(pi: ExtensionAPI, contextWindow?: number | null): CompactionStrategyConfig {
	const defaults = getAdaptiveDefaults(contextWindow ?? null);
	return {
		compactThreshold: Number(pi.getFlag("compact-threshold")) || defaults.compactThreshold,
		handoffThreshold: Number(pi.getFlag("handoff-threshold")) || defaults.handoffThreshold,
		forcedCompactThreshold: Number(pi.getFlag("forced-compact-threshold")) || defaults.forcedCompactThreshold,
	};
}
