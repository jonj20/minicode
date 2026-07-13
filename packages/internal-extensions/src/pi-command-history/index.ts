import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";

const HISTORY_DIR = join(getAgentDir(), "folder-history");
const MAX_HISTORY = 500;

function getHistoryFile(cwd: string): string {
	// Replace path separators AND colons (reserved on Windows) with dashes
	const name = cwd.replace(/[/\\:]/g, "-");
	return join(HISTORY_DIR, `${name}.jsonl`);
}

function loadHistory(cwd: string): string[] {
	const file = getHistoryFile(cwd);
	if (!existsSync(file)) return [];

	try {
		const lines = readFileSync(file, "utf-8")
			.split("\n")
			.filter((l) => l.trim());

		const entries: string[] = [];
		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry.text && entry.cwd === cwd) {
					entries.push(entry.text);
				}
			} catch {
				// skip malformed lines
			}
		}

		const seen = new Map<string, number>();
		for (let i = 0; i < entries.length; i++) {
			seen.set(entries[i], i);
		}
		const unique = [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([text]) => text);

		return unique.slice(-MAX_HISTORY);
	} catch {
		return [];
	}
}

function appendHistory(cwd: string, text: string): void {
	mkdirSync(HISTORY_DIR, { recursive: true });
	const file = getHistoryFile(cwd);
	const entry = JSON.stringify({ cwd, text, ts: Date.now() });
	appendFileSync(file, `${entry}\n`, "utf-8");
}

export default function (pi: ExtensionAPI) {
	let history: string[] = [];
	let historyIndex = -1;
	let savedEditorText = "";
	let currentCwd = "";

	pi.on("session_start", (_event, ctx) => {
		currentCwd = ctx.cwd;
		history = loadHistory(currentCwd);
		historyIndex = -1;
		savedEditorText = "";

		ctx.ui.setEditorHistory(history);
		ctx.ui.setStatus("folder-history", history.length > 0 ? `H ${history.length} cmds` : undefined);
	});

	pi.on("input", (event, _ctx) => {
		const text = event.text?.trim();
		if (!text || !currentCwd) return;

		appendHistory(currentCwd, text);

		const idx = history.indexOf(text);
		if (idx !== -1) history.splice(idx, 1);
		history.push(text);
		if (history.length > MAX_HISTORY) history.shift();

		historyIndex = -1;
		savedEditorText = "";

		return { action: "continue" as const };
	});

	pi.registerShortcut("ctrl+up", {
		description: "Previous command from folder history",
		handler: (ctx) => {
			if (history.length === 0) return;

			if (historyIndex === -1) {
				savedEditorText = ctx.ui.getEditorText();
			}

			const nextIndex = historyIndex + 1;
			if (nextIndex >= history.length) return;

			historyIndex = nextIndex;
			ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
		},
	});

	pi.registerShortcut("ctrl+down", {
		description: "Next command from folder history",
		handler: (ctx) => {
			if (historyIndex <= -1) return;

			historyIndex--;

			if (historyIndex === -1) {
				ctx.ui.setEditorText(savedEditorText);
			} else {
				ctx.ui.setEditorText(history[history.length - 1 - historyIndex]);
			}
		},
	});
}
