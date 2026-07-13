# 安全防护模块（Safety Guard）

## 概述

两个独立的 Prompt 级安全机制，防止 AI coding agent 在单次 prompt 执行中陷入死循环或无限步数：

- **P3.1 全局最大步数**：单次 prompt 内最大 agent turn 数，超过 50 步自动终止
- **P3.3 死循环检测**：同一文件被 edit/write 超过 5 次，自动终止

两者共享同一套终止流程：设 `_safetyTriggered` 标志 → `afterToolCall` 返回 `{ terminate: true }` → agent loop 标记 `stopReason: "aborted"` → 终止工具调用批次。

## 一、全局最大步数（Max Steps）

### 核心位置

| 位置 | 功能 |
|------|------|
| `agent-session.ts:308` | 字段声明 `_safetyTriggered = false` |
| `agent-session.ts:306` | 字段声明 `_perPromptTurnCount = 0` |
| `agent-session.ts:656-659` | turn_start 时递增并检查阈值 |

### 触发流程

```
prompt() → _emitExtensionEvent({ type: "turn_start" })
  → _perPromptTurnCount++
  → if (_perPromptTurnCount > 50) _safetyTriggered = true
```

每次 `turn_start` 事件发出时计数器 +1。超出 50 步时设标志，下一个 `afterToolCall` 检查到标志后返回 `{ terminate: true }`，agent 停止工具执行并以 `stopReason: "aborted"` 结束当前 assistant 消息。

### 阈值

- Limit: 50 turn_start 事件（约 50 个工具调用 + 响应周期）
- 注意：计数器 > 50 而非 >= 50，因此第 51 个 `turn_start` 触发终止

## 二、死循环检测（Infinite Loop Detection）

### 核心位置

| 位置 | 功能 |
|------|------|
| `agent-session.ts:307` | 字段声明 `_perPromptFileEditCount = new Map<string, number>()` |
| `agent-session.ts:461-471` | afterToolCall 中检查 edit/write 调用 |

### 触发流程

```
afterToolCall({ toolCall, args, ... })
  → if (toolCall.name === "edit" || toolCall.name === "write")
    → const filePath = args.path
    → count = _perPromptFileEditCount.get(filePath) + 1
    → if (count > 5) _safetyTriggered = true
    → return { terminate: true }
```

### 覆盖的工具

| 工具 | 监测字段 |
|------|---------|
| `edit` | `args.path` |
| `write` | `args.path` |

仅匹配工具名称为 `"edit"` 或 `"write"` 的调用。同一 `path` 值（文件路径）累积计数超过 5 次时触发终止。

### 阈值

- Limit: 每文件 5 次 edit/write

### 与其他工具的交互

`edit` 和 `write` 之外的任何工具调用（bash、read、grep、glob 等）**不影响**此计数器。因此 agent 可以在同一文件上做任意多次 read/grep/bash 而不会触发死循环检测。

## 三、安全重置机制

### 核心位置

`agent-session.ts:1203-1205` — 每次 `prompt()` 执行开始前：

```typescript
this._perPromptTurnCount = 0;
this._perPromptFileEditCount.clear();
this._safetyTriggered = false;
```

### 重置时机

| 事件 | 是否重置 |
|------|---------|
| `prompt()` 开始（成功的 preflight 之后） | 是 |
| 两次 prompt 之间 | 隐式（每次 prompt 都重置） |
| prompt 中途 | 否（机制仅在 per-prompt 作用域生效） |

重置确保了两次独立的 prompt 调用不会累积计数。如果一次 prompt 中安全机制被触发，下一条用户消息（新的 prompt）将从零开始。

## 四、终止流程详解

当任一安全机制触发时：

1. `_safetyTriggered` 设为 `true`
2. `afterToolCall` 返回 `{ terminate: true }`
3. Agent loop 收到 terminate 信号后停止当前工具调用批次
4. 当前 assistant 消息的 `stopReason` 被设为 `"aborted"`
5. Agent 交出控制权给 `prompt()` 调用者
6. 下次 `prompt()` 调用时所有计数器和标志位清零

注意：`afterToolCall` 顶部（`agent-session.ts:456-458`）还有一个守卫检查：如果 `_safetyTriggered` 已经为 true（由步数检测设置的），后续工具的 `afterToolCall` 直接返回 `{ terminate: true }` 而不进一步计数，避免重复触发开销。

## 五、测试

### 测试文件

`test/suite/regressions/safety-guard.test.ts`

### 测试用例

| 用例 | 方法 |
|------|------|
| 50 步上限 | 注入 55 个 tool_call 响应，验证 agent 在第 50 步附近终止，最终 stopReason 为 "aborted" |
| 死循环检测 | 注入 7 个编辑同一文件的 edit 调用，验证第 6 次调用触发终止，stopReason 为 "aborted" |

两个测试都使用 `test/suite/harness.ts` + faux provider，不依赖真实 API。

## 已知限制

1. 死循环检测仅覆盖 `edit` 和 `write` 工具。bash/read/grep 等工具的死循环不会被此机制拦截
2. 文件路径匹配基于字符串相等性。不同路径写法（如 `foo/bar.ts` vs `./foo/bar.ts`）会被视为不同文件
3. 全局步数计数基于 `turn_start` 事件，而非实际工具调用数。一个 turn 中可以有多个工具调用，但步数只计 1 次
4. 安全机制不会终止正在执行中的 bash 命令——仅阻止后续工具调用
