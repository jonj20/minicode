/**
 * Handoff tool for the agenticoding extension.
 *
 * Tools can trigger compaction directly, so handoff is implemented as a
 * deliberate compaction that replaces noisy context with a clean restart brief.
 *
 * The brief should complete the picture: preserve the important situational
 * context that is still only present in the current turn, while notebook pages
 * remain durable grounding fetched on demand in the next context.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgenticodingState } from "../state.js";
import { STATUS_KEY_HANDOFF } from "../tui.js";

/**
 * Build the enriched task that becomes the compaction summary.
 *
 * Shape: handoff primer + original task.
 */
function buildEnrichedTask(task: string): string {
	const parts: string[] = [
		"## Handoff — Continue Previous Work",
		"",
		"You are continuing a previous agent's work in a clean context. Use the available knowledge correctly:",
		"- Notebook pages hold durable grounding knowledge; fetch them with `notebook_read`",
		"- This handoff brief holds the distilled next task and immediate situational context",
		"- Use `notebook_index` to scan available pages when needed",
		"- Use `spawn` to delegate isolated subtasks to child agents",
		"- Build on notebook grounding and this brief rather than reconstructing old context",
		"",
		"## Task",
		"",
		task,
	];

	return parts.join("\n");
}

export function registerHandoffTool(pi: ExtensionAPI, state: AgenticodingState): void {
	pi.registerTool({
		name: "handoff",
		label: "Handoff",
		description: "Compress context and continue with a new task.",
		executionMode: "sequential",

		parameters: Type.Object({
			task: Type.String({
				description: "Brief for the next context: what to do, current state, blockers.",
			}),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const enrichedTask = buildEnrichedTask(params.task);
			state.pendingHandoff = { task: enrichedTask, source: "tool" };
			if (state.pendingRequestedHandoff) {
				state.pendingRequestedHandoff.toolCalled = true;
			}
			ctx.compact({
				onComplete: () => {
					pi.sendUserMessage("Proceed.");
				},
				onError: () => {
					state.pendingHandoff = null;
					// Safe: pendingRequestedHandoff may already be cleaned up by watchdog
					if (state.pendingRequestedHandoff) {
						state.pendingRequestedHandoff.toolCalled = false;
					}
					if (ctx.hasUI) {
						ctx.ui.setStatus(STATUS_KEY_HANDOFF, undefined);
					}
				},
			});

			return {
				content: [{ type: "text", text: "Handoff started." }],
				details: {},
				terminate: true,
			};
		},
	});
}
