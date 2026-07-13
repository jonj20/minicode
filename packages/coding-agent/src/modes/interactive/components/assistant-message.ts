import type { AssistantMessage } from "@earendil-works/pi-ai";
import { type Component, Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const seconds = ms / 1000;
	return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private outputPad: number;
	private lastMessage?: AssistantMessage;
	private hasToolCalls = false;
	private thinkingDurations: Map<number, number> = new Map();
	private expandedBlocks = new Set<number>();

	/** Maps child component to its content index for reverse lookup on click */
	private childToContentIndex: Map<Component, number> = new Map();

	/** Ordered list of content indices for collapsed thinking headers */
	private collapsedThinkingIndices: number[] = [];

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		_hiddenThinkingLabel = "Thinking...",
		outputPad = 1,
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;
		this.outputPad = outputPad;

		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHiddenThinkingLabel(_label: string): void {}

	setOutputPad(padding: number): void {
		this.outputPad = padding;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setThinkingDurations(durations: Map<number, number>): void {
		this.thinkingDurations = durations;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setExpandedBlocks(blocks: Set<number>): void {
		this.expandedBlocks = blocks;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	/**
	 * Given a rendered line number (relative to this component), return the
	 * content index of the thinking block at that line, or -1.
	 */
	getThinkingBlockAtLine(lineIndex: number, renderWidth: number): number {
		let currentLine = 0;
		for (const child of this.contentContainer.children) {
			const childHeight = child.render(renderWidth).length;
			if (childHeight === 0) continue;

			if (lineIndex >= currentLine && lineIndex < currentLine + childHeight) {
				const idx = this.childToContentIndex.get(child);
				if (idx != null) {
					return idx;
				}
				return -1;
			}
			currentLine += childHeight;
		}
		return -1;
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (this.hasToolCalls || lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;
		this.collapsedThinkingIndices = [];
		this.childToContentIndex.clear();

		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				this.contentContainer.addChild(new Markdown(content.text.trim(), this.outputPad, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				const addChild = (child: Component): void => {
					this.childToContentIndex.set(child, i);
					this.contentContainer.addChild(child);
				};

				if (this.hideThinkingBlock) {
					const isExpanded = this.expandedBlocks.has(i);
					if (!isExpanded) {
						const duration = this.thinkingDurations.get(i);
						const label = duration != null ? `+ Thought: ${formatDuration(duration)}` : "Thinking...";
						addChild(new Text(theme.italic(theme.fg("thinkingText", label)), this.outputPad, 0));
						this.collapsedThinkingIndices.push(i);
					} else {
						addChild(
							new Markdown(content.thinking.trim(), this.outputPad, 0, this.markdownTheme, {
								color: (text: string) => theme.fg("thinkingText", text),
								italic: true,
							}),
						);
					}
				} else {
					addChild(
						new Markdown(content.thinking.trim(), this.outputPad, 0, this.markdownTheme, {
							color: (text: string) => theme.fg("thinkingText", text),
							italic: true,
						}),
					);
				}
				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		this.hasToolCalls = hasToolCalls;
		if (message.stopReason === "length") {
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(
				new Text(
					theme.fg(
						"error",
						"Error: Model stopped because it reached the maximum output token limit. The response may be incomplete.",
					),
					this.outputPad,
					0,
				),
			);
		} else if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), this.outputPad, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), this.outputPad, 0));
			}
		}
	}
}
