import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { estimateTokens } from "@earendil-works/pi-coding-agent";

// ─── DP Parameters ───────────────────────────────────────────────────────────

export const DP_DEFAULTS = {
	P_INPUT: 3.0,
	P_CACHE: 0.3,
	P_OUT: 15.0,
	V: 5000,
	S: 500,
	L: 0,
	BASELINE_E: 8,
	E_FIXED: 0,
	R: 0.8,
	BETA: 0.03,
	QUALITY_PENALTY: 0.2,
	MIN_KEEP_RATIO: 0.12,
	FORCE_THRESHOLD: 0.9,
	CHECK_THRESHOLD: 0.6,
} as const;

type DpKey = keyof typeof DP_DEFAULTS;

export function readDpEnv(key: DpKey, envName: string): number {
	const raw = process.env[envName];
	if (raw === undefined) return DP_DEFAULTS[key];
	const val = Number(raw);
	if (!Number.isFinite(val)) {
		console.warn(`[adaptive-compact] Invalid ${envName}=${raw}, using default ${DP_DEFAULTS[key]}`);
		return DP_DEFAULTS[key];
	}
	return val;
}

export const DP = {
	P_INPUT: readDpEnv("P_INPUT", "DP_P_INPUT"),
	P_CACHE: readDpEnv("P_CACHE", "DP_P_CACHE"),
	P_OUT: readDpEnv("P_OUT", "DP_P_OUT"),
	V: readDpEnv("V", "DP_V"),
	S: readDpEnv("S", "DP_S"),
	L: readDpEnv("L", "DP_L"),
	BASELINE_E: readDpEnv("BASELINE_E", "DP_BASELINE_E"),
	E_FIXED: readDpEnv("E_FIXED", "DP_E_FIXED"),
	R: readDpEnv("R", "DP_R"),
	BETA: readDpEnv("BETA", "DP_BETA"),
	QUALITY_PENALTY: readDpEnv("QUALITY_PENALTY", "DP_QUALITY_PENALTY"),
	MIN_KEEP_RATIO: readDpEnv("MIN_KEEP_RATIO", "DP_MIN_KEEP_RATIO"),
	FORCE_THRESHOLD: readDpEnv("FORCE_THRESHOLD", "DP_FORCE_THRESHOLD"),
	CHECK_THRESHOLD: readDpEnv("CHECK_THRESHOLD", "DP_CHECK_THRESHOLD"),
};

// ─── File Operations ─────────────────────────────────────────────────────────

export function createFileOps() {
	return { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() };
}

export function extractFileOpsFromMessage(message: AgentMessage, fileOps: ReturnType<typeof createFileOps>) {
	if (message.role !== "assistant") return;
	if (!("content" in message) || !Array.isArray(message.content)) return;
	for (const block of message.content) {
		if (typeof block !== "object" || block === null) continue;
		if (!("type" in block) || block.type !== "toolCall") continue;
		if (!("arguments" in block) || !("name" in block)) continue;
		const args = (block as { arguments?: Record<string, unknown>; name?: string }).arguments;
		if (!args) continue;
		const filePath = typeof args.path === "string" ? args.path : undefined;
		if (!filePath) continue;
		switch ((block as { name: string }).name) {
			case "read":
				fileOps.read.add(filePath);
				break;
			case "write":
				fileOps.written.add(filePath);
				break;
			case "edit":
				fileOps.edited.add(filePath);
				break;
		}
	}
}

export function computeFileLists(fileOps: ReturnType<typeof createFileOps>) {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
	const modifiedFiles = [...modified].sort();
	return { readFiles: readOnly, modifiedFiles };
}

export function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	if (modifiedFiles.length > 0) sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	if (sections.length === 0) return "";
	return `\n\n${sections.join("\n\n")}`;
}

export function extractFileOperationsFromMessages(messages: AgentMessage[]) {
	const fileOps = createFileOps();
	for (const msg of messages) extractFileOpsFromMessage(msg, fileOps);
	return fileOps;
}

// ─── Entry Estimation ────────────────────────────────────────────────────────

export function estimateEntryTokens(entry: SessionEntry): number {
	if (entry.type === "message") return estimateTokens(entry.message);
	if (entry.type === "custom_message") {
		const content = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
		return Math.ceil(content.length / 4) + 1;
	}
	if (entry.type === "branch_summary") return Math.ceil(entry.summary.length / 4) + 1;
	return 0;
}

// ─── Message Extraction ──────────────────────────────────────────────────────

export function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") return entry.message;
	if (entry.type === "custom_message") {
		return {
			role: "custom",
			customType: entry.customType,
			content: typeof entry.content === "string" ? [{ type: "text", text: entry.content }] : entry.content,
			display: entry.display,
			details: entry.details,
			timestamp: new Date(entry.timestamp).getTime(),
		} as AgentMessage;
	}
	if (entry.type === "branch_summary") {
		return {
			role: "branchSummary",
			summary: entry.summary,
			fromId: entry.fromId,
			timestamp: new Date(entry.timestamp).getTime(),
		} as unknown as AgentMessage;
	}
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: new Date(entry.timestamp).getTime(),
		} as unknown as AgentMessage;
	}
	return undefined;
}

export function getMessageFromEntryForCompaction(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "compaction") return undefined;
	return getMessageFromEntry(entry);
}

// ─── Cut Point Logic ─────────────────────────────────────────────────────────

export function isUserLikeEntry(entry: SessionEntry): boolean {
	if (entry.type === "message") {
		const role = entry.message.role;
		return role === "user" || role === "bashExecution" || role === "custom";
	}
	return entry.type === "custom_message" || entry.type === "branch_summary";
}

export function isValidCutPoint(entry: SessionEntry): boolean {
	if (entry.type === "message") {
		const role = entry.message.role;
		return (
			role === "user" ||
			role === "assistant" ||
			role === "bashExecution" ||
			role === "custom" ||
			role === "branchSummary" ||
			role === "compactionSummary"
		);
	}
	return entry.type === "custom_message" || entry.type === "branch_summary";
}

export function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, startIndex: number): number {
	for (let i = entryIndex; i >= startIndex; i--) {
		if (isUserLikeEntry(entries[i])) return i;
	}
	return -1;
}

export interface CutPointCandidate {
	firstKeptEntryIndex: number;
	turnStartIndex: number;
	isSplitTurn: boolean;
}

export function buildCutPointCandidates(
	entries: SessionEntry[],
	boundaryStart: number,
	boundaryEnd: number,
): CutPointCandidate[] {
	const candidates: CutPointCandidate[] = [];
	for (let i = boundaryStart; i < boundaryEnd; i++) {
		if (!isValidCutPoint(entries[i])) continue;
		const isUser = isUserLikeEntry(entries[i]);
		const turnStart = isUser ? -1 : findTurnStartIndex(entries, i, boundaryStart);
		candidates.push({ firstKeptEntryIndex: i, turnStartIndex: turnStart, isSplitTurn: !isUser && turnStart !== -1 });
	}
	return candidates;
}

// ─── Session Stats ───────────────────────────────────────────────────────────

export interface SessionStats {
	turnCount: number;
	agentRequestCount: number;
	avgInputTokens: number;
	compactionCount: number;
	currentTurnIndex: number;
}

export function extractSessionStats(entries: SessionEntry[]): SessionStats {
	let turnCount = 0,
		agentRequestCount = 0,
		totalInputTokens = 0,
		inputCount = 0,
		compactionCount = 0;
	for (const entry of entries) {
		if (entry.type === "compaction") compactionCount++;
		if (entry.type === "message" && entry.message.role === "assistant") {
			agentRequestCount++;
			const msg = entry.message;
			if ("usage" in msg && msg.usage) {
				const usage = msg.usage as {
					totalTokens?: number;
					input?: number;
					output?: number;
					cacheRead?: number;
					cacheWrite?: number;
				};
				const ctxTokens =
					usage.totalTokens ??
					(usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
				totalInputTokens += ctxTokens;
				inputCount++;
			}
		}
		if (entry.type === "message" && isUserLikeEntry(entry)) turnCount++;
	}
	return {
		turnCount,
		agentRequestCount,
		avgInputTokens: inputCount > 0 ? Math.floor(totalInputTokens / inputCount) : 4000,
		compactionCount,
		currentTurnIndex: turnCount,
	};
}

export function findPrevCompactionIndex(entries: SessionEntry[]): number {
	for (let i = entries.length - 1; i >= 0; i--) if (entries[i].type === "compaction") return i;
	return -1;
}

// ─── DP Cost Function ────────────────────────────────────────────────────────

export function computeNetBenefit(
	K: number,
	H: number,
	T: number,
	V: number,
	S: number,
	R_est: number,
	avg: number,
	compactionCount: number,
	contextWindow: number,
): number {
	const r_t = Math.max(DP.R ** (compactionCount + 1), 0.37);
	const M = contextWindow;
	const term1 = ((R_est - 1) * DP.P_CACHE * H) / 1e6;
	const term2 = ((S + K) * (DP.P_INPUT - DP.P_CACHE)) / 1e6;
	const L_instr = 70;
	const term3 = (DP.P_CACHE * (V + H) + DP.P_INPUT * L_instr + DP.P_OUT * S) / 1e6;
	const term4 = (DP.BETA * (1 - r_t) * R_est * avg * DP.P_INPUT) / 1e6;
	let term5 = 0;
	if (T > M * 0.3) term5 = (DP.QUALITY_PENALTY * DP.P_INPUT * ((V + T) ** 2 - (V + K) ** 2)) / (M * 1e6);
	return term1 - term2 - term3 - term4 + term5;
}

// ─── DP Evaluation ───────────────────────────────────────────────────────────

export interface DpResult {
	firstKeptEntryIndex: number;
	firstKeptEntryId: string;
	turnStartIndex: number;
	isSplitTurn: boolean;
	netBenefit: number;
	K: number;
	H: number;
	T: number;
	force: boolean;
}

export function evaluateDpCompaction(
	entries: SessionEntry[],
	prevCompactionIndex: number,
	contextTokens: number,
	contextWindow: number,
): DpResult | undefined {
	let boundaryStart = 0;
	if (prevCompactionIndex >= 0) {
		const prevEntry = entries[prevCompactionIndex];
		if (prevEntry.type === "compaction" && prevEntry.firstKeptEntryId) {
			const keptIndex = entries.findIndex((e) => e.id === prevEntry.firstKeptEntryId);
			boundaryStart = keptIndex >= 0 ? keptIndex : prevCompactionIndex + 1;
		} else boundaryStart = prevCompactionIndex + 1;
	}
	const boundaryEnd = entries.length;
	if (boundaryStart >= boundaryEnd) return undefined;

	const entryTokens: number[] = entries.map((e) => estimateEntryTokens(e));
	const prefix = new Array<number>(entryTokens.length + 1);
	prefix[0] = 0;
	for (let i = 0; i < entryTokens.length; i++) prefix[i + 1] = prefix[i] + entryTokens[i];
	const rangeSum = (from: number, to: number) => prefix[to] - prefix[from];
	const T = rangeSum(boundaryStart, boundaryEnd);
	const V = DP.V;
	const stats = extractSessionStats(entries);
	const E =
		DP.E_FIXED > 0 ? DP.E_FIXED : Math.max(Math.floor(DP.BASELINE_E / 2), DP.BASELINE_E - stats.currentTurnIndex);
	const L = DP.L > 0 ? DP.L : stats.turnCount > 0 ? stats.agentRequestCount / stats.turnCount : 1;
	const R_est = Math.max(1, E * L);
	const avg = stats.avgInputTokens;
	const candidates = buildCutPointCandidates(entries, boundaryStart, boundaryEnd);
	if (candidates.length === 0) return undefined;
	const minKeep = Math.max(3, Math.floor(candidates.length * DP.MIN_KEEP_RATIO));
	let best: DpResult | undefined;
	for (let idx = minKeep; idx < candidates.length; idx++) {
		const cand = candidates[candidates.length - 1 - idx];
		if (!cand) continue;
		const K = rangeSum(cand.firstKeptEntryIndex, boundaryEnd);
		const historyEnd = cand.isSplitTurn ? cand.turnStartIndex : cand.firstKeptEntryIndex;
		const H = rangeSum(boundaryStart, historyEnd);
		if (H <= 0) continue;
		const netBenefit = computeNetBenefit(K, H, T, V, DP.S, R_est, avg, stats.compactionCount, contextWindow);
		if (!best || netBenefit > best.netBenefit) {
			const firstKeptEntry = entries[cand.firstKeptEntryIndex];
			if (!firstKeptEntry?.id) continue;
			best = {
				firstKeptEntryIndex: cand.firstKeptEntryIndex,
				firstKeptEntryId: firstKeptEntry.id,
				turnStartIndex: cand.turnStartIndex,
				isSplitTurn: cand.isSplitTurn,
				netBenefit,
				K,
				H,
				T,
				force: false,
			};
		}
	}
	if (!best) return undefined;
	const usagePercent = contextWindow > 0 ? contextTokens / contextWindow : 0;
	if (usagePercent >= DP.FORCE_THRESHOLD) best.force = true;
	return best;
}
