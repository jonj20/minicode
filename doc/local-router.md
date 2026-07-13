# Local Router — 本地指令路由模块

## 概述

Local Router 是 PI coding agent 的一个轻量级前置路由模块，在消息发送到 LLM 之前拦截匹配的简单请求，直接本地执行返回结果，减少不必要的 LLM 调用、降低延迟和 token 消耗。

## 架构

```
用户输入 → match() 匹配模式
  ├─ noop → 直接返回预设回复（无需执行）
  ├─ local → 本地 shell 执行命令 → 返回输出
  ├─ pass_through → 放行给 LLM（不拦截）
  └─ 无匹配 → 正常走 LLM 调用
```

## 核心文件

| 文件 | 功能 |
|------|------|
| `src/core/local-router/patterns.ts` | 模式定义与匹配逻辑 |
| `src/core/local-router/router.ts` | 路由编排：匹配 → 执行 → 返回结果 |
| `src/core/local-router/local-exec.ts` | 本地 shell 命令执行 |
| `src/core/agent-session.ts:1071-1084` | 集成点：LLM 调用前的拦截钩子 |

## 匹配规则 (`patterns.ts`)

### noop — 无需执行，直接回复

| 模式 | 匹配内容 | 回复 |
|------|---------|------|
| ok | `ok`, `好`, `是`, `嗯`, `y(es)?`, `got it`, `明白`, `好的?` | `Done.` |
| thanks | `thanks?`, `thank you`, `谢谢` | `You're welcome.` |

### local — 本地 shell 执行

| 模式 | 匹配内容 | 执行命令 |
|------|---------|---------|
| pwd | `pwd` | `pwd` |
| whoami | `whoami` | `whoami` |
| date | `date` | `date` |
| uptime | `uptime` | `uptime` |
| ls | `ls [-flags] [path]` | `ls` (硬编码，忽略参数) |
| which | `which <name>` | 原文命令 |
| git status | `git status` | `git status --short` |
| git branch | `git branch [flags]` | `git branch` |
| git diff | `git diff [--stat] [args]` | **pass_through** (放行给 LLM) |
| git log | `git log [args]` | `git log --oneline -10` |
| npm ls | `npm ls [--depth=N] [args]` | 原文命令 |
| echo | `echo <text>` | 原文命令 |
| dirname | `dirname <path>` | 原文命令 |
| basename | `basename <path>` | 原文命令 |
| type | `type <name>` | 原文命令 |

### pass_through — 放行 LLM

`git diff` 模式使用 `pass_through` 动作，表示该命令不适合本地执行（输出可能很大或需要 LLM 分析），直接放行给 LLM 处理。

## 路由逻辑 (`router.ts`)

`route(text, cwd)` 返回 `{ result, messages }`：

- `result.action === "local"`: 已处理，包含 `response` 字符串
- `result.action === "llm"`: 没有匹配（或 pass_through），需要 LLM 处理
- `messages`: 已存入的消息数组（local 路由时包含 user+assistant 两条消息）

处理流程：
1. 调用 `match(text)` 匹配规则
2. 无匹配 → 返回 `{ action: "llm" }`，LLM 处理
3. 匹配 noop → 返回预设回复
4. 匹配 pass_through → 返回 `{ action: "llm" }`，LLM 处理
5. 匹配 local → 调用 `execSimple()` 执行命令
6. 执行失败或出错 → 返回错误信息
7. 执行成功 → 返回命令输出（最多保留最后 2000 行）

## 本地执行 (`local-exec.ts`)

`execSimple(command, cwd, timeoutMs=30000)`：

- 使用 `getShellConfig()` 获取 shell 路径和参数
- Node.js `spawn` 执行，`windowsHide: true`
- 30 秒超时（`timeout` 参数）
- stdout/stderr 各保留最后 2000 行（`DEFAULT_MAX_LINES`）
- 环境变量注入 `SHELLOPTS=errexit:pipefail`（Git Bash 适用）

## 集成点 (`agent-session.ts:1071-1084`)

- 条件：`_localRoutingEnabled === true`（默认启用）且无图片
- 在 LLM 调用之前执行 `localRoute(expandedText, cwd)`
- 如果 action 为 `local`，将 user + assistant 消息推入消息历史并 emit 事件
- 此时 `preflightResult(true)` 表示 preflight 已完成，不再走 LLM

## 测试

`test/suite/local-router.test.ts` — 11 个测试用例：

- noop 匹配：ok / 好的 / thanks / 谢谢
- local 执行：pwd（含 messages 验证）、whoami、date
- LLM 放行：中文文本、代码请求
- messages 数组：llm 路由为空，local 路由含 user+assistant

## 已知问题

1. `ls` 模式硬编码 `command: "ls"`，忽略用户传入的 flags/paths
2. `SHELLOPTS=errexit:pipefail` 为 bash 特有，非 bash shell（cmd/pwsh）无效果
3. `y(es)?` 模式会匹配单字母 "y"
4. git diff 模式已修复为 pass_through，放行 LLM
