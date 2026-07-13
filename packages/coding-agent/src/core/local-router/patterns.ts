export type MatchAction = "noop" | "local" | "pass_through";

export interface MatchRule {
	name: string;
	pattern: RegExp;
	action: MatchAction;
	response?: string;
	command?: string;
}

export interface MatchResult {
	rule: MatchRule;
	action: MatchAction;
	response: string;
}

const NOOP_RESPONSE_DONE = "Done.";

const rules: MatchRule[] = [
	{ name: "ok", pattern: /^(ok|好|是|嗯|y(es)?|got it|明白|好的?)$/i, action: "noop", response: NOOP_RESPONSE_DONE },
	{ name: "thanks", pattern: /^thanks?( you)?$|^谢谢|^thank you/i, action: "noop", response: "You're welcome." },
	{ name: "pwd", pattern: /^pwd$/, action: "local", command: "pwd" },
	{ name: "whoami", pattern: /^whoami$/, action: "local", command: "whoami" },
	{ name: "date", pattern: /^date$/, action: "local", command: "date" },
	{ name: "uptime", pattern: /^uptime$/, action: "local", command: "uptime" },
	{ name: "ls", pattern: /^ls(\s+-[a-zA-Z]+)?(\s+.+)?$/, action: "local", command: "ls" },
	{ name: "which", pattern: /^which\s+.+/, action: "local" },
	{ name: "git status short", pattern: /^git status$/, action: "local", command: "git status --short" },
	{ name: "git branch", pattern: /^git branch(\s+-[a-zA-Z]+)?$/, action: "local", command: "git branch" },
	{ name: "git diff", pattern: /^git diff(\s+--stat)?(\s+.+)?$/, action: "pass_through" },
	{ name: "git log", pattern: /^git log(\s+.+)?$/, action: "local", command: "git log --oneline -10" },
	{ name: "npm ls", pattern: /^npm ls(\s+--depth=\d+)?(\s+.+)?$/, action: "local" },
	{ name: "echo", pattern: /^echo\s+.+/, action: "local" },
	{ name: "dirname", pattern: /^dirname\s+.+/, action: "local" },
	{ name: "basename", pattern: /^basename\s+.+/, action: "local" },
	{ name: "type", pattern: /^type\s+.+/, action: "local" },
];

export function match(text: string): MatchResult | null {
	for (const rule of rules) {
		if (rule.pattern.test(text.trim())) {
			return {
				rule,
				action: rule.action,
				response: rule.response ?? "",
			};
		}
	}
	return null;
}

export function getCommand(rule: MatchRule, text: string): string {
	if (rule.command) return rule.command;
	const match = text.trim().match(rule.pattern);
	if (!match) return text.trim();
	return text.trim();
}
