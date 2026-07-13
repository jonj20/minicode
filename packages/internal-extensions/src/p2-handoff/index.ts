/**
 * Agenticoding v2 — Extension factory.
 *
 * Wires together the three primitives:
 *   spawn     — delegate isolated work to child contexts
 *   notebook   — durable cross-context grounding
 *   handoff   — deliberate task pivot via compaction
 *
 * Also registers:
 *   - watchdog (advisory primacy-zone reminder after each turn)
 *   - system prompt injection (CONTEXT_PRIMER, nudge, notebook listing)
 *   - state reset on /new
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { registerHandoffCommand } from "./handoff/command.js";
import { registerHandoffCompaction } from "./handoff/compact.js";
import { registerHandoffTool } from "./handoff/tool.js";
import { registerNotebookRehydration } from "./notebook/rehydration.js";
import { formatPagePreview } from "./notebook/store.js";
import { registerNotebookTools } from "./notebook/tools.js";
import { setActiveNotebookTopic } from "./notebook/topic.js";
import { registerNotebookTopicTool } from "./notebook/topic-tool.js";
import { type AgenticodingState, createState, resetState } from "./state.js";
import { CONTEXT_PRIMER } from "./system-prompt.js";
import { STATUS_KEY_HANDOFF, STATUS_KEY_TOPIC, updateIndicators, WIDGET_KEY_WARNING } from "./tui.js";
import { buildNudge, getNudgeThreshold, registerWatchdog } from "./watchdog.js";

export default function (pi: ExtensionAPI): void {
	const state: AgenticodingState = createState();

	// ── Register tools ──────────────────────────────────────────────
	registerNotebookTools(pi, state);
	registerNotebookTopicTool(pi, state);
	registerHandoffTool(pi, state);

	// ── Register event handlers ─────────────────────────────────────
	registerWatchdog(pi, state);
	registerNotebookRehydration(pi, state);
	registerHandoffCompaction(pi, state);

	// ── Tool call pattern tracker + spawn event emission ──────────
	// Track recent tool calls to detect research→execution transitions
	const recentToolCalls: string[] = [];
	const TOOL_CALL_WINDOW = 10;
	pi.on("tool_call", async (event) => {
		const toolName = (event as { toolName?: string }).toolName ?? "";
		if (!toolName) return;
		recentToolCalls.push(toolName);
		if (recentToolCalls.length > TOOL_CALL_WINDOW) recentToolCalls.shift();
	});

	// Detect phase changes and emit spawn requests for p2-subagents
	pi.on("turn_end", async (_event, _ctx: ExtensionContext) => {
		if (recentToolCalls.length < 5) return;
		if (state.pendingTopicBoundaryHint) return;

		const recent = recentToolCalls.slice(-5);
		const readPhase = recent.filter((t) => ["lsp_navigation", "grep", "read", "glob"].includes(t)).length;
		const writePhase = recent.filter((t) => ["edit", "write"].includes(t)).length;

		// Research→execution transition: emit spawn request
		if (readPhase >= 3 && writePhase >= 2) {
			pi.events.emit("request-spawn", {
				type: "Explore",
				prompt:
					"Summarize findings from the research phase and identify key files/decisions for the execution phase.",
				reason: "research-to-execution transition detected",
			});
			state.pendingTopicBoundaryHint = {
				from: state.activeNotebookTopic ?? "(research phase)",
				to: "execution",
				source: "agent",
			};
			recentToolCalls.length = 0;
		}

		// High tool call density: emit spawn for noisy subtask
		if (recentToolCalls.length >= 8) {
			const lastTool = recentToolCalls[recentToolCalls.length - 1];
			const isNoisy = ["lsp_navigation", "grep", "read", "glob", "bash"].includes(lastTool);
			if (isNoisy) {
				pi.events.emit("request-spawn", {
					type: "Explore",
					prompt: `Continue the current ${lastTool} task in isolation.`,
					reason: "high tool call density",
				});
				recentToolCalls.length = 0;
			}
		}
	});

	// ── Register commands ───────────────────────────────────────────
	registerHandoffCommand(pi, state);

	// ── /notebook command — interactive page selector ────────────────
	pi.registerCommand("notebook", {
		description: "Select a notebook page to preview, or set the active notebook topic with /notebook <topic>",
		handler: async (args, ctx) => {
			const topicArg = args.trim();
			if (topicArg) {
				const result = setActiveNotebookTopic(state, topicArg, "human");
				if (ctx.hasUI) {
					const message = result.boundaryHint
						? `Active notebook topic changed: ${result.boundaryHint.from} → ${result.boundaryHint.to}. This is a likely task boundary; handoff is recommended before continuing.`
						: `Active notebook topic: ${result.current}`;
					ctx.ui.notify(message, result.boundaryHint ? "warning" : "info");
				}
				updateIndicators(ctx, state);
				return;
			}
			if (!ctx.hasUI) {
				return;
			}

			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				const container = new Container();

				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(
					new Text(theme.fg("accent", theme.bold(` Notebook (${state.notebookPages.size} pages) `)), 1, 0),
				);

				const entries = Array.from(state.notebookPages.entries()).sort(([a], [b]) => a.localeCompare(b));
				let selectList: SelectList | undefined;
				let finished = false;

				if (entries.length === 0) {
					container.addChild(new Text(theme.fg("dim", " (empty) — use notebook_write to create pages"), 1, 0));
				} else {
					const items: SelectItem[] = entries.map(([name, content]) => ({
						value: name,
						label: name,
						description: formatPagePreview(content),
					}));

					selectList = new SelectList(items, Math.min(items.length, 10), {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					});
					selectList.onSelect = ({ value }) => {
						// Guard: selectList is set to undefined below, so this handler
						// cannot fire twice — no re-entrancy guard needed here.
						const body = state.notebookPages.get(value);
						if (!body) {
							done();
							return;
						}
						// Switch to body view: show the selected entry body inline
						container.clear();
						container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
						container.addChild(new Text(theme.fg("accent", theme.bold(` ${value} `)), 1, 0));
						const truncated = body.length > 500 ? `${body.slice(0, 500)}\n...` : body;
						container.addChild(new Text(theme.fg("toolOutput", truncated), 1, 0));
						container.addChild(new Text(theme.fg("dim", " press any key to close "), 1, 0));
						container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
						selectList = undefined;
						tui.requestRender();
					};
					selectList.onCancel = () => {
						if (finished) return;
						finished = true;
						done();
					};
					container.addChild(selectList);
				}

				container.addChild(
					new Text(
						theme.fg(
							"dim",
							entries.length === 0
								? " esc close "
								: " \u2191\u2195 navigate \u2022 enter select \u2022 esc close ",
						),
						1,
						0,
					),
				);
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				return {
					render: (w) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data) => {
						if (finished) return;
						if (!selectList) {
							finished = true;
							done();
							return;
						}
						selectList.handleInput?.(data);
						// Conservative: always repaint after key input.
						// SelectList.handleInput returns void in the current API,
						// so we can't conditionally skip — the cost is negligible.
						tui.requestRender();
					},
				};
			});
		},
	});

	// ── before_agent_start: inject context primer + notebook ───────
	pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
		// Update TUI indicators before each user-prompt agent run
		updateIndicators(ctx, state);

		const parts: string[] = [event.systemPrompt];

		// Inject context management primer at the end of the system prompt
		parts.push(`\n${CONTEXT_PRIMER}`);

		if (state.activeNotebookTopic) {
			parts.push(
				`\n## Active Notebook Topic\n` +
					`Current topic: \`${state.activeNotebookTopic}\` (${state.activeNotebookTopicSource ?? "unknown"}-set).\n` +
					`Treat this as the current semantic frame. If new work fits it, prefer spawn for isolated noisy subtasks. If it does not fit it, prefer handoff over dragging stale context forward.`,
			);
		} else {
			parts.push(
				`\n## Active Notebook Topic\n` +
					`No active notebook topic is set. Early in the next substantive task, assign a short stable topic with \`notebook_topic_set\`. Human-set topics are authoritative.`,
			);
		}

		// Inject notebook listing so the LLM always knows what's available
		const entryNames = Array.from(state.notebookPages.keys()).sort();
		if (entryNames.length > 0) {
			const listing = entryNames
				.map((name) => {
					const content = state.notebookPages.get(name)!;
					const firstLine = (content.split("\n")[0] ?? "").slice(0, 80);
					return `  ${name}: ${firstLine}`;
				})
				.join("\n");
			parts.push(
				`\n## Active Notebook Pages\n` +
					`The following pages are available via notebook_read by name:\n${listing}\n` +
					`Reference pages by name — never paste bodies into prompts.`,
			);
		}

		return { systemPrompt: parts.join("\n\n") };
	});

	// ── context: inject primacy-zone nudge before each LLM call ────
	pi.on("context", async (event, ctx: ExtensionContext) => {
		const usage = ctx.getContextUsage();
		const percent = usage?.percent ?? null;
		if (usage && usage.percent !== null) {
			state.lastContextPercent = usage.percent;
		}
		const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? null;
		const threshold = getNudgeThreshold(contextWindow);
		if (!state.pendingTopicBoundaryHint && (percent === null || percent < threshold)) {
			return;
		}

		const nudge = buildNudge(state, percent);
		state.pendingTopicBoundaryHint = null;
		return {
			messages: [
				...event.messages,
				{
					role: "custom",
					customType: "agenticoding-watchdog",
					content: nudge,
					display: false,
					timestamp: Date.now(),
				},
			],
		};
	});

	// ── session_start: reset state + update indicators ─────────────
	pi.on("session_start", async (event, ctx: ExtensionContext) => {
		if (event.reason === "new") {
			resetState(state);
			// Clear any stale TUI indicators from the previous session
			if (ctx.hasUI) {
				ctx.ui.setStatus(STATUS_KEY_HANDOFF, undefined);
				ctx.ui.setStatus(STATUS_KEY_TOPIC, undefined);
				ctx.ui.setWidget(WIDGET_KEY_WARNING, undefined);
			}
		}
		updateIndicators(ctx, state);
	});

	// ── update TUI indicators after each turn ───────────────────────
	pi.on("turn_end", async (_event, ctx: ExtensionContext) => {
		// Fallback: clear handoff indicator if the LLM completed a turn
		// without calling the handoff tool (ignored the direction)
		if (state.pendingRequestedHandoff && !state.pendingRequestedHandoff.toolCalled) {
			state.pendingRequestedHandoff = null;
			if (ctx.hasUI) {
				ctx.ui.setStatus(STATUS_KEY_HANDOFF, undefined);
			}
		}
		updateIndicators(ctx, state);
	});
}
