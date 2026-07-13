// Config utilities
export { CONFIG_DIR_NAME, ENV_AGENT_DIR, getAgentDir } from "./config.ts";

// Frontmatter parsing
export { parseFrontmatter, stripFrontmatter } from "./frontmatter.ts";
// ExtensionHost for runtime dependency injection
export type { ExtensionHost } from "./host.ts";

// Session types
export type {
	BranchSummaryEntry,
	CompactionEntry,
	CustomEntry,
	CustomMessageEntry,
	LabelEntry,
	ModelChangeEntry,
	SessionEntry,
	SessionEntryBase,
	SessionInfoEntry,
	SessionMessageEntry,
	ThinkingLevelChangeEntry,
} from "./session.ts";
// Truncation utilities
export {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type TruncationOptions,
	type TruncationResult,
	truncateHead,
} from "./truncate.ts";
