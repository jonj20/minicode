import { describe, expect, it } from "vitest";
import { route } from "../../src/core/local-router/router.ts";

describe("local-router", () => {
	describe("noop patterns", () => {
		it('returns Done. for "ok"', async () => {
			const { result } = await route("ok", "/tmp");
			expect(result.action).toBe("local");
			expect(result.response).toBe("Done.");
		});

		it('returns Done. for "好的"', async () => {
			const { result } = await route("好的", "/tmp");
			expect(result.action).toBe("local");
			expect(result.response).toBe("Done.");
		});

		it('returns "You\'re welcome." for "thanks"', async () => {
			const { result } = await route("thanks", "/tmp");
			expect(result.action).toBe("local");
			expect(result.response).toBe("You're welcome.");
		});

		it('returns "You\'re welcome." for "谢谢"', async () => {
			const { result } = await route("谢谢", "/tmp");
			expect(result.action).toBe("local");
			expect(result.response).toBe("You're welcome.");
		});
	});

	describe("local execution patterns", () => {
		it("returns local action for pwd", async () => {
			const { result, messages } = await route("pwd", process.cwd());
			expect(result.action).toBe("local");
			expect(messages).toHaveLength(2);
			expect(messages[0].role).toBe("user");
			expect(messages[1].role).toBe("assistant");
		});

		it("returns local action for whoami", async () => {
			const { result } = await route("whoami", process.cwd());
			expect(result.action).toBe("local");
		});

		it("returns local action for date", async () => {
			const { result } = await route("date", process.cwd());
			expect(result.action).toBe("local");
		});
	});

	describe("no match → llm pass-through", () => {
		it('returns action "llm" for unknown text', async () => {
			const { result } = await route("写一个二分查找算法", "/tmp");
			expect(result.action).toBe("llm");
		});

		it('returns action "llm" for code requests', async () => {
			const { result } = await route("帮我debug这个函数", "/tmp");
			expect(result.action).toBe("llm");
		});
	});

	describe("messages array", () => {
		it("returns empty messages for llm route", async () => {
			const { messages } = await route("如何实现一个Promise", "/tmp");
			expect(messages).toHaveLength(0);
		});

		it("returns user+assistant messages for local route", async () => {
			const { messages } = await route("ok", "/tmp");
			expect(messages).toHaveLength(2);
			expect(messages[0].content[0]).toMatchObject({ type: "text", text: "ok" });
		});
	});
});
