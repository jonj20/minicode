# CJK 分词估计 + 精简消息格式

## 提交

`1f62b6a` — feat(agent,coding-agent): CJK token estimation + compact message format

## 概述

改进 PI 的 token 估算算法：从中文字符数/4 的简单估算，升级为 CJK 字符按 2 token/字符、ASCII 按 0.25 token/字符的差异化估算。同时精简 compact 消息格式减少开销。

## 功能一：CJK 分词估计

### 修改文件

`compaction.ts` (coding-agent + agent)

### 旧算法

```typescript
// 所有字符统一按 char/4 估算
return Math.ceil(chars / 4);
```

问题：CJK 字符在大多数模型中实际消耗 ~2 tokens/字符，旧算法严重低估。

### 新算法

```typescript
function estimateStringTokens(text: string): number {
    const cjkChars = (text.match(/[\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/g) || []).length;
    const nonCjkChars = text.length - cjkChars;
    return Math.ceil(cjkChars * 2 + nonCjkChars / 4);
}
```

各消息类型适用范围：

| 类型 | 包含内容 | 旧算法 | 新算法 |
|------|---------|-------|-------|
| user | text + image blocks | char/4 | CJK: char*2 + ASCII/4 |
| assistant | text + thinking + toolCall | char/4 | 同上 |
| toolResult | text content | char/4 | 同上 |
| bashExecution | command + output | char/4 | 同上 |
| branchSummary | summary text | char/4 | C/2 + A/4 |
| compactionSummary | summary text | char/4 | CJK*2 + ASCII/4 |

图片估算也调整：旧 `ESTIMATED_IMAGE_CHARS = 4800` → 4800/4 = 1200 token；新直接 `1200 tokens`。

### 影响

- 中文对话场景 compact 触发更准确（之前中文内容被低估导致 compact 过晚）
- 纯英文场景估算不变（ASCII 保持 0.25 token/字符）
- 混合场景（中文项目上下文 + 英文代码）更合理

## 功能二：精简消息格式

### 修改文件

`messages.ts` (coding-agent + agent)

精简 compact 和 branch summary 的 XML 包装格式：

```
旧: <context_compacted><summary>...</summary></context_compacted>
新: Context compacted:\n\n<summary>\n...\n</summary>
```

减少每次 compact 的固定开销约 40 tokens。

## 修改列表

| 文件 | 修改 |
|------|------|
| `packages/coding-agent/src/core/compaction/compaction.ts` | CJK 分词估算函数，替换旧 char/4 |
| `packages/coding-agent/src/core/messages.ts` | 精简 compact/branch summary 前缀后缀 |
| `packages/agent/src/harness/compaction/compaction.ts` | 同步 CJK 估算算法 |
| `packages/agent/src/harness/messages.ts` | 同步精简格式 |
| `packages/ai/src/providers/faux.ts` | 适配新消息结构 |
| `examples/extensions/small-context-optimizer.ts` | 使用新估算函数 |
