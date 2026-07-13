# Pi Context 优化指南

> 分析日期: 2026-07-10
> 项目状态: 0.0.3-12-202607101547-dirty, 17 个文件未暂存修改

## 背景

Pi 使用长上下文窗口, 但 LLM 性能在上下文增长后可能下降 (primacy 效应).
系统将前 ~30% 定义为 "最佳注意力区", 并在超出时发送 watchdog 提醒.

本指南基于实际会话分析得出优化策略.

---

## Context 构成分析 (47% 消耗断面)

| 来源 | 占比 | 特征 |
| ------ | ------ | ------ |
| **系统 prompt** | ~15% | AGENTS.md + skill 描述 + memory policy + 工具文档 (长文档密集) |
| **构建输出** | ~12% | `npm run build` 全量日志: models 生成统计、tsgo 编译、bundle 内联 |
| **大文件读取** | ~10% | 完整读取 `pi-rtk-optimizer/src/index.ts`、`pi-hermes-memory/src/index.ts`、`loop-police.ts`、`extensions.md`、`packages.md` |
| **git diff 全量** | ~5% | 17 个文件的完整 diff, 大量重复模式 (GPT-5.6 跨 provider 重复添加) |
| **扩展探索** | ~3% | 遍历 20+ 个扩展的 `head -20` 及个别深度读取 |
| **对话轮次** | ~2% | 5 轮用户消息 + 助手回复 |

---

## 发现的问题

### 1. Ledger 未使用

最关键的缺失. 多次有意义的研究结果未保存到 ledger:

- 代码变更全景 (17 个文件的变更分类)
- Internal-extensions 完整目录 (20 个扩展的功能总结)
- 构建过程发现 (bun EPERM 文件锁避坑)
- 模型注册表更新范围

**影响:** 这些信息必须靠原始工具输出重现. handoff 时无法复用.

### 2. 大文件全量读取

`read()` 读了很多不需要全文的文件. 应该用:

- `module_report` — 模块大纲, 含符号列表 + 谁引用
- `read_symbol` — 只读目标符号体
- `read_enclosing` — 从诊断行号读外围符号

### 3. Diff 全量暴露

17 个文件的完整 diff 大量冗余. 特别是跨 provider 的模型添加 (GPT-5.6 变体、grok-4.5 等在不同 provider 中重复出现).

**替代方案:** `git diff --stat` + 仅读取关键文件的 diff.

### 4. 构建输出未压缩

`npm run build` 的输出非常冗长:

```
Model Statistics:
  Total tool-capable models: 1070
  amazon-bedrock: 106 models
  openai: 46 models
  ...
  35 catalogs under src/providers/
```

这些统计信息在构建完成后无后续价值.

### 5. 未及时 handoff

"代码分析 → 扩展探索 → 构建" 跨 3 个不同 job, 但未在边界处 handoff.
导致先前 job 的输出一直滞留在 context 中.

---

## 优化措施

### 1. 维护 Ledger (推荐, 最大收益)

每次有意义的研究/决策后, 立即写入 ledger:

```typescript
// 好例子: 发现关键项目结构后
ledger_add("项目结构-构建流程", "构建用 build-exe.ps1, ...
  bundler: bun build --compile --target=bun-windows-x64
  坑: EPERM 文件锁 -> 用 --outfile /tmp/xxx 绕过")
```

Ledger 条目应该:

- **可复用** — 不是 session 状态, 而是跨 session 的事实
- **紧凑** — 50KB/2000 行上限, 但不是目标
- **精简** — 只记关键信息

### 2. 懒读取 (medium 收益)

优先用 `module_report` 而不是 `read`:

```bash
# 坏: 读整个文件
read packages/large-file.ts

# 好: 先看大纲
module_report packages/large-file.ts

# 好: 只读目标符号
read_symbol packages/large-file.ts "ClassName"
```

### 3. 增量 Diff (low 收益)

```bash
# 坏: 全量 diff 17 个文件
git diff --stat   # 只看统计

# 好: 只看关键变更
git diff packages/ai/src/providers/opencode.models.ts   # 只读关心那部分
```

### 4. 后台构建 (medium 收益)

耗时构建扔到 Agent 或 spawn 后台:

```bash
Agent run_in_background=true → build 输出不挤占主 context
```

### 5. 及时 Handoff (重要)

在 job 边界调用 `handoff()`:

```
job 边界: 研究→规划→执行, 或上下文 > 30% 且当前阶段完成
```

---

## Best Practices

### 阶段管理

```
1. 研究阶段 → handoff → 规划阶段 → handoff → 执行阶段
                                    ↓
                            每个阶段产出写入 ledger
```

### 工具选择矩阵

| 想做什么 | 用这个 | 别用 |
| --------- | -------- | ------ |
| 了解文件结构 | `module_report` | `read` 全文 |
| 查找符号定义 | `lsp_navigation definition` | grep |
| 搜索代码 | `ast_grep_search` / `ffgrep` | 全文读 |
| 获取某符号体 | `read_symbol` | `read` 全文 |
| 检查诊断 | `lsp_diagnostics` / `lens_diagnostics` | 手动排查 |
| 缓存研究结果 | `ledger_add` | 写在对话里 |

### Context 预算 (经验值)

```
系统 prompt:        ~15%  (相对固定)
当前任务工具输出:  ~10-15%
历史工具输出:       ~5%   (旧的/已完成的)
对话轮次:           ~2-3%
────────────────────────
总消耗:             ~32-38%  -> 仍在舒适区
                    >40%     -> 开始注意
                    >50%     -> 建议 handoff
                    >70%     -> 紧急 handoff
```

---

## 本次会话经验教训

1. **Ledger 务必持续维护** — 本次完全未用是最大失误, 大量研究成果不可复用
2. **Job 边界判断** — "/login 分析" → "扩展评估" → "构建" 是 3 个不同 job, 应各 handoff 一次
3. **构建跑后台** — 编译输出的冗长日志无后续价值, 应隔离
4. **大文件分片读** — `read` 超过 100 行的文件前, 先用 `module_report` 判断是否必要

---

*下次会话从重建 ledger 开始: 加载 memory 然后补写本次发现的可复用事实.*

---

## Tool 输出与 Context 的关系

### 核心事实：所有工具输出都进入 LLM 上下文

每次工具调用（read / bash / write / edit / grep / find / ls）的结果都以 `toolResult` 消息推入 agent 的 `currentContext.messages`，下一次 LLM 请求时会全部发送。

**数据流**（`packages/agent/src/agent-loop.ts`）：

```typescript
const toolResults: ToolResultMessage[] = [];
// ... 执行工具 ...
for (const result of toolResults) {
    currentContext.messages.push(result);  // ← 进入上下文
    newMessages.push(result);
}
```

这些 `toolResult` 经 `convertToLlm()`（`packages/coding-agent/src/core/messages.ts:148`）原样透传给 LLM，不做过滤。

### Context 中的消息类型

| 角色 | 来源 | 是否进 LLM 上下文 |
| ------ | ------ | ----------------- |
| `user` | 用户输入 | 是 |
| `assistant` | LLM 回复（含 tool_call） | 是 |
| `toolResult` | 工具执行输出 | 是 |
| `bashExecution` | `!` 命令 / bash 工具 | 是（经 bashExecutionToText 转成 user 消息） |
| `bashExecution` (excludeFromContext) | `!!` 前缀的 bash | **否** |
| `custom` | 扩展注入 | 是（转成 user 消息） |
| `compactionSummary` | 自动压缩 | 是（转成 user 消息） |
| `branchSummary` | 分支恢复 | 是（转成 user 消息） |

### 控制机制（防止上下文爆炸）

| 机制 | 位置 | 效果 |
| ------ | ------ | ------ |
| **工具输出截断** | `tools/truncate.ts` | 默认 `2000行` / `50KB`；超出的截断并提示 `[use offset=N to continue]` |
| **自动压缩（threshold）** | `core/compaction/compaction.ts` | 接近上下文窗口阈值时触发，把早期消息总结为 `compactionSummary` |
| **溢出恢复（overflow）** | `agent-session.ts:1955-1986` | LLM 返回 context overflow 错误时自动压缩并重试 |
| **!! 前缀** | `messages.ts:158` | `!! command` 的 bash 执行设 `excludeFromContext=true`，从 LLM 上下文排除 |
| **压缩切分策略** | `agent/harness/compaction/compaction.ts:findValidCutPoints` | `toolResult` 不是有效切分点，必须依附完整 user/assistant 消息，避免切在半路 |

### `toolResult` 在压缩中的特殊处理

`toolResult` 不是有效的压缩切分点（`findValidCutPoints` 中直接 `break`），因为一条工具结果不依附于其触发的 assistant 消息就没有意义。压缩要么保留完整工具调用轮次，要么整个丢弃。

### 最佳实践

1. **大输出用截断配合** — `read` 用 `offset/limit` 分段读，避免一次加载整个大文件
2. **!! 前缀排除噪音** — 确认目录结构、快速验证等不需要 LLM 知道的 bash 输出，加 `!!` 前缀
3. **监控 toolResult 数量** — 单轮工具调用过多（>5-8 次）时 context 会快速膨胀
4. **关注截断提示** — 看到 `[Truncated: ...]` 或 `[X more lines]` 提示时，确认关键信息没有被截掉
5. **压缩事件提示** — 看到 `compactionSummary` 消息说明上下文已触发自动压缩，考虑 handoff 或缩小工作范围

### 相关代码路径

| 文件 | 作用 |
| ------ | ------ |
| `packages/agent/src/agent-loop.ts` | 工具结果推入上下文 |
| `packages/agent/src/agent.ts` | Agent 核心，默认 `convertToLlm` 过滤规则 |
| `packages/coding-agent/src/core/messages.ts` | `convertToLlm()` 自定义消息→LLM 格式转换 |
| `packages/coding-agent/src/core/agent-session.ts` | 会话管理、溢出恢复、消息持久化 |
| `packages/coding-agent/src/core/tools/truncate.ts` | 工具输出截断逻辑 |
| `packages/agent/src/harness/compaction/compaction.ts` | 压缩算法、切分点选择 |
