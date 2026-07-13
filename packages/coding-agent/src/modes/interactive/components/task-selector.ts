import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import { Container, type SelectItem, SelectList } from "@earendil-works/pi-tui";
import { getSelectListTheme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

const TASKS_FILE = join(os.homedir(), ".minicode", "agent", "tasks", "tasks.jsonl");

interface TaskData {
	id: string;
	summary: string;
	status: "open" | "in_progress" | "blocked" | "done" | "abandoned";
	parentId?: string;
	createdAt?: string;
	updatedAt?: string;
	blockedBy?: string;
	blockedReason?: string;
	doneSummary?: string;
}

const STATUS_ICONS: Record<string, string> = {
	in_progress: "\u25C9",
	blocked: "\u25A0",
	open: "\u25CB",
	done: "\u2713",
	abandoned: "\u2715",
};

const STATUS_ORDER: Record<string, number> = {
	in_progress: 0,
	blocked: 1,
	open: 2,
	done: 3,
	abandoned: 4,
};

function loadTasks(): TaskData[] {
	if (!existsSync(TASKS_FILE)) return [];

	try {
		const content = readFileSync(TASKS_FILE, "utf-8");
		const lines = content.split("\n").filter(Boolean);
		const tasks = new Map<string, TaskData>();

		for (const line of lines) {
			try {
				const entry = JSON.parse(line) as Record<string, unknown>;
				if (entry.type !== "task") continue;
				if (entry.action === "create" && entry.task) {
					const task = entry.task as TaskData;
					tasks.set(task.id, task);
				} else if (entry.action === "update_status" && typeof entry.id === "string") {
					const existing = tasks.get(entry.id);
					if (existing) {
						const newStatus = entry.newStatus as TaskData["status"];
						tasks.set(entry.id, {
							...existing,
							status: newStatus,
							updatedAt: (entry.timestamp as string) ?? existing.updatedAt,
						});
					}
				}
			} catch {
				// skip malformed lines
			}
		}

		return [...tasks.values()].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99));
	} catch {
		return [];
	}
}

function taskToSelectItem(task: TaskData): SelectItem {
	const icon = STATUS_ICONS[task.status] ?? "?";
	const label = `${icon} ${task.id}  ${task.summary}`;
	const desc =
		task.status === "blocked" && task.blockedReason
			? task.blockedReason
			: task.status === "done" && task.doneSummary
				? task.doneSummary
				: task.status;
	return { value: task.id, label, description: desc };
}

export class TaskSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(onClose: () => void) {
		super();

		this.addChild(new DynamicBorder());

		const tasks = loadTasks();
		const items = tasks.map(taskToSelectItem);
		const placeholder: SelectItem = { value: "", label: "  (no tasks found)" };

		this.selectList = new SelectList(items.length > 0 ? items : [placeholder], 10, getSelectListTheme(), {
			minPrimaryColumnWidth: 40,
			maxPrimaryColumnWidth: 60,
		});

		this.selectList.onSelect = () => onClose();
		this.selectList.onCancel = () => onClose();

		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
