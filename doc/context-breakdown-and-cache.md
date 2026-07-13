# 上下文分项仪表盘与缓存监控

## 概述

通过可视化工具帮助用户理解上下文 token 的构成和缓存效率，辅助判断是否需要 compact、禁用插件或拆分会话。

提供两个核心命令：
- **`/context-compact`**：统一状态面板（压缩策略、阈值、DP 统计）
- **`/context-dashboard`**：分项仪表盘（System / Tool / Code / History 占比 + 缓存命中率）

---

## 一、分项仪表盘

### ContextBreakdown 接口

```typescript
// packages/coding-agent/src/core/extensions/types.ts
interface ContextBreakdown {
  system: number;      // 系统提示词 token 数
  tool: number;        // toolCall + toolResult token 数
  code: number;        // 含代码块（``` 或内联 `）的用户/助手消息
  history: number;     // 其余用户/助手消息
  total: number;       // system + tool + code + history
  cacheRead: number;   // 累积 cache read
  cacheWrite: number;  // 累积 cache write
  cacheHitRate: number | undefined; // 会话级命中率 (%)
}
```

### 分类规则

| 条件 | 归入类别 | 说明 |
|------|---------|------|
| `role === "system"` | system | 仅系统提示词（单独估算） |
| `role === "toolResult"` | tool | 工具执行结果 |
| `role === "assistant"` 且含 `toolCall` | tool | 工具调用 |
| `role === "assistant"` 且含代码块 | code | 含 ` ``` ` 或 `` ` `` 的消息 |
| `role === "user"` 且含代码块 | code | 同上 |
| 其他 user/assistant | history | 普通对话消息 |

### 代码块检测

```typescript
// packages/coding-agent/src/core/agent-session.ts:259
function hasCodeBlock(message: AgentMessage): boolean {
  const text = message.content
    .filter(c => c.type === "text")
    .map(c => c.text)
    .join("");
  return text.includes("```") || /`[^`]+`/.test(text);
}
```

注意：正则 `/`[^`]+`/` 可能误判含反引号的 shell 命令或 Markdown 引用——这是可视化功能的合理权衡。

### 核心实现

| 文件 | 位置 | 功能 |
|------|------|------|
| `packages/coding-agent/src/core/extensions/types.ts:297-314` | `ContextBreakdown` 接口定义 |
| `packages/coding-agent/src/core/agent-session.ts:3150-3205` | `getContextBreakdown()` 方法实现 |
| `packages/coding-agent/src/core/agent-session.ts:259-266` | `hasCodeBlock()` 辅助函数 |
| `packages/coding-agent/src/core/extensions/runner.ts:705-708` | ExtensionRunner 桥接 |

### 数据流

```
AgentSession.getContextBreakdown()
  → 遍历 this.messages 按角色+内容分类
  → 每消息调用 estimateTokens() 估算
  → 从 AssistantMessage.usage 累积 cacheRead/cacheWrite
  → 返回 ContextBreakdown

ExtensionRunner 桥接 → ExtensionContext.getContextBreakdown()
  → context-compact/commands.ts /context-dashboard handler
  → ctx.ui.notify() 多行输出
```

---

## 二、缓存监控

### 累积方式

遍历会话所有 `AssistantMessage`，累加其 `usage.cacheRead` 和 `usage.cacheWrite`：

```typescript
const assistantMsg = message as AssistantMessage;
totalCacheRead += assistantMsg.usage.cacheRead;
totalCacheWrite += assistantMsg.usage.cacheWrite;
```

### 命中率计算

- 公式：`cacheHitRate = cacheRead / (cacheRead + cacheWrite) × 100`
- 当 `cacheRead + cacheWrite > 0` 时返回百分比，否则 `undefined`
- 这是**会话级**平均命中率，区别于 footer 按单条消息计算的 `CH{rate}`

---

## 三、命令

### /context-compact

统一状态面板，显示压缩策略和 DP 统计：

```
Context Compact Status
Tier: aggressive (8,192 tokens)
Small context: yes
Context: 5,000/8,192 (61.0%)
Compact threshold: 60%
Early compact at: 55%
Auto-compactions: 2
DP cancelled: 0
Reserve: 8,192 tokens
Tool output: 200 lines / 8KB
Turns: 15, Agent requests: 8
Avg input tokens: 3,200
```

### /context-dashboard

可视化 token 分项仪表盘：

```
Context Dashboard
  ██████████████████████████████████████████████████████████░░░░░░░░░░░░░░░░  61%  Total     5,000/8,192
  ████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 10%  System      500
  ██████████████████████████████████████████████████████████████████████████ 40%  Tool      2,000
  ██████████████████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░ 24%  Code      1,200
  ██████████████████████████████████████████████████████████░░░░░░░░░░░░░░░░ 25%  History   1,300
Cache: R2,000  W500  Hit:80.0%
```

### /dp-status

DP 压缩状态和参数：

```
DP Compaction Status
Context: 5000 / 8192 tokens
Usage: 61.0%
Turns: 15, Agent requests: 8
Avg input tokens: 3200
Compactions: 2, Cancelled: 0
Params: P_INPUT=1000 P_CACHE=100 R=10 BETA=0.1
```

### /dp-eval

实时评估 DP 压缩决策：

```
DP Evaluation
Net benefit: 0.023456
Force: false
Keep: 3000 tokens, History: 2000 tokens
Decision: COMPACT
```

---

## 四、设计决策

### Token 估算

使用 `estimateTokens()`（角色感知的 CJK×2 + ASCII÷4 公式），非真实 tokenization。对于可视化功能，这是合理的精度-性能权衡。

### Extension 上下文桥接

`ExtensionContext` 只暴露方法（`getContextBreakdown()`），不暴露原始消息，遵循扩展 API 的"最小暴露"原则。数据流：AgentSession → ExtensionRunner → Extension → UI。

### 缓存命中率 vs Footer CH

- `/context-dashboard` 显示**会话级**缓存命中率（所有消息累积）
- Footer 显示**最新一条**消息的缓存命中率
- 两者用途不同：前者评估整体效率，后者观察单次请求
