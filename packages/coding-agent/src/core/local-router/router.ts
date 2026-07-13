import type { ImageContent, TextContent } from "@earendil-works/pi-ai/compat";
import { execSimple } from "./local-exec.ts";
import { getCommand, match } from "./patterns.ts";

export type RouteAction = "llm" | "local";

export interface RouteResult {
	action: RouteAction;
	response?: string;
}

export interface RoutedMessage {
	role: "user" | "assistant";
	content: (TextContent | ImageContent)[];
	timestamp: number;
}

export async function route(text: string, cwd: string): Promise<{ result: RouteResult; messages: RoutedMessage[] }> {
	const matched = match(text);
	if (!matched) {
		return { result: { action: "llm" }, messages: [] };
	}

	const userMessage: RoutedMessage = {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};

	if (matched.action === "pass_through") {
		return {
			result: { action: "llm" },
			messages: [userMessage],
		};
	}

	if (matched.action === "noop") {
		return {
			result: { action: "local", response: matched.response },
			messages: [
				userMessage,
				{ role: "assistant", content: [{ type: "text", text: matched.response }], timestamp: Date.now() },
			],
		};
	}

	const command = getCommand(matched.rule, text);
	let execResult: Awaited<ReturnType<typeof execSimple>>;
	try {
		execResult = await execSimple(command, cwd);
	} catch {
		return { result: { action: "local", response: `Failed to execute \`${command}\`` }, messages: [userMessage] };
	}

	if (execResult.exitCode !== 0) {
		const errMsg = execResult.stderr || `Exit code ${execResult.exitCode}`;
		const response = `Command: \`${command}\`\n\nError: ${errMsg}`;
		return {
			result: { action: "local", response },
			messages: [
				userMessage,
				{ role: "assistant", content: [{ type: "text", text: response }], timestamp: Date.now() },
			],
		};
	}

	const output = execResult.truncated
		? `${execResult.stdout}\n\n_(output truncated to last ${execResult.stdout.split("\n").length} lines)_`
		: execResult.stdout;

	const response = output ? `\`\`\`\n${output}\n\`\`\`` : "(empty output)";

	return {
		result: { action: "local", response },
		messages: [
			userMessage,
			{ role: "assistant", content: [{ type: "text", text: response }], timestamp: Date.now() },
		],
	};
}
