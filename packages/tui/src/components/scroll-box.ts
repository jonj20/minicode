import type { Component } from "../tui.ts";

/**
 * ScrollBox - a container with fixed height that scrolls its content
 */
export class ScrollBox implements Component {
	private children: Component[] = [];
	private height: number;
	private scrollTop: number = 0;
	private cachedWidth?: number;
	private cachedHeight?: number;
	private cachedLines?: string[];

	constructor(height: number) {
		this.height = height;
	}

	addChild(component: Component): void {
		this.children.push(component);
		this.invalidate();
	}

	removeChild(component: Component): void {
		const index = this.children.indexOf(component);
		if (index !== -1) {
			this.children.splice(index, 1);
			this.invalidate();
		}
	}

	clear(): void {
		this.children = [];
		this.invalidate();
	}

	/**
	 * Set the visible height of the scroll box
	 */
	setHeight(height: number): void {
		if (this.height !== height) {
			this.height = height;
			this.invalidate();
		}
	}

	/**
	 * Get the current scroll position
	 */
	getScrollTop(): number {
		return this.scrollTop;
	}

	/**
	 * Set the scroll position
	 */
	setScrollTop(top: number): void {
		const maxScroll = Math.max(0, this.getTotalHeight() - this.height);
		this.scrollTop = Math.max(0, Math.min(top, maxScroll));
	}

	/**
	 * Scroll to the bottom
	 */
	scrollToBottom(): void {
		this.scrollTop = Math.max(0, this.getTotalHeight() - this.height);
	}

	/**
	 * Get total content height
	 */
	getTotalHeight(): number {
		if (this.children.length === 0) return 0;
		// Render at width 1 to get line counts
		let total = 0;
		for (const child of this.children) {
			const lines = child.render(1);
			total += lines.length;
		}
		return total;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedHeight = undefined;
		this.cachedLines = undefined;
		for (const child of this.children) {
			child.invalidate?.();
		}
	}

	render(width: number): string[] {
		// Check cache
		if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === this.height) {
			return this.cachedLines;
		}

		// Render all children to get full content
		const allLines: string[] = [];
		for (const child of this.children) {
			const childLines = child.render(width);
			for (const line of childLines) {
				allLines.push(line);
			}
		}

		// Apply scrolling - show only the visible portion
		const visibleLines = allLines.slice(this.scrollTop, this.scrollTop + this.height);

		// Pad to height if needed
		while (visibleLines.length < this.height) {
			visibleLines.push("");
		}

		// Update cache
		this.cachedWidth = width;
		this.cachedHeight = this.height;
		this.cachedLines = visibleLines;

		return visibleLines;
	}
}
