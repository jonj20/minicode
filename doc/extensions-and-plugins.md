# minicode 扩展系统

> 21 个内置扩展架构、第三方插件推荐、安装管理指南。

---

## 目录

1. [插件安装与管理](#1-插件安装与管理)
2. [内置扩展 (Internal Extensions)](#2-内置扩展-internal-extensions)
3. [扩展加载架构](#3-扩展加载架构)
4. [Pi 插件生态兼容](#4-pi-插件生态兼容)

---

## 1. 插件安装与管理

### 1.1 命令行安装

```bash
# 从 npm 安装
minicode install npm:@foo/bar

# 从 git 仓库安装
minicode install git:github.com/user/repo
minicode install git:git@github.com:user/repo
minicode install https://github.com/user/repo

# 从本地路径安装
minicode install ./local/path

# 安装到项目级（-l）
minicode install npm:@foo/bar -l

# 安装到全局（默认）
minicode install npm:@foo/bar
```

### 1.2 管理命令

```bash
minicode list                    # 列出已安装的插件
minicode remove npm:@foo/bar     # 移除插件
minicode uninstall npm:@foo/bar  # 移除插件
minicode update --extensions     # 更新所有插件
minicode update npm:@foo/bar     # 更新指定插件
minicode config                  # 交互式配置
```

### 1.3 安装位置

| 选项 | 安装位置 | 配置文件 |
|------|----------|----------|
| 默认（全局） | `~/.minicode/extensions/` | `~/.minicode/settings.json` |
| `-l`（项目级） | `.minicode/extensions/` | `.minicode/settings.json` |

### 1.4 支持的源格式

- `npm:<package>` — npm 包
- `git:<url>` — git 仓库
- `https://<url>` — HTTPS URL
- `ssh://<url>` — SSH URL
- `./<path>` — 本地路径

### 1.5 插件格式

插件是 TypeScript/JavaScript 模块，导出一个默认函数：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 注册工具
  pi.registerTool({
    name: "my-tool",
    description: "My custom tool",
    parameters: { /* ... */ },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "result" }] };
    },
  });

  // 注册命令
  pi.registerCommand("my-cmd", {
    description: "My command",
    handler: async (args, ctx) => { /* ... */ },
  });

  // 监听事件
  pi.on("before_agent_start", async (event) => { /* ... */ });
}
```

### 1.6 package.json 声明

目录插件可以通过 `package.json` 声明入口：

```json
{
  "name": "my-minicode-plugin",
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

---

## 2. 内置扩展 (Internal Extensions)

### 2.1 概述

minicode 实现 21 个内置扩展，自动加载，无需 CLI 标志。

### 2.2 目录结构

```
internal-extensions/src/
├── index.ts                          # 统一入口，注册21个扩展工厂
├── compaction-strategy.ts            # 共享模块：统一 compact/handoff 决策矩阵
├── pi-caveman/                       # 输出压缩省token
├── pi-command-history/               # 按目录命令历史
├── pi-context-prune/                 # 上下文裁剪摘要
├── pi-context-usage/                 # 上下文使用可视化
├── pi-execution-time/                # 执行计时显示
├── pi-goal-x/                        # 目标追踪+自主执行
├── pi-btw/                           # 旁问浮动面板
├── pi-rtk-optimizer/                 # bash命令重写+输出压缩
├── p2-context-compact/               # 自适应上下文压缩（DP算法）
├── p2-context-handoff/               # 上下文生命周期管理（spawn/ledger/handoff）
├── p2-init/                          # 项目初始化
├── p2-web-search/                    # 网页搜索与抓取
├── pi-continue/                      # 会话继续
├── pi-fff/                           # 模糊文件和内容搜索
├── pi-hermes-memory/                 # 持久化记忆系统
├── pi-lens/                          # 上下文透镜
├── pi-loop-police/                   # 循环检测防护
├── pi-mcp-adapter/                   # MCP 适配器
├── pi-rewind/                        # 会话回退
└── pi-subagents/                     # 子代理委托
```

### 2.3 各扩展详情

| # | 扩展 | 功能 | LLM 工具 | 命令 | 快捷键 | 配置/存储位置 |
|---|------|------|----------|------|--------|---------------|
| 1 | **pi-caveman** | 输出压缩省token，支持8个强度级别 | - | `/caveman` | - | `~/.pi/agent/caveman.json` |
| 2 | **pi-command-history** | 按文件夹保存命令历史，翻阅上一条 | - | - | `ctrl+up/down` | `~/.pi/folder-history/*.jsonl` |
| 3 | **pi-context-prune** | 摘要压缩工具输出，释放上下文空间 | `context_prune`, `context_tree_query` | `/pruner` | - | `~/.pi/agent/context-prune/settings.json` |
| 4 | **pi-context-usage** | 上下文使用可视化（5类） | - | `/context`, `/context details` | - | 仅内存 |
| 5 | **pi-execution-time** | 跟踪显示每个步骤和整体会话的执行时间 | - | - | - | 仅 session entries |
| 6 | **pi-goal-x** | 目标追踪+自主执行+Sisyphus模式+完成审计 | `get_goal`, `propose_goal_draft`, `complete_goal`, `pause_goal`, `abort_goal`, `propose_goal_tweak`, `propose_task_list`, `complete_task`, `skip_task`, `goal_question`, `goal_questionnaire` | `/goal`, `/goals`, `/sisyphus` 等14个 | `escape`, `ctrl+shift+t/x` | `~/.pi/goals/` |
| 7 | **pi-btw** | 旁问：主agent工作时提快速问题 | - | `/btw` | `ctrl+shift+b` | session entries |
| 8 | **pi-rtk-optimizer** | bash命令重写+工具输出压缩 | - | `/rtk` | - | `~/.minicode/agent/extensions/pi-rtk-optimizer/config.json` |
| 9 | **p2-context-compact** | 自适应压缩：3级策略+DP最优切点算法 | - | `/context-compact`, `/dp-status`, `/dp-eval` | - | 仅内存 |
| 10 | **p2-context-handoff** | spawn隔离子会话、ledger连续性缓存、handoff任务转向 | `ledger_add`, `ledger_get`, `ledger_list`, `handoff`, `spawn` | `/handoff`, `/ledger` | - | session entries (ledger-entry) |
| 11 | **p2-init** | 项目初始化向导 | - | `/init` | - | 无 |
| 12 | **p2-web-search** | DuckDuckGo搜索+URL抓取，带重试和缓存 | `web_search`, `web_fetch` | `/web-cache` | - | `~/.pi/agent/memory/web-cache.md` |
| 13 | **pi-continue** | 会话继续 | - | - | - | 仅 session entries |
| 14 | **pi-fff** | 模糊文件和内容搜索 | - | `/fff` | - | 仅内存 |
| 15 | **pi-hermes-memory** | 持久化记忆：长期记忆、每日日志 | `memory_write`, `memory_read` | - | - | `~/.pi/agent/memory/` |
| 16 | **pi-lens** | 上下文透镜：查看上下文内容 | - | `/lens-context-toggle` | - | 仅内存 |
| 17 | **pi-loop-police** | 循环检测防护：防止无限循环 | - | - | - | 仅内存 |
| 18 | **pi-mcp-adapter** | MCP 适配器：统一接入 MCP 工具 | - | - | - | 仅内存 |
| 19 | **pi-rewind** | 会话回退：回退到之前的会话状态 | - | `/rewind` | - | 仅 session entries |
| 20 | **pi-subagents** | 子代理委托：single/parallel/chain三种模式，最多8并发 | `subagent` | - | - | `~/.pi/agent/agents/*.md` |
| 21 | **pi-tasks** | 轻量任务分解：JSONL持久化，支持子任务和自动执行 | `task_create`, `task_start`, `task_block`, `task_done`, `task_list`, `task_get`, `task_execute` | - | - | `~/.pi/agent/tasks/tasks.jsonl` |

### 2.4 各扩展配置详情

#### pi-caveman (洞穴人模式)

强度级别：`off`, `lite`, `full`, `ultra`, `wenyan-lite`, `wenyan`, `wenyan-ultra`, `micro`

配置文件 `~/.pi/agent/caveman.json`：
```json
{ "defaultLevel": "full", "showStatus": true }
```

#### pi-command-history (命令历史)

- 路径中的 `/` 和 `\` 都替换为 `-` 作为文件名
- 每个目录一个 JSONL 文件，最多 500 条记录
- JSONL 格式：`{"cwd":"...","text":"...","ts":1234567890}`

#### pi-context-prune (上下文裁剪)

配置 `~/.pi/agent/context-prune/settings.json`：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | bool | false | 主开关 |
| `showPruneStatusLine` | bool | true | 状态栏显示 |
| `summarizerModel` | string | "default" | 摘要模型 |
| `summarizerThinking` | enum | "default" | 推理级别 |
| `pruneOn` | enum | "agent-message" | 触发时机 |
| `batchingMode` | enum | "turn" | 批处理粒度 |

`pruneOn` 模式：`every-turn`, `on-context-tag`, `on-demand`, `agent-message`, `agentic-auto`

#### pi-goal-x (目标追踪)

配置 `.pi/pi-goal-x-settings.json`（可通过 `PI_GOAL_SETTINGS_FILE` 环境变量覆盖）：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `disabled` | bool | false | 禁用独立审计器 |
| `provider` | string | 主模型 | 审计器 LLM |
| `model` | string | 主模型 ID | 审计器模型 |
| `thinkingLevel` | enum | unset | 审计器推理预算 |
| `disableTasks` | bool | false | 隐藏任务工具 |
| `disableContracts` | bool | false | 跳过验证契约 |
| `subtaskDepth` | int | 1 | 最大子任务嵌套 |

环境变量覆盖：`PI_GOAL_DISABLE_TASKS`, `PI_GOAL_DISABLE_CONTRACTS`, `PI_GOAL_AUTO_CONFIRM`

存储：
- `~/.pi/goals/active_goal_*.md` — 活跃目标（原子写入）
- `~/.pi/goals/archived/goal_*.md` — 已归档目标
- `~/.pi/goals/goal_events.jsonl` — 事件日志（15种事件类型）

#### pi-rtk-optimizer (RTK优化器)

配置 `~/.minicode/agent/extensions/pi-rtk-optimizer/config.json`：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | true | 启用/禁用 |
| `mode` | "rewrite" | rewrite（自动改写）或 suggest（建议） |
| `guardWhenRtkMissing` | true | RTK 缺失时防护 |
| `showRewriteNotifications` | true | 显示改写通知 |
| `outputCompaction.enabled` | true | 输出压缩 |
| `outputCompaction.stripAnsi` | true | 剥离 ANSI |
| `outputCompaction.truncate.maxChars` | 12000 | 截断上限 |
| `outputCompaction.sourceCodeFiltering` | "none" | none/minimal/aggressive |
| `outputCompaction.smartTruncate.maxLines` | 220 | 智能截断行数 |
| `outputCompaction.aggregateTestOutput` | true | 聚合测试输出 |
| `outputCompaction.filterBuildOutput` | true | 过滤构建输出 |
| `outputCompaction.compactGitOutput` | true | 压缩 git 输出 |
| `outputCompaction.aggregateLinterOutput` | true | 聚合 linter 输出 |
| `outputCompaction.groupSearchOutput` | true | 分组搜索输出 |

#### p2-context-compact (自适应上下文压缩)

压缩策略（按上下文窗口自动选择）：

| 参数 | Aggressive (≤16K) | Balanced (≤128K) | Conservative (>128K) |
|------|-----|---------|------|
| compactThreshold | 0.6 | 0.75 | 0.88 |
| reserveTokens | 8192 | 16384 | 32768 |
| maxToolOutputLines | 200 | 1000 | 2000 |
| maxToolOutputBytes | 8KB | 32KB | 64KB |
| earlyCompactAt | 0.55 | 0.70 | 0.85 |

DP 算法参数可通过环境变量覆盖：`DP_P_INPUT`, `DP_P_CACHE`, `DP_P_OUT`, `DP_V`, `DP_S`, `DP_R`, `DP_BETA` 等。

CLI 标志：`--compression-tier`, `--small-context`

#### p2-context-handoff (上下文交接)

三个原语：
- **spawn**: 隔离子任务执行（继承父模型、工具，不含 spawn/handoff）
- **ledger**: 稀疏连续性缓存（内存 Map，持久化到 session entries）
- **handoff**: 通过压缩替换上下文（引用 ledger 条目）

上下文使用率阈值：30%（primacy-zone）, 50%, 70%, 90%

#### pi-hermes-memory (持久记忆)

三级记忆系统：
- `MEMORY.md` — 长期策展记忆
- `daily/YYYY-MM-DD.md` — 每日日志（30天保留）
- `SCRATCHPAD.md` — checkbox 风格待办

`context` hook 会将 MEMORY.md、今日日志、web-cache.md 注入到 LLM 上下文。

#### p2-web-search (网页搜索/抓取)

- 搜索：DuckDuckGo Lite HTML 抓取，3种解析策略
- 抓取：HTML → 纯文本，剥离 script/style/nav 等标签
- 安全：屏蔽 localhost、内网地址
- 限制：5MB 响应上限，15s 超时，最多 3 次重试
- 缓存：`web-cache.md` 最多 50 条，自动轮转

#### pi-tasks (任务追踪)

- JSONL 追加式存储，超过 500 行自动压缩
- 子任务超时：5 分钟
- 自动执行上限：20 步
- `task_execute` 创建隔离 agent session 执行子任务

#### pi-subagents (子代理)

内置 5 个代理定义：

| 代理 | 模型 | 工具 | 用途 |
|------|------|------|------|
| scout | claude-haiku-4-5 | read, grep, find, ls, bash | 快速代码库侦察 |
| planner | claude-sonnet-4-5 | read, grep, find, ls | 创建实现计划 |
| reviewer | claude-sonnet-4-5 | read, grep, find, ls, bash | 代码审查 |
| worker | claude-sonnet-4-5 | 全部 | 通用任务 |
| small | 自动 | read, edit, write | 轻量级小上下文模型 |

链式工作流模板：`implement.md`, `scout-and-plan.md`, `implement-and-review.md`

代理发现路径：`~/.pi/agent/agents/*.md`（用户级），`<cwd>/.pi/agents/*.md`（项目级）

#### p2-init (项目初始化)

交互式向导，帮助用户在新项目中创建配置文件。

命令：`/init`

#### pi-continue (会话继续)

在新会话中恢复之前的上下文状态，继续之前的工作。

#### pi-fff (模糊文件搜索)

模糊文件名和文件内容搜索，支持 glob 模式匹配。

命令：`/fff`

#### pi-lens (上下文透镜)

查看当前上下文内容，支持切换显示模式。

命令：`/lens-context-toggle`

#### pi-loop-police (循环检测)

检测 agent 陷入重复操作循环，自动注入打破循环的提示。

#### pi-mcp-adapter (MCP 适配器)

统一接入 MCP (Model Context Protocol) 工具，支持 stdio 和 SSE 两种传输方式。

#### pi-rewind (会话回退)

回退到会话中的任意历史状态。

命令：`/rewind`

#### pi-context-usage (上下文使用可视化)

显示 5 类 token 占用比例：
- System Prompt（系统提示）
- Tools（工具定义）
- Messages（对话消息）
- Empty（空闲空间）
- Buffer（输出缓冲）

命令：
- `/context` — 显示点阵图摘要
- `/context details` — 显示详细分解（支持键盘驱动覆盖层）

### 2.5 共享模块

#### compaction-strategy.ts

协调 `p2-context-compact`（简单压缩）和 `p2-context-handoff`（完整上下文替换）的决策矩阵：

| 上下文使用率 | 策略 | 说明 |
|-------------|------|------|
| < 50% | none | 无需操作 |
| 50-70% | compact | 简单压缩释放空间 |
| 70-85% | handoff | 完整上下文替换 |
| > 85% | compact | 紧急压缩防止溢出 |

### 2.6 加载方式

| 运行时 | 加载方式 | 优先级 |
|--------|----------|--------|
| Bun binary | 编译时嵌入，直接函数调用 | 最高 |
| Node.js | jiti 文件系统扫描 | 最低 |

---

## 3. 扩展加载架构

### 3.1 加载来源

| 来源 | 路径 | 优先级 |
|------|------|--------|
| CLI `--extension` | 用户指定路径 | 最高 |
| 项目级 | `cwd/.minicode/extensions/` | 中 |
| 全局 | `~/.minicode/agent/extensions/` | 低 |
| 内置 (Node) | `packages/internal-extensions/` | 最低 |
| 内置 (Bun) | 编译时嵌入 | 最高 |

### 3.2 性能对比

| 维度 | 内置扩展 | 外部扩展 |
|------|----------|----------|
| Bun binary | 直接函数调用，零 I/O | jiti 转译 + 模块加载 |
| Node.js | jiti 转译 | jiti 转译 |
| 信任检查 | 跳过（内置可信） | 两阶段加载 |

### 3.3 通信模式

runner.ts 对所有扩展统一处理：

```typescript
// 工具注册 — 共享同一个 registry，先注册的赢
for (const ext of this.extensions) {
    for (const [name, tool] of ext.tools) { ... }
}

// 事件分发 — 遍历所有 extensions 的 handler
for (const ext of this.extensions) {
    const handlers = ext.handlers.get(event.type);
    for (const handler of handlers) { await handler(event, ctx); }
}
```

### 3.4 构建流程

```
内部扩展:
  源码 → esbuild 打包 → register-builtins.js
  → Bun 二进制编译时嵌入

外部扩展:
  无构建步骤 → 运行时 jiti 直接加载 .ts/.js
```

---

## 4. Pi 插件生态兼容

### 4.1 兼容目标

minicode 保持自有 21 个内置扩展的同时，支持复用 pi 社区的插件生态。

### 4.2 Extension 格式兼容

| 特性 | 说明 |
|------|------|
| 格式 | TypeScript 模块，通过 `jiti` 运行时加载 |
| 入口 | 导出 `default function (pi: ExtensionAPI)` |
| 核心 API | `pi.on()`, `pi.registerTool()`, `pi.registerCommand()`, `pi.registerShortcut()`, `pi.registerFlag()` |
| 事件覆盖 | 30+ 种事件 |

### 4.3 Skill 格式兼容

| 特性 | 说明 |
|------|------|
| 格式 | 目录内含 `SKILL.md`（frontmatter + 指令） |
| 加载路径 | `.minicode/skills/`、`~/.minicode/agent/skills/` |
| 规范 | 遵循 [Agent Skills 标准](https://agentskills.io/specification) |

### 4.4 冲突处理策略

| 冲突类型 | 处理策略 |
|----------|----------|
| 工具同名 | 内置工具优先，外部工具自动加前缀 |
| 事件处理 | 按加载顺序执行，内置扩展先 |
| 命令同名 | 数字后缀自动分配（如 `/review:1`） |
| Skill 同名 | 内置 skill-enhancer 管理的技能优先 |

### 4.5 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| API 不兼容 | 逐步扩展 API，先支持简单扩展 |
| 事件顺序不一致 | 严格按原版事件顺序实现 |
| TUI 组件不兼容 | 降级为简单对话框 |
| jiti 加载性能 | 异步加载 + 缓存编译结果 |

---

## 5. 第三方插件推荐

### 5.1 核心工具增强

> 注意：pi-fff、pi-mcp-adapter 已内置，无需安装。

| 插件 | GitHub | 说明 | 使用建议 |
|------|--------|------|----------|
| **pi-chrome** | [github.com/tianrendong/pi-chrome](https://github.com/tianrendong/pi-chrome) | 操作已登录的 Chrome | 强烈建议保留 |
| **pi-web-access** | [github.com/nicobailon/pi-web-access](https://github.com/nicobailon/pi-web-access) | 通用联网：搜索、URL 抓取、GitHub clone | 强烈建议保留 |
| **pi-lsp** | - | LSP 语言服务器集成 | 按需使用 |

### 5.2 性能与优化

> 注意：pi-caveman、pi-rtk-optimizer、pi-context-prune、pi-execution-time、pi-context-usage 已内置，无需安装。

| 插件 | GitHub | 说明 | 使用建议 |
|------|--------|------|----------|
| **pi-cache-graph** | [github.com/championswimmer/pi-cache-graph](https://github.com/championswimmer/pi-cache-graph) | 监控 LLM context cache usage | 建议安装 |

### 5.3 并发与协作

> 注意：pi-subagents、pi-btw 已内置，无需安装。

| 插件 | GitHub | 说明 | 使用建议 |
|------|--------|------|----------|
| (无额外推荐) | - | - | 内置已覆盖 |

### 5.4 代码编辑与开发

> 注意：pi-command-history 已内置，无需安装。

| 插件 | GitHub | 说明 | 使用建议 |
|------|--------|------|----------|
| **pi-mono-multi-edit** | [github.com/emanuelcasco/pi-mono-multi-edit](https://github.com/emanuelcasco/pi-mono-multi-edit) | 多文件批量编辑，支持 atomic rollback | 强烈建议保留 |
| **pi-llama-cpp** | - | llama.cpp 本地模型集成 | 本地跑 llama.cpp 时保留 |

### 5.5 插件详情

#### pi-mono-multi-edit（外部）

- **功能**: 替换内置 edit，支持 classic edit、multi-file batch edit、Codex-style patch
- **特性**: virtual filesystem preflight validation、atomic rollback、diff generation、冗余 edit 检测

#### pi-web-access（外部）

- **功能**: 网页搜索、URL 抓取、GitHub repo clone、PDF 提取、YouTube 视频理解
- **支持**: Exa、Perplexity、Gemini API 等 fallback
- **注意**: 内置 p2-web-search 已覆盖基本搜索和抓取

---

## 6. 小上下文模型 (8K-16K) 优先级分析

### 6.1 设计目标

让 8K-16K 上下文窗口的模型也能完成复杂任务。核心瓶颈是 token —— 既要省着用（减少消耗），又要管好（压缩/交接）。

### 6.2 插件价值分层

#### 第一梯队：Token 效率（省 token）— 内置已覆盖

| 内置扩展 | 价值 | 原因 |
|----------|------|------|
| **pi-caveman** | 极高 | 输出压缩 75%，小模型 output token 有限，直接省 |
| **pi-rtk-optimizer** | 极高 | bash 输出压缩 + 命令改写，测试/构建/grep 输出吃 token 最凶 |

#### 第二梯队：上下文管理（管好 token）— 内置已覆盖

| 内置扩展 | 价值 | 原因 |
|----------|------|------|
| **p2-context-compact** | 高 | DP 最优切点算法，自适应 3 级策略 |
| **pi-context-prune** | 高 | 裁剪不相关历史，配合 compact 效果翻倍 |
| **p2-context-handoff** | 高 | spawn/ledger/handoff 三原语 |

#### 第三梯队：分工协作（用好 token）— 内置已覆盖

| 内置扩展 | 价值 | 原因 |
|----------|------|------|
| **pi-subagents** | 高 | single/parallel/chain，5 种内置代理 |
| **pi-btw** | 中 | 不污染主会话的支线探索 |

#### 第四梯队：辅助工具

| 内置扩展 | 价值 | 原因 |
|----------|------|------|
| **pi-tasks** | 高 | 任务分解 + 自动执行 |
| **pi-goal-x** | 高 | 目标追踪 + 自主执行 + 完成审计 |
| **pi-hermes-memory** | 高 | 持久记忆，小模型跨会话保持上下文 |
| **p2-web-search** | 中 | 网页搜索/抓取 |
| **pi-fff** | 中 | 模糊文件搜索 |
| **pi-command-history** | 中 | 命令历史翻阅 |
| **pi-execution-time** | 低 | 执行计时 |

可选安装外部插件：
- **pi-cache-graph**: 监控 cache hit，评估 compact 对 prefix cache 的影响
- **pi-mono-multi-edit**: atomic rollback 减少重试，小模型犯错代价更大

#### 低价值 — 与目标关联弱

| 插件 | 原因 |
|------|------|
| pi-chrome / pi-web-access | 联网能力，和小模型适配无关 |
| pi-lsp | IDE 级补全，小模型本身能力限制 |
| pi-llama-cpp | 本地模型接入，场景不同 |

### 6.3 推荐安装顺序

```bash
# 第一梯队：token 效率（必装）— 内置已包含 pi-caveman、pi-rtk-optimizer
# 无需额外安装

# 第二梯队：上下文管理（推荐）— 内置已包含 p2-context-compact、pi-context-prune
# 无需额外安装

# 第三梯队：分工协作（推荐）— 内置已包含 pi-subagents、pi-btw
# 无需额外安装

# 第四梯队：按需安装外部插件
minicode install npm:pi-cache-graph      # 缓存命中监控
minicode install npm:pi-mono-multi-edit  # 多文件批量编辑
```

### 6.4 内置扩展全貌

```
┌─────────────────────────────────────────────────────────┐
│                    小模型适配                              │
│                                                         │
│  输出压缩层                                              │
│  ├── pi-caveman: 8级输出压缩（省~75% output token）      │
│  └── pi-rtk-optimizer: bash命令重写 + 输出压缩           │
│                                                         │
│  上下文管理层                                            │
│  ├── p2-context-compact: 3级策略 + DP最优切点算法        │
│  ├── p2-context-handoff: spawn/ledger/handoff 三原语     │
│  └── pi-context-prune: 工具输出摘要裁剪                  │
│                                                         │
│  任务与目标层                                            │
│  ├── pi-tasks: 任务分解 + 自动执行                       │
│  └── pi-goal-x: 目标追踪 + 自主执行 + 完成审计           │
│                                                         │
│  子代理层                                                │
│  └── pi-subagents: single/parallel/chain，5种内置代理    │
│                                                         │
│  辅助功能层                                              │
│  ├── pi-hermes-memory: 持久记忆（长期+每日）             │
│  ├── p2-web-search: 网页搜索/抓取                        │
│  ├── pi-fff: 模糊文件搜索                               │
│  ├── pi-command-history: 按目录命令历史                  │
│  ├── pi-execution-time: 执行计时                        │
│  ├── pi-btw: 旁问浮动面板                               │
│  ├── pi-context-usage: 上下文使用可视化                  │
│  ├── pi-lens: 上下文透镜                                │
│  ├── pi-loop-police: 循环检测防护                        │
│  ├── pi-rewind: 会话回退                                │
│  ├── pi-continue: 会话继续                              │
│  └── p2-init: 项目初始化                                │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 内部扩展与外部插件兼容性

### 7.1 兼容性矩阵

#### 无冲突（互补）

| 内置扩展 | 外部插件 | 关系 |
|----------|----------|------|
| p2-context-compact（3级压缩） | pi-caveman（输出压缩） | 不同层面：前者压缩对话历史，后者压缩工具输出 |
| p2-context-compact | pi-rtk-optimizer（bash 改写） | rtk 在前端减少输出量，compact 在后端压缩历史 |
| pi-subagents（single/parallel/chain） | pi-subagents（6种角色） | 同名但内置优先，可共存 |
| pi-tasks（JSONL 状态机） | pi-goal（预算制） | 不同机制，互不干扰 |
| pi-context-usage（5类可视化） | - | 内置已覆盖，无需外部插件 |

#### 有潜在冲突

**1. 上下文修改竞争**

```
pi-context-prune（删旧消息）
        ↕ 可能互相干扰
p2-context-compact（摘要压缩历史）
```

prune 删消息和 compact 摘要压缩可能同时操作上下文，导致一方的计算基于过时状态。

建议：同层只保留一个。优先用内置 p2-context-compact（有 DP 算法决策），禁用 pi-context-prune。

### 7.2 推荐配置

```
内置（自动加载，无需安装）：
├── pi-caveman              ✓ 输出压缩
├── pi-rtk-optimizer        ✓ bash优化
├── pi-command-history      ✓ 命令历史
├── pi-execution-time       ✓ 执行计时
├── pi-goal-x               ✓ 目标追踪
├── pi-btw                  ✓ 旁问面板
├── p2-context-compact      ✓ 上下文压缩
├── p2-context-handoff      ✓ 上下文交接
├── p2-context-prune        ✓ 上下文裁剪
├── pi-context-usage        ✓ 上下文可视化
├── pi-subagents            ✓ 子代理
├── pi-tasks                ✓ 任务追踪
├── pi-hermes-memory        ✓ 持久记忆
├── p2-web-search           ✓ 网页搜索
├── pi-fff                  ✓ 模糊文件搜索
├── pi-lens                 ✓ 上下文透镜
├── pi-loop-police          ✓ 循环检测
├── pi-mcp-adapter          ✓ MCP适配器
├── pi-rewind               ✓ 会话回退
├── pi-continue             ✓ 会话继续
└── p2-init                 ✓ 项目初始化

按需安装外部插件：
├── pi-cache-graph          缓存监控
└── pi-mono-multi-edit      多文件批量编辑
```

### 7.3 核心原则

**21 个内置扩展已覆盖主要功能，外部插件仅作补充。**

```
功能层划分（内置已覆盖）：
├── 输出压缩层：pi-caveman + pi-rtk-optimizer（可共存）
├── 上下文管理层：p2-context-compact + p2-context-handoff + pi-context-prune + pi-context-usage
├── 任务与目标层：pi-tasks + pi-goal-x
├── 子代理层：pi-subagents
├── 记忆与搜索层：pi-hermes-memory + p2-web-search
├── 代码分析层：pi-fff + pi-lens
└── 辅助功能层：pi-command-history + pi-execution-time + pi-btw + pi-loop-police + pi-mcp-adapter + pi-rewind + pi-continue + p2-init
```

---

## 8. 相关文档

- [development-status.md](./development-status.md) — 开发状态与代码改动记录
- [small-context-adaptation.md](./small-context-adaptation.md) — 小模型上下文适配
- [auto-compaction-handoff.md](./auto-compaction-handoff.md) — 自动化压缩/交接系统
- [context-breakdown-and-cache.md](./context-breakdown-and-cache.md) — 上下文分项仪表盘与缓存监控
- [local-router.md](./local-router.md) — 本地路由设计
- [safety-guard.md](./safety-guard.md) — 安全防护机制
