# 自动化压缩/交接系统

> 更新时间: 2026-07-06

---

## 1. 概述

本系统实现了上下文管理的全自动化，让小上下文模型（8K-16K）也能完成复杂任务。

**核心能力**：
- compact 后自动继续，无需人工输入
- 自动保存文件操作到 ledger
- 上下文满时自动 handoff
- compact/handoff 统一决策

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Session                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Phase 1      │  │ Phase 2      │  │ Phase 4      │  │
│  │ Auto-Continue│  │ Ledger Flush │  │ Unified      │  │
│  │              │  │              │  │ Strategy     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         ▼                 ▼                 ▼           │
│  ┌──────────────────────────────────────────────────┐   │
│  │           compaction-strategy.ts                 │   │
│  │     decideCompactionStrategy()                   │   │
│  └──────────────────────────────────────────────────┘   │
│         │                 │                 │           │
│         ▼                 ▼                 ▼           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ context-     │  │ context-     │  │ agent-       │  │
│  │ compact      │  │ handoff      │  │ session      │  │
│  │ (hooks.ts)   │  │ (compact.ts) │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 四个阶段

### Phase 1: Auto-Continue After Compact

**文件**: `packages/coding-agent/src/core/agent-session.ts`

**问题**: compact 后 agent 停止，需要手动输入才能继续

**解决方案**: `_runAutoCompaction` 方法始终返回 `true`

**实现**:
```typescript
// 新增属性
private _consecutiveCompactionCount = 0;
private static readonly MAX_CONSECUTIVE_COMPACTIONS = 3;

// 核心改动
if (willRetry) {
    this._consecutiveCompactionCount = 0;
    return true;
}

// threshold compact 后自动继续
this._consecutiveCompactionCount++;
if (this._consecutiveCompactionCount >= AgentSession.MAX_CONSECUTIVE_COMPACTIONS) {
    this._consecutiveCompactionCount = 0;
    return false;
}
return true;
```

**安全措施**:
- 连续 compact 不超过 3 次
- 新 prompt 开始时重置计数器

---

### Phase 2: Pre-Compaction Ledger Flush

**文件**: `packages/internal-extensions/src/context-handoff/handoff/compact.ts`

**问题**: compact 前文件操作可能丢失

**解决方案**: 自动提取文件操作并保存到 ledger

**实现**:
```typescript
// 新增函数
function extractFileOpsFromEntries(entries: SessionEntry[]): {
    read: Set<string>;
    written: Set<string>;
    edited: Set<string>;
}

async function autoSaveFileOpsToLedger(
    pi: ExtensionAPI,
    state: AgenticodingState,
    entries: SessionEntry[],
): Promise<void>

// 在 session_before_compact hook 中调用
pi.on("session_before_compact", async (event, ctx) => {
    await autoSaveFileOpsToLedger(pi, state, event.branchEntries);
    // ... 其他逻辑
});
```

**保存格式**:
```markdown
## File Operations (auto-saved before compaction)

### Modified Files
- /path/to/file1.ts
- /path/to/file2.ts

### Read-Only Files
- /path/to/file3.ts
```

---

### Phase 3: Proactive Auto-Handoff

**文件**: `packages/internal-extensions/src/context-handoff/handoff/compact.ts`

**问题**: 上下文满了只警告不行动

**解决方案**: 在 `session_before_compact` 中检测策略，自动触发 handoff

**实现**:
```typescript
pi.on("session_before_compact", async (event, ctx) => {
    // 检查统一策略
    const usage = ctx.getContextUsage();
    if (usage?.percent !== null && usage?.percent !== undefined) {
        const config = getStrategyConfig(pi);
        const decision = decideCompactionStrategy(usage.percent, config);

        if (decision.strategy === "handoff") {
            const brief = buildAutoHandoffBrief(state, usage.percent);
            state.pendingHandoff = { task: brief, source: "auto" };
        }
    }
    // ... 执行 handoff
});
```

---

### Phase 4: Unified Compaction Strategy

**文件**: `packages/internal-extensions/src/compaction-strategy.ts`

**问题**: compact 和 handoff 独立运行，可能冲突

**解决方案**: 统一决策矩阵

**决策逻辑**:
```typescript
export function decideCompactionStrategy(
    contextPercent: number,
    config: CompactionStrategyConfig = DEFAULT_CONFIG,
): CompactionDecision {
    if (contextPercent >= config.forcedCompactThreshold) {
        return { strategy: "compact", reason: "emergency compact" };
    }
    if (contextPercent >= config.handoffThreshold) {
        return { strategy: "handoff", reason: "handoff recommended" };
    }
    if (contextPercent >= config.compactThreshold) {
        return { strategy: "compact", reason: "simple compact" };
    }
    return { strategy: "none", reason: "no action needed" };
}
```

**决策矩阵**:

| 上下文使用率 | 策略 | 触发位置 |
|-------------|------|----------|
| < 50% | none | — |
| 50-70% | compact | context-compact `turn_end` |
| 70-85% | handoff | context-handoff `session_before_compact` |
| > 85% | compact | agent-session `_checkCompaction` |

**配置**:
```typescript
const DEFAULT_CONFIG = {
    compactThreshold: 50,
    handoffThreshold: 70,
    forcedCompactThreshold: 85,
};
```

---

## 4. 工作流程

### 小模型处理复杂任务

```
1. 8K 模型开始任务
   ↓
2. 上下文 50-70%
   ↓ 自动 compact
3. 继续工作（Phase 1 自动继续）
   ↓
4. 上下文 70-85%
   ↓ 自动 handoff（Phase 3）
5. 从 ledger 恢复状态（Phase 2 已保存）
   ↓
6. 继续工作
   ↓
7. 任务完成
```

### Compact 流程

```
用户输入 → agent 执行 → 上下文增长
    ↓
检测到 context >= 50%
    ↓
session_before_compact hook 触发
    ↓
Phase 2: 保存文件操作到 ledger
    ↓
Phase 4: 检查策略 → compact
    ↓
执行 compact
    ↓
Phase 1: 返回 true → agent 自动继续
```

### Handoff 流程

```
用户输入 → agent 执行 → 上下文增长
    ↓
检测到 context >= 70%
    ↓
session_before_compact hook 触发
    ↓
Phase 2: 保存文件操作到 ledger
    ↓
Phase 4: 检查策略 → handoff
    ↓
生成 handoff brief
    ↓
执行 compact（替换上下文）
    ↓
发送 "Proceed." → agent 自动继续
```

---

## 5. 文件修改索引

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/internal-extensions/src/compaction-strategy.ts` | 统一决策矩阵 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `packages/coding-agent/src/core/agent-session.ts` | compact 后自动继续 + 安全计数器 |
| `packages/internal-extensions/src/context-compact/hooks.ts` | 使用统一策略 |
| `packages/internal-extensions/src/context-handoff/handoff/compact.ts` | 自动保存文件操作 + 自动 handoff |
| `packages/internal-extensions/src/context-handoff/watchdog.ts` | 简化，移除重复逻辑 |

---

## 6. 测试验证

### 验证点

1. **Phase 1**: compact 后是否自动继续
2. **Phase 2**: compact 前是否自动保存文件操作到 ledger
3. **Phase 3**: context >= 70% 时是否自动 handoff
4. **Phase 4**: compact/handoff 是否统一决策

### 测试步骤

1. 使用小模型（8K-16K）执行多步骤任务
2. 观察 context 增长
3. 验证 50-70% 时触发 compact
4. 验证 compact 后自动继续
5. 验证 70-85% 时触发 handoff
6. 用 `/ledger` 查看自动保存的文件操作
7. 验证 handoff 后自动继续

---

## 7. 配置选项

### 扩展标志

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `compact-threshold` | 50 | 触发 compact 的上下文百分比 |
| `handoff-threshold` | 70 | 触发 handoff 的上下文百分比 |
| `forced-compact-threshold` | 85 | 触发紧急 compact 的百分比 |

### 安全参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `MAX_CONSECUTIVE_COMPACTIONS` | 3 | 连续 compact 最大次数 |
| `AUTO_ACTION_COOLDOWN_MS` | 5000 | 自动操作冷却时间（毫秒） |

---

## 8. 限制与注意事项

### 限制

- 每次 compact/handoff 会丢失一些细节
- 复杂任务需要多次 handoff
- 极大项目可能超出能力范围

### 注意事项

- 连续 compact 不超过 3 次，防止无限循环
- 自动操作有 5 秒冷却时间
- handoff 后需要重新读取文件
- ledger 条目有大小限制（50KB / 2000 行）
