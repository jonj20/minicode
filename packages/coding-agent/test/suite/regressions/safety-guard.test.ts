import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../harness.ts";

describe("Safety guard", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("should stop agent after max steps (50 turns)", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		const echoTool: AgentTool = {
			name: "echo",
			label: "Echo",
			description: "Echo text back",
			parameters: Type.Object({ text: Type.String() }),
			execute: async (_id, _params) => ({ content: [{ type: "text" as const, text: "done" }], details: {} }),
		};
		harness.session.agent.state.tools = [echoTool];

		// Set up 55 tool-calling responses to exceed the 50-turn limit
		const responses = [];
		for (let i = 0; i < 55; i++) {
			responses.push(fauxAssistantMessage([fauxToolCall("echo", { text: "x" })]));
		}
		harness.setResponses(responses);

		await harness.session.prompt("start");

		// Agent should have been aborted before processing all 55 turns
		const stopReason = harness.session.messages.filter((m) => m.role === "assistant").at(-1)?.stopReason;
		expect(stopReason).toBe("aborted");
		const turnEvents = harness.eventsOfType("turn_end");
		expect(turnEvents.length).toBeLessThanOrEqual(52);
	});

	it("should detect infinite loop on same file (5 edits)", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		const editTool: AgentTool = {
			name: "edit",
			label: "Edit",
			description: "Edit a file",
			parameters: Type.Object({
				path: Type.String(),
				oldText: Type.String(),
				newText: Type.String(),
			}),
			execute: async (_id, params) => {
				const p = params as { path: string; oldText: string; newText: string };
				return { content: [{ type: "text" as const, text: `edited ${p.path}` }], details: {} };
			},
		};
		harness.session.agent.state.tools = [editTool];

		// Set up 7 tool calls all editing the same file
		const responses = [];
		for (let i = 0; i < 7; i++) {
			responses.push(fauxAssistantMessage([fauxToolCall("edit", { path: "test.ts", oldText: "a", newText: "b" })]));
		}
		harness.setResponses(responses);

		await harness.session.prompt("fix test.ts");

		const stopReason = harness.session.messages.filter((m) => m.role === "assistant").at(-1)?.stopReason;
		expect(stopReason).toBe("aborted");
	});
});
