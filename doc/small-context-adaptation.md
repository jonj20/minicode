# 小模型上下文适配 (8K-16K)

## 提交历史

- `4f762c8` — feat(agent,coding-agent): 适配小模型(8K-16K)上下文改造（初始）
- `d2242dc` — fix(agent,coding-agent): 修正小模型适配默认值和压缩比例
- `8952843` — feat(agent,coding-agent): auto-compaction/handoff system + footer truncation fix

## 概述

使 minicode 能够适配 8K-16K 上下文窗口的小模型（如 Qwen3.5-9B、Gemma-4-12B 等）。核心思路：精简系统提示词、压缩工具输出、3 级自适应压缩策略、统一 compact/handoff 决策、compact 后自动继续。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    小模型适配层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 精简提示词    │  │ 工具输出截断  │  │ 3级压缩策略  │  │
│  │ compactPrompt│  │ truncate     │  │ strategies   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         统一决策矩阵 (compaction-strategy.ts)     │   │
│  │     decideCompactionStrategy()                   │   │
│  └──────────────────────────────────────────────────┘   │
│         │                                               │
│         ▼                                               │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ context-     │  │ context-     │                     │
│  │ compact      │  │ handoff      │                     │
│  │ (auto)       │  │ (auto)       │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

---

## 核心修改

### 1. 精简系统提示词 (`system-prompt.ts:137-164`)

`compactPrompt` 模式，当模型 `contextWindow <= 16384` 时自动启用：

```typescript
compactPrompt: this.model !== undefined && this.model.contextWindow <= 16384,
```

- 去掉详细的 PI 文档说明（README/docs/examples 指引）
- 使用简短开头："You are pi, a coding assistant."
- 仅保留工具列表和基本准则

### 2. 工具输出截断 (`truncate.ts:20-25`)

`computeTruncationLimits(contextWindow)` 动态计算截断阈值：

```typescript
maxLines: Math.min(2000, Math.max(200, Math.floor(contextWindow * 0.06)))
maxBytes: Math.min(50KB, Math.max(4KB, contextWindow * 1.5))
```

| 模型 | contextWindow | 最大行数 | 最大字节 |
|------|-------------|---------|---------|
| 小模型 (8K) | 8192 | 491 | 12KB |
| 小模型 (16K) | 16384 | 983 | 24KB |
| 中模型 (32K) | 32768 | 1966 | 48KB |
| 大模型 (100K+) | 100000+ | 2000 | 50KB |

### 3. 3 级压缩策略 (`context-compact/strategies.ts`)

根据 contextWindow 自动选择压缩级别：

| 级别 | 适用模型 | compact 阈值 | early compact | reserveTokens | tool 输出限制 |
|------|---------|-------------|---------------|--------------|-------------|
| aggressive | ≤ 16K | 60% | 55% | 8192 | 200 行 / 8KB |
| balanced | ≤ 128K | 75% | 70% | 16384 | 1000 行 / 32KB |
| conservative | > 128K | 88% | 85% | 32768 | 2000 行 / 64KB |

```typescript
function detectTier(contextWindow: number): CompressionTier {
  if (contextWindow <= 16384) return "aggressive";
  if (contextWindow <= 128000) return "balanced";
  return "conservative";
}
```

可通过 `--compression-tier` 标志强制指定级别。

### 4. Compact 参数自适应 (`settings-manager.ts:777-796`)

`getCompactionSettings(contextWindow)` 根据模型窗口动态计算：

```typescript
reserveTokens: Math.min(16384, Math.max(1500, Math.floor(contextWindow * 0.15)))
keepRecentTokens: Math.min(20000, Math.max(2000, Math.floor(contextWindow * 0.25)))
```

| 模型 | contextWindow | reserveTokens | keepRecentTokens |
|------|-------------|--------------|-----------------|
| 8K | 8192 | 1500 | 2000 |
| 16K | 16384 | 2457 | 4096 |
| 32K | 32768 | 4915 | 8192 |
| 100K+ | 100000+ | 16384 | 20000 |

---

## 自动化系统 (Phase 1-4)

### Phase 1: Auto-Continue After Compact

**文件**: `agent-session.ts`

compact 后 agent 自动继续，无需手动输入：

```typescript
private _consecutiveCompactionCount = 0;
private static readonly MAX_CONSECUTIVE_COMPACTIONS = 3;

// threshold compact 后自动继续
this._consecutiveCompactionCount++;
if (this._consecutiveCompactionCount >= AgentSession.MAX_CONSECUTIVE_COMPACTIONS) {
    this._consecutiveCompactionCount = 0;
    return false;  // 超过上限，停止
}
return true;  // 继续
```

- 连续 compact 不超过 3 次（安全阀）
- 新 prompt 开始时重置计数器
- 错误恢复时重置计数器

### Phase 2: Pre-Compaction Ledger Flush

**文件**: `context-handoff/handoff/compact.ts`

compact 前自动提取文件操作并保存到 ledger：

```
session_before_compact 触发
  → extractFileOpsFromEntries(entries)
  → saveLedgerEntry("file-ops-<timestamp>", content)
  → 执行 compact
```

保存格式：
```markdown
## File Operations (auto-saved before compaction)

### Modified Files
- /path/to/file1.ts
- /path/to/file2.ts

### Read-Only Files
- /path/to/file3.ts
```

### Phase 3: Proactive Auto-Handoff

**文件**: `context-handoff/handoff/compact.ts`

上下文 >= 70% 时自动触发 handoff（无需用户手动 `/handoff`）：

```
session_before_compact 触发
  → decideCompactionStrategy(percent)
  → strategy === "handoff"
    → buildAutoHandoffBrief(state, percent)
    → state.pendingHandoff = { task: brief, source: "auto" }
    → 执行 handoff compaction
```

自动 handoff brief 包含：
- 当前上下文使用率
- 可用 ledger 条目列表
- 指示 agent 从 ledger 恢复上下文

### Phase 4: 统一决策矩阵 (`compaction-strategy.ts`)

协调 compact 和 handoff 的决策：

| 上下文使用率 | 策略 | 触发位置 | 说明 |
|-------------|------|----------|------|
| < 50% | none | — | 无需操作 |
| 50-70% | compact | context-compact `turn_end` | 简单压缩释放空间 |
| 70-85% | handoff | context-handoff `session_before_compact` | 完整上下文替换 |
| > 85% | compact | agent-session `_checkCompaction` | 紧急压缩防溢出 |

阈值可通过扩展标志配置：
- `compact-threshold` (默认 50)
- `handoff-threshold` (默认 70)
- `forced-compact-threshold` (默认 85)

---

## 小模型处理复杂任务流程

```
1. 8K 模型开始任务
   ↓
2. 上下文 50-70% → 自动 compact (Phase 4)
   ↓ Phase 1: 自动继续
3. Phase 2: 保存文件操作到 ledger
   ↓
4. 上下文 70-85% → 自动 handoff (Phase 3)
   ↓ Phase 2: 已保存的 ledger 作为恢复依据
5. agent 从 handoff brief 恢复上下文
   ↓ Phase 1: 自动继续
6. 继续工作
   ↓
7. 任务完成
```

---

## 修改文件索引

| 文件 | 修改 |
|------|------|
| `system-prompt.ts` | `compactPrompt` 模式，`contextWindow <= 16K` 自动启用 |
| `truncate.ts` | `computeTruncationLimits()` 按 contextWindow 动态截断 |
| `settings-manager.ts` | `getCompactionSettings()` 按 15%/25% 比例计算参数 |
| `agent-session.ts` | compact 后自动继续 + 3 次安全限制 + `_consecutiveCompactionCount` |
| `model-registry.ts` | contextWindow 默认值 128000（原误改为 16384 已修正） |
| `context-compact/strategies.ts` | 3 级压缩策略（aggressive/balanced/conservative） |
| `context-compact/hooks.ts` | 使用统一策略决策 |
| `context-handoff/handoff/compact.ts` | auto-handoff + ledger flush |
| `context-handoff/watchdog.ts` | 简化为只记录 context 使用率 |
| `compaction-strategy.ts` | 统一决策矩阵 |

## 使用

- **自动启用**：模型 `contextWindow <= 16384` 时自动启用精简模式和 aggressive 压缩
- **手动启用**：`--small-context` 或 `--compression-tier aggressive`
- **查看状态**：`/context-compact`、`/context-dashboard`、`/dp-status`
