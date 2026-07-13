import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";
import { decideCompactionStrategy, getStrategyConfig } from "./compaction-strategy.ts";
import {
	computeFileLists,
	DP,
	evaluateDpCompaction,
	extractFileOperationsFromMessages,
	findPrevCompactionIndex,
	formatFileOperations,
	getMessageFromEntryForCompaction,
} from "./dp-algorithm.ts";
import type { CompressionStrategy } from "./strategies.ts";
import { detectTier, getStrategy, getStrategyByName } from "./strategies.ts";

// ─── Summarization Prompts ───────────────────────────────────────────────────

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

// ─── Summarization Helpers ───────────────────────────────────────────────────

async function runSummarization(
	promptText: string,
	model: { reasoning?: boolean; maxTokens?: number },
	maxTokens: number,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	signal: AbortSignal,
	errorLabel: string,
): Promise<string> {
	const summarizationMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];
	const options: Record<string, unknown> = { maxTokens, signal };
	if (apiKey) options.apiKey = apiKey;
	if (headers) options.headers = headers;
	if (model.reasoning) options.reasoning = "medium";
	const response = await completeSimple(
		model as Parameters<typeof completeSimple>[0],
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		options as Parameters<typeof completeSimple>[2],
	);
	if (response.stopReason === "error") throw new Error(`${errorLabel}: ${response.errorMessage || "Unknown error"}`);
	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

async function generateSummary(
	messages: AgentMessage[],
	model: Parameters<typeof completeSimple>[0],
	reserveTokens: number,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	signal: AbortSignal,
	customInstructions: string | undefined,
	previousSummary: string | undefined,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.8 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
	let basePrompt = previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
	if (customInstructions) basePrompt = `${basePrompt}\n\nAdditional focus: ${customInstructions}`;
	const conversationText = serializeConversation(convertToLlm(messages));
	let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
	if (previousSummary) promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
	promptText += basePrompt;
	return runSummarization(promptText, model, maxTokens, apiKey, headers, signal, "Summarization failed");
}

async function generateTurnPrefixSummary(
	messages: AgentMessage[],
	model: Parameters<typeof completeSimple>[0],
	reserveTokens: number,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	signal: AbortSignal,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.5 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
	const conversationText = serializeConversation(convertToLlm(messages));
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\nThis is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.

Summarize the prefix to provide context for the retained suffix:

## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key decisions and work done in the prefix]

## Context for Suffix
- [Information needed to understand the retained recent work]

Be concise. Focus on what is needed to understand the kept suffix.`;
	return runSummarization(promptText, model, maxTokens, apiKey, headers, signal, "Turn prefix summarization failed");
}

// ─── State ───────────────────────────────────────────────────────────────────

interface AdaptiveCompactState {
	tier: string;
	contextWindow: number;
	compactionsTriggered: number;
	lastUsagePercent: number;
	dpCancelled: number;
	lastTokens: number | null;
}

const sessionState = new Map<string, AdaptiveCompactState>();
let ephemeralCounter = 0;
let lastCompactTurn = 0;
const COMPACT_COOLDOWN_TURNS = 5;

function getState(sessionFile: string | undefined): AdaptiveCompactState {
	const key = sessionFile ?? `ephemeral-${++ephemeralCounter}`;
	if (!sessionState.has(key)) {
		sessionState.set(key, {
			tier: "auto",
			contextWindow: 0,
			compactionsTriggered: 0,
			lastUsagePercent: 0,
			dpCancelled: 0,
			lastTokens: null,
		});
	}
	return sessionState.get(key)!;
}

function resolveStrategy(ctx: { model?: { contextWindow?: number } }, pi: ExtensionAPI): CompressionStrategy {
	const override = pi.getFlag("compression-tier") as string;
	if (override) {
		const forced = getStrategyByName(override);
		if (forced) return forced;
	}
	const cw = ctx.model?.contextWindow ?? 128000;
	return getStrategy(cw);
}

function isEnabled(ctx: { model?: { contextWindow?: number } }, pi: ExtensionAPI): boolean {
	const cw = ctx.model?.contextWindow ?? 128000;
	return (pi.getFlag("small-context") as boolean) || cw <= 16384;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function registerHooks(pi: ExtensionAPI): void {
	// Session start: initialize state
	pi.on("session_start", async (_event, ctx) => {
		const s = getState(ctx.sessionManager.getSessionFile());
		const cw = ctx.model?.contextWindow ?? 128000;
		s.contextWindow = cw;
		s.tier = detectTier(cw);
		s.compactionsTriggered = 0;
		s.lastUsagePercent = 0;
		s.dpCancelled = 0;
		s.lastTokens = null;
	});

	// Tool result: soft compression - keep head+tail, summarize middle
	pi.on("tool_result", async (event, ctx) => {
		const strategy = resolveStrategy(ctx, pi);
		const newContent = event.content.map((block) => {
			if (block.type !== "text") return block;
			const lines = block.text.split("\n");
			const totalLines = lines.length;

			// Check line limit
			if (totalLines > strategy.maxToolOutputLines) {
				const keepHead = Math.floor(strategy.maxToolOutputLines * 0.7);
				const keepTail = strategy.maxToolOutputLines - keepHead;
				const head = lines.slice(0, keepHead);
				const tail = lines.slice(-keepTail);
				const skipped = totalLines - keepHead - keepTail;
				return {
					...block,
					text: `${head.join("\n")}\n\n... [${skipped} lines compressed, showing beginning and end ...]\n\n${tail.join("\n")}`,
				};
			}

			// Check byte limit
			const encoder = new TextEncoder();
			const bytes = encoder.encode(block.text).length;
			if (bytes > strategy.maxToolOutputBytes) {
				const maxChars = Math.floor(strategy.maxToolOutputBytes * 1.5);
				const headChars = Math.floor(maxChars * 0.7);
				const tailChars = maxChars - headChars;
				const head = block.text.slice(0, headChars);
				const tail = block.text.slice(-tailChars);
				const skippedKB = ((bytes - headChars - tailChars) / 1024).toFixed(0);
				return {
					...block,
					text: `${head}\n\n... [${skippedKB}KB compressed, showing beginning and end ...]\n\n${tail}`,
				};
			}

			return block;
		});
		if (JSON.stringify(newContent) !== JSON.stringify(event.content)) return { content: newContent };
	});

	// Before agent start: inject system prompt guidance
	pi.on("before_agent_start", async (event, ctx) => {
		const strategy = resolveStrategy(ctx, pi);
		const s = getState(ctx.sessionManager.getSessionFile());
		const tierLabel = s.tier;
		const cw = s.contextWindow;
		return {
			systemPrompt:
				event.systemPrompt +
				`

## Adaptive Compression (${tierLabel} mode, ${cw.toLocaleString()} tokens)
- Tool output limits: ${strategy.maxToolOutputLines} lines / ${(strategy.maxToolOutputBytes / 1024).toFixed(0)}KB max
- Compact threshold: ${(strategy.compactThreshold * 100).toFixed(0)}% context usage
- Reserve: ${strategy.reserveTokens.toLocaleString()} tokens for response
- Keep responses concise. Prefer targeted reads (offset/limit) over full files.`,
		};
	});

	// Turn end: early compaction trigger (unified strategy)
	let currentTurn = 0;
	pi.on("turn_end", async (_event, ctx) => {
		currentTurn++;
		const strategy = resolveStrategy(ctx, pi);
		if (!strategy.enableAutoCompact) return;
		const usage = ctx.getContextUsage();
		if (!usage?.tokens || !usage.contextWindow) return;
		const percent = usage.tokens / usage.contextWindow;
		const s = getState(ctx.sessionManager.getSessionFile());
		s.lastUsagePercent = percent;

		// Use unified strategy to decide action (adaptive based on context window)
		const config = getStrategyConfig(pi, usage.contextWindow);
		const decision = decideCompactionStrategy(percent * 100, config);

		// Only compact if strategy says "compact" (not "handoff" - that's handled by watchdog)
		if (decision.strategy !== "compact") return;

		if (percent > strategy.earlyCompactAt) {
			// Turn-based cooldown: wait at least N turns after last compact
			if (currentTurn - lastCompactTurn < COMPACT_COOLDOWN_TURNS) return;
			lastCompactTurn = currentTurn;
			s.compactionsTriggered++;
			const instructions =
				strategy.tier === "aggressive"
					? "Aggressive compaction: summarize everything except the last 3 turns. Focus on file changes and current state."
					: strategy.tier === "conservative"
						? "Conservative compaction: detailed summary preserving all key decisions, file paths, and code snippets."
						: "Standard compaction: summarize goals, progress, decisions, and next steps.";
			ctx.compact({ customInstructions: instructions });
		}
	});

	// Session before compact: DP algorithm + strategy adjustment
	pi.on("session_before_compact", async (event, ctx) => {
		const strategy = resolveStrategy(ctx, pi);
		const { preparation, branchEntries, customInstructions, signal } = event;
		const { tokensBefore, firstKeptEntryId, previousSummary, settings } = preparation;
		const usage = ctx.getContextUsage();
		const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 200000;

		// 1. DP algorithm for optimal cut point
		const prevCompactionIndex = findPrevCompactionIndex(branchEntries);
		const dpResult = evaluateDpCompaction(branchEntries, prevCompactionIndex, tokensBefore, contextWindow);

		if (dpResult) {
			const benefitStr = dpResult.netBenefit.toFixed(4);
			const status = `DP: benefit=${benefitStr}, keep=${dpResult.K}tok, hist=${dpResult.H}tok`;

			if (dpResult.netBenefit <= 0 && !dpResult.force) {
				const s = getState(ctx.sessionManager.getSessionFile());
				s.dpCancelled++;
				ctx.ui.notify(`${status} -> skip compaction (#${s.dpCancelled})`, "info");
				return { cancel: true };
			}

			if (dpResult.firstKeptEntryId !== firstKeptEntryId) {
				ctx.ui.notify(`${status} -> custom cut point (entry ${dpResult.firstKeptEntryIndex})`, "info");

				// Generate custom summary with DP cut point
				const historyEnd = dpResult.isSplitTurn ? dpResult.turnStartIndex : dpResult.firstKeptEntryIndex;
				const messagesToSummarize: AgentMessage[] = [];
				for (let i = prevCompactionIndex >= 0 ? prevCompactionIndex + 1 : 0; i < historyEnd; i++) {
					const msg = getMessageFromEntryForCompaction(branchEntries[i]);
					if (msg) messagesToSummarize.push(msg);
				}
				const turnPrefixMessages: AgentMessage[] = [];
				if (dpResult.isSplitTurn) {
					for (let i = dpResult.turnStartIndex; i < dpResult.firstKeptEntryIndex; i++) {
						const msg = getMessageFromEntryForCompaction(branchEntries[i]);
						if (msg) turnPrefixMessages.push(msg);
					}
				}

				const fileOps = extractFileOperationsFromMessages(messagesToSummarize);
				if (dpResult.isSplitTurn) {
					const prefixOps = extractFileOperationsFromMessages(turnPrefixMessages);
					for (const f of prefixOps.read) fileOps.read.add(f);
					for (const f of prefixOps.edited) fileOps.edited.add(f);
					for (const f of prefixOps.written) fileOps.written.add(f);
				}
				if (prevCompactionIndex >= 0) {
					const prev = branchEntries[prevCompactionIndex];
					if (prev.type === "compaction" && prev.details) {
						const details = prev.details as { readFiles?: string[]; modifiedFiles?: string[] };
						if (Array.isArray(details.readFiles)) {
							for (const f of details.readFiles) fileOps.read.add(f);
						}
						if (Array.isArray(details.modifiedFiles)) {
							for (const f of details.modifiedFiles) fileOps.edited.add(f);
						}
					}
				}

				const model = ctx.model;
				if (!model) {
					ctx.ui.notify("DP: no model available, falling back to default", "warning");
					return;
				}
				const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
				if (!auth.ok || !auth.apiKey) {
					ctx.ui.notify("DP: no API key, falling back to default", "warning");
					return;
				}

				try {
					let summary: string;
					if (dpResult.isSplitTurn && turnPrefixMessages.length > 0) {
						const [historyResult, turnPrefixResult] = await Promise.all([
							messagesToSummarize.length > 0
								? generateSummary(
										messagesToSummarize,
										model,
										settings.reserveTokens,
										auth.apiKey,
										auth.headers,
										signal,
										customInstructions,
										previousSummary,
									)
								: Promise.resolve("No prior history."),
							generateTurnPrefixSummary(
								turnPrefixMessages,
								model,
								settings.reserveTokens,
								auth.apiKey,
								auth.headers,
								signal,
							),
						]);
						summary = `${historyResult}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefixResult}`;
					} else {
						summary = await generateSummary(
							messagesToSummarize,
							model,
							settings.reserveTokens,
							auth.apiKey,
							auth.headers,
							signal,
							customInstructions,
							previousSummary,
						);
					}
					const { readFiles, modifiedFiles } = computeFileLists(fileOps);
					summary += formatFileOperations(readFiles, modifiedFiles);
					return {
						compaction: {
							summary,
							firstKeptEntryId: dpResult.firstKeptEntryId,
							tokensBefore,
							details: { readFiles, modifiedFiles },
						},
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`DP compaction failed: ${message}`, "error");
					return;
				}
			}
		}

		// 2. Adjust reserveTokens based on strategy
		const reserveFromTier = strategy.reserveTokens;
		const reserveFromPrep = settings.reserveTokens;
		const adjusted = Math.max(reserveFromTier, reserveFromPrep);
		if (adjusted !== reserveFromPrep) {
			return {
				preparation: {
					...preparation,
					settings: { ...preparation.settings, reserveTokens: adjusted },
				},
			};
		}
	});

	// Agent end: DP auto-compaction trigger
	pi.on("agent_end", async (_event, ctx) => {
		const usage = ctx.getContextUsage();
		if (!usage || usage.tokens === null || usage.contextWindow <= 0) return;
		const percent = usage.tokens / usage.contextWindow;
		const state = getState(ctx.sessionManager.getSessionFile());
		if (percent <= DP.CHECK_THRESHOLD) {
			state.lastTokens = usage.tokens;
			return;
		}
		if (state.lastTokens !== null && usage.tokens <= state.lastTokens * 1.05) return;
		state.lastTokens = usage.tokens;
		const entries = ctx.sessionManager.getBranch();
		const contextWindow = usage.contextWindow;
		const tokensBefore = usage.tokens;
		const prevCompactionIndex = findPrevCompactionIndex(entries);
		const dpResult = evaluateDpCompaction(entries, prevCompactionIndex, tokensBefore, contextWindow);
		if (!dpResult || (dpResult.netBenefit <= 0 && !dpResult.force)) return;
		ctx.compact({
			onComplete: () => {
				state.lastTokens = null;
			},
			onError: (error: Error) => {
				if (ctx.hasUI) ctx.ui.notify(`Auto-compaction failed: ${error.message}`, "error");
			},
		});
	});
}

// ─── Exports for commands ────────────────────────────────────────────────────

export type { AdaptiveCompactState };
export { getState, isEnabled, resolveStrategy };
