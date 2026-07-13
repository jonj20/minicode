export type CompressionTier = "aggressive" | "balanced" | "conservative";

export interface CompressionStrategy {
	tier: CompressionTier;
	compactThreshold: number;
	reserveTokens: number;
	maxToolOutputLines: number;
	maxToolOutputBytes: number;
	summaryQuality: "fast" | "standard" | "detailed";
	enableAutoCompact: boolean;
	earlyCompactAt: number;
}

const STRATEGIES: Record<CompressionTier, CompressionStrategy> = {
	aggressive: {
		tier: "aggressive",
		compactThreshold: 0.6,
		reserveTokens: 8192,
		maxToolOutputLines: 200,
		maxToolOutputBytes: 8 * 1024,
		summaryQuality: "fast",
		enableAutoCompact: true,
		earlyCompactAt: 0.55,
	},
	balanced: {
		tier: "balanced",
		compactThreshold: 0.75,
		reserveTokens: 16384,
		maxToolOutputLines: 1000,
		maxToolOutputBytes: 32 * 1024,
		summaryQuality: "standard",
		enableAutoCompact: true,
		earlyCompactAt: 0.7,
	},
	conservative: {
		tier: "conservative",
		compactThreshold: 0.88,
		reserveTokens: 32768,
		maxToolOutputLines: 2000,
		maxToolOutputBytes: 64 * 1024,
		summaryQuality: "detailed",
		enableAutoCompact: true,
		earlyCompactAt: 0.85,
	},
};

export function detectTier(contextWindow: number): CompressionTier {
	if (contextWindow <= 16384) return "aggressive";
	if (contextWindow <= 128000) return "balanced";
	return "conservative";
}

export function getStrategy(contextWindow: number): CompressionStrategy {
	return STRATEGIES[detectTier(contextWindow)];
}

export function getStrategyByName(name: string): CompressionStrategy | undefined {
	return STRATEGIES[name as CompressionTier];
}
