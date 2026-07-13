import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { APP_NAME } from "../../../config.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

export interface UpdateInfo {
	version: string;
	note?: string;
	changelogUrl?: string;
}

function bgLine(text: string, width: number): string {
	const visibleLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
	const pad = Math.max(0, width - visibleLen);
	return text + " ".repeat(pad);
}

export class UpdateDialogComponent extends Container {
	private dismissed = false;
	readonly width = 56;

	constructor(updateInfo: UpdateInfo, _onDismiss: () => void) {
		super();

		const w = this.width;

		this.addChild(new DynamicBorder((text) => theme.fg("accent", text)));

		// Title with background
		this.addChild(new Text(bgLine(theme.bold(theme.fg("accent", `  ${APP_NAME} Update Available`)), w), 1, 0));
		this.addChild(new Spacer(1));

		// Version info
		this.addChild(
			new Text(
				bgLine(
					theme.fg("text", `  New version ${theme.bold(theme.fg("accent", updateInfo.version))} is available`),
					w,
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));

		// Update command
		this.addChild(
			new Text(bgLine(theme.fg("muted", `  Run ${theme.fg("accent", `${APP_NAME} update`)} to upgrade`), w), 1, 0),
		);

		// Changelog link
		const url = updateInfo.changelogUrl || "https://pi.dev/changelog";
		this.addChild(new Text(bgLine(theme.fg("muted", `  Changelog: ${theme.fg("accent", url)}`), w), 1, 0));

		// Release note
		if (updateInfo.note?.trim()) {
			this.addChild(new Spacer(1));
			const noteLines = updateInfo.note.trim().split("\n").slice(0, 3);
			for (const line of noteLines) {
				this.addChild(new Text(bgLine(theme.fg("dim", `  ${line}`), w), 1, 0));
			}
		}

		this.addChild(new Spacer(1));
		this.addChild(new Text(bgLine(theme.fg("dim", "  Press any key to dismiss"), w), 1, 0));

		this.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
	}

	handleKey(_keyData: string): boolean {
		if (!this.dismissed) {
			this.dismissed = true;
			return true;
		}
		return false;
	}
}
