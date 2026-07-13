import { getKeybindings } from "../keybindings.ts";
import type { Component } from "../tui.ts";
import { truncateToWidth, visibleWidth } from "../utils.ts";

/**
 * Sidebar section item
 */
export interface SidebarItem {
	text: string;
	status?: "active" | "pending" | "done" | "error";
}

/**
 * Sidebar section
 */
export interface SidebarSection {
	label: string;
	items: SidebarItem[];
}

/**
 * Sidebar content structure
 */
export interface SidebarContent {
	title: string;
	sections: SidebarSection[];
}

/**
 * Sidebar theme for styling
 */
export interface SidebarTheme {
	title: (text: string) => string;
	sectionLabel: (text: string) => string;
	item: (text: string) => string;
	selectedItem: (text: string) => string;
	statusActive: (text: string) => string;
	statusPending: (text: string) => string;
	statusDone: (text: string) => string;
	statusError: (text: string) => string;
	dim: (text: string) => string;
}

/**
 * A navigable item in the flattened sidebar tree
 */
interface NavigableItem {
	/** The section index */
	sectionIndex: number;
	/** The item index within the section */
	itemIndex: number;
	/** The original SidebarItem */
	item: SidebarItem;
}

/**
 * SidebarComponent - displays session/task/status information in a sidebar panel
 * Supports keyboard navigation, scrolling, and item selection.
 */
export class SidebarComponent implements Component {
	private content: SidebarContent;
	private theme: SidebarTheme;

	// Navigation state
	private navigableItems: NavigableItem[] = [];
	private selectedItemIndex = -1;
	private scrollOffset = 0;

	// Callbacks
	public onItemSelect?: (item: SidebarItem, sectionIndex: number, itemIndex: number) => void;

	// Cache for rendered output
	private cachedWidth?: number;
	private cachedContent?: SidebarContent;
	private cachedLines?: string[];
	private cachedSelectedIndex?: number;
	private cachedScrollOffset?: number;

	constructor(content: SidebarContent, theme: SidebarTheme) {
		this.content = content;
		this.theme = theme;
		this.rebuildNavigableItems();
	}

	setContent(content: SidebarContent): void {
		this.content = content;
		this.rebuildNavigableItems();
		this.clampSelection();
		this.invalidate();
	}

	setTheme(theme: SidebarTheme): void {
		this.theme = theme;
		this.invalidate();
	}

	/**
	 * Get the currently selected item, or null if nothing is selected.
	 */
	getSelectedItem(): SidebarItem | null {
		if (this.selectedItemIndex < 0 || this.selectedItemIndex >= this.navigableItems.length) {
			return null;
		}
		return this.navigableItems[this.selectedItemIndex]?.item ?? null;
	}

	/**
	 * Set selected index programmatically.
	 */
	setSelectedIndex(index: number): void {
		this.selectedItemIndex = Math.max(-1, Math.min(index, this.navigableItems.length - 1));
		this.ensureVisible();
		this.invalidate();
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedContent = undefined;
		this.cachedLines = undefined;
		this.cachedSelectedIndex = undefined;
		this.cachedScrollOffset = undefined;
	}

	render(width: number): string[] {
		// Check cache (include selection state)
		if (
			this.cachedLines &&
			this.cachedWidth === width &&
			this.cachedContent === this.content &&
			this.cachedSelectedIndex === this.selectedItemIndex &&
			this.cachedScrollOffset === this.scrollOffset
		) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const leftPad = " "; // 1 space left padding

		// Title (bold, at top)
		lines.push(this.renderLine(leftPad + this.theme.title(this.content.title), width));

		// Blank line after title
		lines.push("");

		// Flatten content into render lines with navigable item tracking
		const renderLines: Array<{ text: string; navigableIndex: number | -1 }> = [];

		for (let si = 0; si < this.content.sections.length; si++) {
			const section = this.content.sections[si]!;

			// Blank line before section (except before first section)
			if (renderLines.length > 0) {
				renderLines.push({ text: "", navigableIndex: -1 });
			}

			// Section label (bold, not navigable)
			renderLines.push({ text: this.theme.sectionLabel(section.label), navigableIndex: -1 });

			// Items
			for (let ii = 0; ii < section.items.length; ii++) {
				const item = section.items[ii]!;
				const navIdx = this.findNavigableIndex(si, ii);
				const isSelected = navIdx !== -1 && navIdx === this.selectedItemIndex;
				const statusIcon = this.getStatusIcon(item.status, isSelected);
				// Apply item color to text only, not to status icon (icon has its own color)
				const coloredText = isSelected ? this.theme.selectedItem(item.text) : this.theme.item(item.text);
				const itemText = `${statusIcon}${coloredText}`;
				renderLines.push({ text: itemText, navigableIndex: navIdx });
			}
		}

		// Apply scroll offset (skip title line)
		const contentLines = renderLines;
		const startIndex = this.scrollOffset;

		// Render title
		// (already pushed above)

		// Render visible content lines
		for (let i = startIndex; i < contentLines.length; i++) {
			const entry = contentLines[i]!;
			const isSelected = entry.navigableIndex !== -1 && entry.navigableIndex === this.selectedItemIndex;
			const prefix = isSelected ? "\u2192 " : "  ";
			// entry.text is already colored (status icon + dim/softWhite text)
			const displayText = leftPad + prefix + entry.text;
			lines.push(this.renderLine(displayText, width));
		}

		// Update cache
		this.cachedWidth = width;
		this.cachedContent = this.content;
		this.cachedLines = lines;
		this.cachedSelectedIndex = this.selectedItemIndex;
		this.cachedScrollOffset = this.scrollOffset;

		return lines.length > 0 ? lines : [this.renderLine(this.theme.dim("(no data)"), width)];
	}

	handleInput(data: string): void {
		const kb = getKeybindings();

		if (kb.matches(data, "tui.select.up")) {
			this.moveSelection(-1);
		} else if (kb.matches(data, "tui.select.down")) {
			this.moveSelection(1);
		} else if (kb.matches(data, "tui.select.pageUp")) {
			this.moveSelection(-10);
		} else if (kb.matches(data, "tui.select.pageDown")) {
			this.moveSelection(10);
		} else if (kb.matches(data, "tui.select.confirm")) {
			const item = this.getSelectedItem();
			if (item && this.onItemSelect) {
				const nav = this.navigableItems[this.selectedItemIndex];
				if (nav) {
					this.onItemSelect(item, nav.sectionIndex, nav.itemIndex);
				}
			}
		}
	}

	private moveSelection(delta: number): void {
		if (this.navigableItems.length === 0) return;

		if (this.selectedItemIndex < 0) {
			// Nothing selected yet: select first or last based on direction
			this.selectedItemIndex = delta > 0 ? 0 : this.navigableItems.length - 1;
		} else {
			this.selectedItemIndex = Math.max(0, Math.min(this.selectedItemIndex + delta, this.navigableItems.length - 1));
		}

		this.ensureVisible();
		this.invalidate();
	}

	private ensureVisible(): void {
		// Each navigable item occupies one render line (plus section headers/blanks)
		// We need to figure out which render line the selected item is on
		const renderLineIndex = this.getRenderLineIndex(this.selectedItemIndex);
		if (renderLineIndex < 0) return;

		// Ensure the render line is within the visible scroll window
		// The first render line (index 0) is the title, content starts at index 1
		const contentLineIndex = renderLineIndex - 1; // subtract title
		if (contentLineIndex < this.scrollOffset) {
			this.scrollOffset = contentLineIndex;
		}
		// We don't know terminal height here, so just keep scrollOffset non-negative
		// The caller (TUI render) handles viewport clipping
	}

	/**
	 * Map a navigable item index back to the render line index (0-based, including title).
	 */
	private getRenderLineIndex(navigableIndex: number): number {
		if (navigableIndex < 0 || navigableIndex >= this.navigableItems.length) return -1;

		const nav = this.navigableItems[navigableIndex]!;
		let lineIndex = 0; // 0 = title

		for (let si = 0; si < this.content.sections.length; si++) {
			const section = this.content.sections[si]!;

			// Blank line before section (except before first section)
			if (lineIndex > 0) {
				lineIndex++;
			}

			// Section label
			lineIndex++;

			// Items
			for (let ii = 0; ii < section.items.length; ii++) {
				if (si === nav.sectionIndex && ii === nav.itemIndex) {
					return lineIndex;
				}
				lineIndex++;
			}
		}

		return -1;
	}

	/**
	 * Rebuild the flat list of navigable items from the content tree.
	 */
	private rebuildNavigableItems(): void {
		this.navigableItems = [];
		for (let si = 0; si < this.content.sections.length; si++) {
			const section = this.content.sections[si]!;
			for (let ii = 0; ii < section.items.length; ii++) {
				this.navigableItems.push({
					sectionIndex: si,
					itemIndex: ii,
					item: section.items[ii]!,
				});
			}
		}
	}

	/**
	 * Clamp selection to valid range after content changes.
	 */
	private clampSelection(): void {
		if (this.navigableItems.length === 0) {
			this.selectedItemIndex = -1;
		} else if (this.selectedItemIndex >= this.navigableItems.length) {
			this.selectedItemIndex = this.navigableItems.length - 1;
		}
	}

	/**
	 * Find the navigable index for a given section/item position.
	 */
	private findNavigableIndex(sectionIndex: number, itemIndex: number): number {
		let idx = 0;
		for (let si = 0; si < this.content.sections.length; si++) {
			const section = this.content.sections[si]!;
			for (let ii = 0; ii < section.items.length; ii++) {
				if (si === sectionIndex && ii === itemIndex) {
					return idx;
				}
				idx++;
			}
		}
		return -1;
	}

	private renderLine(text: string, width: number): string {
		const visLen = visibleWidth(text);
		if (visLen > width) {
			return truncateToWidth(text, width);
		}
		const padding = " ".repeat(Math.max(0, width - visLen));
		return text + padding;
	}

	private getStatusIcon(status?: SidebarItem["status"], isSelected = false): string {
		switch (status) {
			case "active":
				return this.theme.statusActive("\u2022 ");
			case "pending":
				return this.theme.statusPending("\u25E6 ");
			case "done":
				return isSelected ? this.theme.statusDone("\u2022 ") : this.theme.dim("\u2022 ");
			case "error":
				return this.theme.statusError("\u2022 ");
			default:
				return "  ";
		}
	}
}
