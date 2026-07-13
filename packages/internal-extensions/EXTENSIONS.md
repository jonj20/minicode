# Internal Extensions Documentation

## Overview

This document describes all internal extensions bundled with minicode. Extensions are loaded automatically from `packages/internal-extensions/src/index.ts`.

---

## Extension List

### 1. p2-context-compact

**Description:** Adaptive context compaction for small-context (8K-16K) and large-context models. Uses DP algorithm for optimal compaction.

**File:** `src/p2-context-compact/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/context-compact` | Show context-compact status |
| Command | `/dp-status` | Show DP compaction status |
| Command | `/dp-eval` | Evaluate DP compaction decision |
| Flag | `--compression-tier` | Force compression strategy |
| Flag | `--small-context` | Enable small-context optimization |

**Events:** `session_start`, `tool_result`, `before_agent_start`, `turn_end`, `session_before_compact`, `agent_end`

---

### 2. p2-context-handoff

**Description:** Context management with spawn (isolated child contexts), ledger (continuity cache), and handoff (task pivot via compaction).

**File:** `src/p2-context-handoff/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `handoff` | Replace active context with compact handoff task |
| Tool | `ledger_add` | Save a compact continuity entry |
| Tool | `ledger_get` | Retrieve a ledger entry by name |
| Tool | `ledger_list` | List all ledger entries |
| Tool | `spawn` | Spawn an isolated child agent |
| Command | `/handoff` | Auto-draft and perform handoff |
| Command | `/ledger` | Interactive ledger browser |

**Events:** `before_agent_start`, `context`, `session_start`, `turn_end`

---

### 3. p2-init

**Description:** Generate AGENTS.md file for the current project.

**File:** `src/p2-init/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/init` | Generate AGENTS.md (use --force to overwrite) |

**Usage:**
- Analyzes project structure (package.json, Cargo.toml, go.mod, etc.)
- Detects platform (Windows/macOS/Linux)
- Generates platform-specific command guidelines
- Extracts build/test/lint commands

---

### 4. pi-hermes-memory

**Description:** Full-featured persistent memory system with SQLite FTS5 search, session history, background learning, auto-consolidation, correction detection, and procedural skills management.

**File:** `src/pi-hermes-memory/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `memory` | Save/update/delete persistent memories (user/memory/project/failure) |
| Tool | `memory_search` | Search memories via SQLite FTS5 |
| Tool | `session_search` | Search indexed past conversations |
| Tool | `skill_manage` | Manage procedural skills (create/view/patch/update/delete) |
| Tool | `scratchpad` | Manage checklist (add/done/undo/list/clear_done) |
| Tool | `memory_write` | Write to memory files (long_term/daily/web_cache) |
| Tool | `memory_read` | Read memory files (long_term/daily/scratchpad/list/search) |
| Command | `/memory-insights` | Show stored memories |
| Command | `/memory-skills` | List procedural skills |
| Command | `/memory-consolidate` | Manual memory consolidation |
| Command | `/memory-interview` | Onboarding interview for user profile |
| Command | `/memory-switch-project` | List project memories |
| Command | `/memory-index-sessions` | Import past sessions |
| Command | `/memory-sync-markdown` | Backfill markdown to SQLite |

**Events:** `session_start`, `before_agent_start`, `message_end`, `session_shutdown`

---

### 5. pi-continue

**Description:** Mid-turn continuation for long tool runs. Saves structured handoff and resumes after compaction when context window fills.

**File:** `src/pi-continue/extensions/continue/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/continue` | Open palette or continue now |
| Command | `/continue steer` | Save handoff and resume |
| Command | `/continue queue` | Wait for idle, then handoff |
| Command | `/continue preview` | Show handoff prompts |
| Command | `/continue status` | Show continuation status |
| Command | `/continue ledger` | Show latest ledger |
| Command | `/continue settings` | Edit settings |
| Command | `/continue reset` | Reset settings |

**Events:** `before_agent_start`, `message_start`, `agent_end`, `message_end`, `context`, `session_before_compact`, `session_compact`, `session_shutdown`

---

### 6. pi-loop-police

**Description:** Detects and breaks infinite loops in real time — thinking loops, tool call loops, file read loops, search spirals, and reasoning stagnation.

**File:** `src/pi-loop-police/extensions/loop-police.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/loop-police` | Show status and config |
| Command | `/loop-police reset` | Clear all state |
| Command | `/loop-police set KEY=VAL` | Tune config live |

**Events:** `agent_start`, `turn_start`, `message_update`, `message_end`, `tool_call`

---

### 7. p2-web-search

**Description:** Web search and fetch using DuckDuckGo.

**File:** `src/p2-web-search/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `web_search` | Search the web using DuckDuckGo |
| Tool | `web_fetch` | Fetch and extract text from URL |
| Command | `/web-cache` | Manage web cache (show/clear/trim) |

---

### 8. pi-btw

**Description:** Side-conversation overlay for tangent questions without polluting main session context.

**File:** `src/pi-btw/extensions/btw.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/btw` | Ask a side question (opens overlay) |
| Command | `/btw:tangent` | Start tangent thread (no context) |
| Command | `/btw:new` | Start new BTW thread |
| Command | `/btw:clear` | Clear BTW history |
| Command | `/btw:inject` | Inject BTW summary into main session |
| Command | `/btw:summarize` | Summarize BTW thread |
| Command | `/btw:model` | Show/set/clear BTW model override |
| Command | `/btw:thinking` | Show/set/clear BTW thinking level |

**Events:** `context`, `session_start`, `session_tree`, `session_shutdown`

---

### 7. pi-caveman

**Description:** Token-saving mode (~75% output reduction) with multiple intensity levels.

**File:** `src/pi-caveman/extensions/caveman.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/caveman` | Toggle/set caveman mode (lite/full/ultra/wenyan/micro/off) |

**Events:** `session_start`, `agent_start`, `agent_end`, `session_shutdown`, `before_agent_start`

---

### 8. pi-command-history

**Description:** Per-folder command history with Ctrl+Up/Down navigation.

**File:** `src/pi-command-history/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Shortcut | `ctrl+up` | Previous command from history |
| Shortcut | `ctrl+down` | Next command from history |

**Events:** `session_start`, `input`

---

### 9. pi-context-prune

**Description:** Context pruning - summarizes and removes old tool-call results from context window.

**File:** `src/pi-context-prune/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `context_prune` | Summarize and prune tool results (agentic-auto mode) |
| Tool | `context_tree_query` | Retrieve pruned tool call results |
| Command | `/pruner` | Configure and trigger context pruning |

**Events:** `session_start`, `session_tree`, `turn_end`, `tool_execution_end`, `message_end`, `agent_end`, `context`, `before_agent_start`

---

### 10. pi-execution-time

**Description:** Execution timers in footer status bar (per-step and session-wide).

**File:** `src/pi-execution-time/index.ts`

**Events:** `session_start`, `context`, `before_agent_start`, `input`, `agent_start`, `message_start`, `agent_end`, `session_shutdown`

---

### 11. pi-goal-x

**Description:** Goal-oriented task management with lifecycle, auto-continuation, Sisyphus mode, and live widget.

**File:** `src/pi-goal-x/goal.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `get_goal` | Get current goal state |
| Tool | `create_goal` | Create a new goal |
| Tool | `complete_goal` | Mark goal as complete |
| Tool | `pause_goal` | Pause current goal |
| Tool | `abort_goal` | Abort current goal |
| Tool | `propose_goal_draft` | Propose goal draft |
| Tool | `propose_goal_tweak` | Propose goal edits |
| Tool | `propose_task_list` | Propose task list |
| Tool | `complete_task` | Mark task as complete |
| Tool | `skip_task` | Skip a task |
| Tool | `goal_question` | Ask user question during drafting |
| Tool | `goal_questionnaire` | Structured questionnaire |
| Command | `/goal` | Show focused goal status |
| Command | `/goal-list` | List all open goals |
| Command | `/goal-focus` | Switch focused goal |
| Command | `/goal-settings` | Goal settings |
| Command | `/goals` | Discuss new goal |
| Command | `/sisyphus` | Discuss Sisyphus goal |
| Command | `/goals-set` | Create goal immediately |
| Command | `/goal-tweak` | Refine current goal |
| Command | `/goal-clear` | Archive current goal |
| Command | `/goal-abort` | Abort current goal |
| Command | `/goal-pause` | Pause running goal |
| Command | `/goal-resume` | Resume paused goal |

**Events:** `context`, `turn_start`, `tool_call`, `tool_execution_end`, `turn_end`, `message_end`, `session_start`, `session_before_compact`, `session_compact`, `session_tree`, `before_agent_start`, `agent_end`, `session_shutdown`

---

### 12. pi-rewind

**Description:** Automatic git-based checkpoints with per-tool granularity for rewinding AI mistakes.

**File:** `src/pi-rewind/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/rewind` | Interactive checkpoint browser and restore |
| Shortcut | `escape escape` | Trigger rewind (double Esc) |

**Events:** `session_start`, `before_agent_start`, `turn_start`, `tool_call`, `tool_execution_end`, `turn_end`, `session_before_fork`, `session_before_tree`, `session_shutdown`

---

### 13. pi-subagents

**Description:** Autonomous sub-agent system with foreground/background execution, worktree isolation, scheduling, and live widget.

**File:** `src/pi-subagents/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `Agent` | Launch sub-agent (foreground/background) |
| Tool | `get_subagent_result` | Check background agent status |
| Tool | `steer_subagent` | Send message to running agent |
| Command | `/agents` | Interactive agent management menu |

**Custom Agents:** Defined in `.minicode/agents/*.md`

**Events:** `session_start`, `session_before_switch`, `tool_execution_start`, `session_shutdown`

**Emitted Events:** `subagents:ready`, `subagents:created`, `subagents:started`, `subagents:completed`, `subagents:failed`, `subagents:steered`, `subagents:compacted`, `subagents:scheduler_ready`, `subagents:settings_loaded`

---

### 15. pi-tasks

**Description:** Task tracking with statuses, dependencies, subagent execution, auto-cascade, and live widget.

**File:** `src/pi-tasks/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `TaskCreate` | Create a task with subject, description, agentType |
| Tool | `TaskList` | List all tasks |
| Tool | `TaskGet` | Get task details by ID |
| Tool | `TaskUpdate` | Update task status/dependencies |
| Tool | `TaskOutput` | Get background task output |
| Tool | `TaskStop` | Stop running background task |
| Tool | `TaskExecute` | Execute tasks as subagents |
| Command | `/tasks` | Interactive task management menu |

**Events:** `turn_start`, `turn_end`, `tool_result`, `context`, `before_agent_start`, `session_switch`, `tool_execution_start`

**Listens:** `subagents:completed`, `subagents:failed`, `subagents:ready`

---

### 16. pi-context-usage

**Description:** Context usage visualization with dot-grid display showing 5 token categories.

**File:** `src/pi-context-usage/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/context` | Show context usage summary with dot-grid |
| Command | `/context details` | Show detailed breakdown (system prompt, tools, conversation) |
| Command | `/release` | Bump package version and push git tag |

**Features:**
- 5 token categories: System Prompt, Tools, Messages, Empty, Buffer
- Keyboard-driven overlay for detailed view
- Release automation with git tag and npm publish

---

### 17. pi-fff

**Description:** FFF-powered fuzzy file and content search with frecency ranking and git awareness.

**File:** `src/pi-fff/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `ffgrep` | Fuzzy grep with smart-case, auto-detect regex/literal |
| Tool | `fffind` | Fuzzy filename search with frecency ranking |
| Tool | `fff-multi-grep` | Multi-pattern OR content search (Aho-Corasick) |
| Command | `/fff-mode` | Show/set FFF mode (tools-and-ui/tools-only/override) |
| Command | `/fff-health` | Show FFF file finder health and status |
| Command | `/fff-rescan` | Trigger FFF to rescan files |
| Flag | `--fff-mode` | Default FFF mode |
| Flag | `--fff-frecency-db` | Path to frecency database |
| Flag | `--fff-history-db` | Path to query history database |
| Flag | `--fff-enable-root-scan` | Allow indexing from filesystem root |

**Events:** `session_start`, `session_shutdown`

---

### 18. pi-lens

**Description:** Context lens with LSP integration, AST analysis, diagnostics, and advanced editing tools.

**File:** `src/pi-lens/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `ast-dump` | Dump AST for a file |
| Tool | `ast-grep-dump` | Dump AST with ast-grep |
| Tool | `ast-grep-outline` | Get file outline using AST |
| Tool | `ast-grep-search` | Search code using AST patterns |
| Tool | `ast-grep-replace` | Replace code using AST patterns |
| Tool | `lens-diagnostics` | Get lens diagnostics |
| Tool | `lsp-diagnostics` | Get LSP diagnostics |
| Tool | `lsp-navigation` | LSP go-to-definition, references, etc. |
| Tool | `module-report` | Get module report |
| Tool | `read-enclosing` | Read enclosing function/class |
| Tool | `read-symbol` | Read a specific symbol |
| Command | `/lens-toggle` | Toggle lens features |
| Command | `/lens-context-toggle` | Toggle context display |
| Command | `/lens-widget-toggle` | Toggle status widget |
| Command | `/lens-tdi` | Toggle tool diagnostics |
| Command | `/lens-health` | Show lens health status |
| Command | `/lens-tools` | Show lens tools status |
| Command | `/lens-allow-edit` | Allow edit for current session |

**Events:** `session_start`, `session_shutdown`, `turn_start`, `turn_end`, `tool_result`, `context`, `before_agent_start`, `agent_end`

---

### 19. pi-mcp-adapter

**Description:** MCP (Model Context Protocol) adapter for connecting to external tool servers.

**File:** `src/pi-mcp-adapter/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Tool | `mcp` | MCP gateway - connect to servers, call tools, search |
| Tool | `<server>_<tool>` | Direct MCP tools (dynamically registered) |
| Command | `/mcp` | Show MCP server status and management |
| Command | `/mcp-auth` | Authenticate with MCP server (OAuth) |
| Flag | `--mcp-config` | Path to MCP config file |

**Events:** `session_start`, `session_shutdown`, `tool_result`

**Features:**
- Direct tool mode for zero-proxy tool calls
- OAuth authentication flow
- Proxy mode for discovering and calling tools dynamically

---

### 20. pi-rtk-optimizer

**Description:** Bash command rewriting and output compaction for token savings.

**File:** `src/pi-rtk-optimizer/src/index.ts`

| Type | Name | Description |
|------|------|-------------|
| Command | `/rtk` | Show/set RTK optimizer config |

**Events:** `session_start`, `tool_result`, `before_agent_start`, `turn_end`

**Features:**
- Automatic bash command rewriting for efficiency
- Tool output compaction (strip ANSI, truncate, aggregate)
- Configurable via `~/.minicode/agent/extensions/pi-rtk-optimizer/config.json`

---

## Summary Table

| Extension | Tools | Commands | Purpose |
|-----------|-------|----------|---------|
| p2-context-compact | 0 | 3 | Context compaction |
| p2-context-handoff | 5 | 2 | Context management |
| p2-init | 0 | 1 | Project initialization |
| p2-web-search | 2 | 1 | Web search/fetch |
| pi-btw | 0 | 8 | Side conversations |
| pi-caveman | 0 | 1 | Token saving |
| pi-command-history | 0 | 0 | Command history |
| pi-context-prune | 2 | 1 | Context pruning |
| pi-context-usage | 0 | 3 | Context visualization |
| pi-execution-time | 0 | 0 | Execution timers |
| pi-fff | 3 | 3 | Fuzzy file search |
| pi-goal-x | 13 | 14 | Goal management |
| pi-hermes-memory | 7 | 6 | Persistent memory |
| pi-lens | 11 | 7 | LSP/AST tools |
| pi-loop-police | 0 | 1 | Loop detection |
| pi-mcp-adapter | 2 | 2 | MCP adapter |
| pi-rewind | 0 | 1 | Git checkpoints |
| pi-rtk-optimizer | 0 | 1 | Bash optimization |
| pi-subagents | 3 | 1 | Sub-agent system |
| pi-tasks | 7 | 1 | Task tracking |

**Total:** 55 tools, 60 commands

---

## All Commands Quick Reference

### Task & Goal Management

| Command | Extension | Description |
|---------|-----------|-------------|
| `/tasks` | pi-tasks | Interactive task management menu (view/create/clear/settings) |
| `/goal` | pi-goal-x | Show focused goal status |
| `/goal-list` | pi-goal-x | List all open goals |
| `/goal-focus` | pi-goal-x | Switch focused goal |
| `/goal-settings` | pi-goal-x | Goal settings (auditor provider/model) |
| `/goals` | pi-goal-x | Discuss a new goal (drafting flow) |
| `/sisyphus` | pi-goal-x | Discuss a Sisyphus goal (strict ordered steps) |
| `/goals-set` | pi-goal-x | Create goal immediately from objective |
| `/goal-tweak` | pi-goal-x | Refine current goal via interview |
| `/goal-clear` | pi-goal-x | Archive current goal |
| `/goal-abort` | pi-goal-x | Abort current goal |
| `/goal-pause` | pi-goal-x | Pause running goal |
| `/goal-resume` | pi-goal-x | Resume paused goal |

### Sub-Agent Management

| Command | Extension | Description |
|---------|-----------|-------------|
| `/agents` | pi-subagents | Interactive agent management (types/running/scheduled/settings) |

### Context Management

| Command | Extension | Description |
|---------|-----------|-------------|
| `/context-compact` | p2-context-compact | Show context-compact status |
| `/dp-status` | p2-context-compact | Show DP compaction status |
| `/dp-eval` | p2-context-compact | Evaluate DP compaction decision |
| `/pruner` | pi-context-prune | Configure and trigger context pruning |
| `/handoff` | p2-context-handoff | Auto-draft and perform context handoff |
| `/ledger` | p2-context-handoff | Interactive ledger browser |
| `/context` | pi-context-usage | Show context usage summary |
| `/context details` | pi-context-usage | Show detailed context breakdown |

### Side Conversation

| Command | Extension | Description |
|---------|-----------|-------------|
| `/btw` | pi-btw | Ask a side question (opens overlay) |
| `/btw:tangent` | pi-btw | Start tangent thread (no context) |
| `/btw:new` | pi-btw | Start new BTW thread |
| `/btw:clear` | pi-btw | Clear BTW history |
| `/btw:inject` | pi-btw | Inject BTW summary into main session |
| `/btw:summarize` | pi-btw | Summarize BTW thread |
| `/btw:model` | pi-btw | Show/set/clear BTW model override |
| `/btw:thinking` | pi-btw | Show/set/clear BTW thinking level |

### Project Initialization

| Command | Extension | Description |
|---------|-----------|-------------|
| `/init` | p2-init | Generate AGENTS.md for current project |

### Web & Token Saving

| Command | Extension | Description |
|---------|-----------|-------------|
| `/web-cache` | p2-web-search | Manage web cache (show/clear/trim) |
| `/caveman` | pi-caveman | Toggle/set caveman mode (lite/full/ultra/wenyan/micro/off) |
| `/rtk` | pi-rtk-optimizer | Show/set RTK optimizer config |

### File Search

| Command | Extension | Description |
|---------|-----------|-------------|
| `/fff-mode` | pi-fff | Show/set FFF mode (tools-and-ui/tools-only/override) |
| `/fff-health` | pi-fff | Show FFF file finder health and status |
| `/fff-rescan` | pi-fff | Trigger FFF to rescan files |

### LSP & Code Analysis

| Command | Extension | Description |
|---------|-----------|-------------|
| `/lens-toggle` | pi-lens | Toggle lens features |
| `/lens-context-toggle` | pi-lens | Toggle context display |
| `/lens-widget-toggle` | pi-lens | Toggle status widget |
| `/lens-tdi` | pi-lens | Toggle tool diagnostics |
| `/lens-health` | pi-lens | Show lens health status |
| `/lens-tools` | pi-lens | Show lens tools status |
| `/lens-allow-edit` | pi-lens | Allow edit for current session |

### MCP

| Command | Extension | Description |
|---------|-----------|-------------|
| `/mcp` | pi-mcp-adapter | Show MCP server status and management |
| `/mcp-auth` | pi-mcp-adapter | Authenticate with MCP server (OAuth) |

### Memory

| Command | Extension | Description |
|---------|-----------|-------------|
| `/memory-insights` | pi-hermes-memory | Show stored memories |
| `/memory-skills` | pi-hermes-memory | List procedural skills |
| `/memory-consolidate` | pi-hermes-memory | Manual memory consolidation |
| `/memory-interview` | pi-hermes-memory | Onboarding interview for user profile |
| `/memory-switch-project` | pi-hermes-memory | List project memories |
| `/memory-index-sessions` | pi-hermes-memory | Import past sessions |
| `/memory-sync-markdown` | pi-hermes-memory | Backfill markdown to SQLite |

### Utilities

| Command | Extension | Description |
|---------|-----------|-------------|
| `/rewind` | pi-rewind | Interactive checkpoint browser and restore |
| `/loop-police` | pi-loop-police | Show status and config |
| `/loop-police reset` | pi-loop-police | Clear all state |
| `/loop-police set KEY=VAL` | pi-loop-police | Tune config live |

### Keyboard Shortcuts

| Shortcut | Extension | Description |
|----------|-----------|-------------|
| `ctrl+up` | pi-command-history | Previous command from history |
| `ctrl+down` | pi-command-history | Next command from history |
| `escape escape` | pi-rewind | Trigger rewind (double Esc) |

---

## Built-in Commands (coding-agent)

### Session Management

| Command | Description |
|---------|-------------|
| `/new` | Start a new session |
| `/resume` | Resume a different session |
| `/fork` | Create a new fork from a previous user message |
| `/clone` | Duplicate the current session at the current position |
| `/tree` | Navigate session tree (switch branches) |
| `/session` | Show session info and stats |
| `/name` | Set session display name |
| `/export` | Export session (HTML default, or specify path: .html/.jsonl) |
| `/import` | Import and resume a session from a JSONL file |

### Model & Settings

| Command | Description |
|---------|-------------|
| `/model` | Select model (opens selector UI) |
| `/scoped-models` | Enable/disable models for Ctrl+P cycling |
| `/settings` | Open settings menu |
| `/trust` | Save project trust decision for future sessions |
| `/login` | Configure provider authentication |
| `/logout` | Remove provider authentication |

### Context & Output

| Command | Description |
|---------|-------------|
| `/compact` | Manually compact the session context |
| `/copy` | Copy last agent message to clipboard |
| `/share` | Share session as a secret GitHub gist |

### Utilities

| Command | Description |
|---------|-------------|
| `/reload` | Reload keybindings, extensions, skills, prompts, and themes |
| `/hotkeys` | Show all keyboard shortcuts |
| `/changelog` | Show changelog entries |
| `/debug` | Debug info (internal) |
| `/quit` | Quit minicode |

### Plan Mode

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode (read-only exploration) |

### Easter Eggs

| Command | Description |
|---------|-------------|
| `/arminsayshi` | Easter egg |
| `/dementedelves` | Easter egg |

---

## Complete Commands Summary

### By Category

| Category | Commands |
|----------|----------|
| **Task/Goal** | `/tasks`, `/goal`, `/goal-list`, `/goal-focus`, `/goal-settings`, `/goals`, `/sisyphus`, `/goals-set`, `/goal-tweak`, `/goal-clear`, `/goal-abort`, `/goal-pause`, `/goal-resume` |
| **Sub-Agent** | `/agents` |
| **Context** | `/compact`, `/context-compact`, `/dp-status`, `/dp-eval`, `/pruner`, `/handoff`, `/ledger`, `/context`, `/context details` |
| **Session** | `/new`, `/resume`, `/fork`, `/clone`, `/tree`, `/session`, `/name`, `/export`, `/import` |
| **Side Conversation** | `/btw`, `/btw:tangent`, `/btw:new`, `/btw:clear`, `/btw:inject`, `/btw:summarize`, `/btw:model`, `/btw:thinking` |
| **Project Init** | `/init` |
| **Model/Settings** | `/model`, `/scoped-models`, `/settings`, `/trust`, `/login`, `/logout` |
| **Token Saving** | `/caveman`, `/rtk` |
| **File Search** | `/fff-mode`, `/fff-health`, `/fff-rescan` |
| **LSP/Code** | `/lens-toggle`, `/lens-context-toggle`, `/lens-widget-toggle`, `/lens-tdi`, `/lens-health`, `/lens-tools`, `/lens-allow-edit` |
| **MCP** | `/mcp`, `/mcp-auth` |
| **Web** | `/web-cache` |
| **Memory** | `/memory-insights`, `/memory-skills`, `/memory-consolidate`, `/memory-interview`, `/memory-switch-project`, `/memory-index-sessions`, `/memory-sync-markdown` |
| **Utilities** | `/reload`, `/hotkeys`, `/changelog`, `/debug`, `/quit`, `/copy`, `/share`, `/plan`, `/rewind`, `/release`, `/loop-police` |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `ctrl+up` | Previous command from history |
| `ctrl+down` | Next command from history |
| `ctrl+alt+p` | Toggle plan mode |
| `tab` | Toggle plan mode |
| `escape escape` | Trigger rewind |
| `ctrl+shift+b` | BTW side question |

### Statistics

- **Built-in commands:** 22
- **Extension commands:** 60
- **Total commands:** 82
- **Keyboard shortcuts:** 6
