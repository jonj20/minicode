# minicode 工具与命令完整清单

> 向 LLM 注册的工具（Tools）和本地命令（/commands）的完整汇总。
> 基于代码实际注册的工具和命令。

---

## 目录

1. [向 LLM 注册的工具](#1-向-llm-注册的工具)（消耗上下文）
2. [本地命令](#2-本地命令)（不消耗上下文）
3. [键盘快捷键](#3-键盘快捷键)（不消耗上下文）
4. [统计](#4-统计)

---

## 1. 向 LLM 注册的工具（消耗上下文）

**注意：这些工具的定义（名称、描述、参数schema）会被注入到系统提示的 "Available tools" 部分，消耗上下文token。**

### 1.1 核心工具（7个）

定义在 `packages/coding-agent/src/core/tools/`，是 agent 执行代码任务的基础能力。

| 工具名 | 功能 | 文件 |
|--------|------|------|
| `read` | 读取文件（支持 offset/limit） | read.ts |
| `write` | 写入文件（创建/覆盖） | write.ts |
| `edit` | 编辑文件（字符串替换） | edit.ts |
| `bash` | 执行 shell 命令 | bash.ts |
| `grep` | 搜索文件内容（正则表达式） | grep.ts |
| `find` | 查找文件（模式匹配） | find.ts |
| `ls` | 列出目录内容 | ls.ts |

### 1.2 扩展工具（19个）

通过 `packages/internal-extensions/src/` 中的扩展注册。

#### 记忆与搜索（pi-hermes-memory）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `memory` | 持久化记忆管理 | save/update/delete user/memory/project/failure |
| `memory_search` | 搜索记忆 | SQLite FTS5 全文搜索 |
| `session_search` | 搜索历史会话 | 检索过去对话内容 |
| `skill_manage` | 技能管理 | create/view/patch/update/delete 技能 |

#### 网页搜索（p2-web-search）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `web_search` | 网络搜索 | DuckDuckGo 搜索 |
| `web_fetch` | 获取网页内容 | 抓取 URL 并提取文本 |

#### 子代理（p2-subagents）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `Agent` | 生成子 agent | 前台/后台执行 |
| `StopAgent` | 停止子 agent | 按 ID 停止 |
| `AgentStatus` | 查看子 agent 状态 | 列出所有 agent |

#### 上下文管理（p2-handoff）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `handoff` | 上下文交接 | 压缩上下文并继续新任务 |
| `spawn` | 生成独立会话 | 隔离子任务执行 |
| `notebook_topic_set` | 设置 notebook 主题 | topic-aware 决策 |

#### 目标管理（pi-goal）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `create_goal` | 创建目标 | 定义新的目标 |
| `update_goal` | 更新目标 | 标记目标完成 |
| `get_goal` | 获取目标 | 查看当前目标状态 |

#### FFF 增强搜索（pi-fff）

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `ffgrep` / `grep` | 增强版内容搜索 | 模糊匹配、frecency 排序 |
| `fffind` / `find` | 增强版文件查找 | 模糊路径搜索 |
| `fff-multi-grep` / `multi_grep` | 多模式 OR 搜索 | Aho-Corasick 算法 |

#### LSP/AST 工具（pi-lens）

核心工具（始终注册）：

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `ast-grep-search` | AST 搜索 | 模式匹配搜索代码 |
| `lsp-navigation` | LSP 导航 | 跳转定义、引用等 |
| `module-report` | 模块报告 | 模块信息 |
| `read-symbol` | 读取符号 | 读取特定符号 |
| `read-enclosing` | 读取外层 | 读取函数/类 |

扩展工具（需要 `--extended-tools` 启用）：

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `lsp-diagnostics` | LSP 诊断 | 语言服务器诊断 |
| `ast-grep-replace` | AST 替换 | 模式匹配替换 |
| `ast-grep-outline` | AST 大纲 | 文件大纲 |
| `ast-grep-dump` | ast-grep 转储 | 使用 ast-grep |
| `ast-dump` | AST 转储 | 文件的 AST |
| `lens-diagnostics` | Lens 诊断 | 诊断信息 |

---

## 2. 本地命令（不消耗上下文）

**注意：这些命令是用户通过斜杠命令触发的，不会注入到系统提示，不消耗上下文token。**

### 2.1 核心命令（coding-agent）

#### 会话管理

| 命令 | 功能 |
|------|------|
| `/new` | 开始新会话 |
| `/resume` | 恢复其他会话 |
| `/fork` | 从之前的消息创建分支 |
| `/clone` | 复制当前会话 |
| `/tree` | 导航会话树 |
| `/session` | 显示会话信息 |
| `/name` | 设置会话名称 |
| `/export` | 导出会话 |
| `/import` | 导入会话 |

#### 模型与设置

| 命令 | 功能 |
|------|------|
| `/model` | 选择模型 |
| `/scoped-models` | 启用/禁用模型循环 |
| `/settings` | 打开设置 |
| `/trust` | 保存项目信任 |
| `/login` | 配置认证 |
| `/logout` | 移除认证 |

#### 上下文与输出

| 命令 | 功能 |
|------|------|
| `/compact` | 手动压缩上下文 |
| `/copy` | 复制最后消息 |
| `/share` | 分享为 GitHub gist |

#### 工具

| 命令 | 功能 |
|------|------|
| `/reload` | 重新加载配置 |
| `/hotkeys` | 显示快捷键 |
| `/changelog` | 显示更新日志 |
| `/debug` | 调试信息 |
| `/quit` | 退出 |

### 2.2 扩展命令

#### 任务与目标

| 命令 | 功能 | 来源 |
|------|------|------|
| `/goal` | 显示/管理目标 | pi-goal |

#### 子代理（p2-subagents）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/agents` | 代理管理菜单 | p2-subagents |

#### 上下文管理

| 命令 | 功能 | 来源 |
|------|------|------|
| `/context-compact` | 上下文压缩状态 | p2-context-compact |
| `/dp-status` | DP 压缩状态 | p2-context-compact |
| `/dp-eval` | DP 压缩评估 | p2-context-compact |
| `/handoff` | 上下文交接 | p2-handoff |
| `/notebook` | Notebook 管理 | p2-handoff |
| `/context` | 上下文使用摘要 | pi-context-usage |
| `/release` | 发布管理 | pi-context-usage |

#### 旁问（pi-btw）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/btw` | 提问旁问 | pi-btw |
| `/btw:tangent` | 开始切线 | pi-btw |
| `/btw:new` | 新建线程 | pi-btw |
| `/btw:clear` | 清空历史 | pi-btw |
| `/btw:inject` | 注入摘要 | pi-btw |
| `/btw:summarize` | 总结线程 | pi-btw |
| `/btw:model` | 设置模型 | pi-btw |
| `/btw:thinking` | 设置思考级别 | pi-btw |

#### 项目初始化（p2-init）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/init` | 生成 AGENTS.md | p2-init |

#### 网页与 Token 节省

| 命令 | 功能 | 来源 |
|------|------|------|
| `/web-cache` | Web 缓存管理 | p2-web-search |
| `/caveman` | 洞穴人模式 | pi-caveman |
| `/rtk` | RTK 优化器配置 | pi-rtk-optimizer |

#### 文件搜索（pi-fff）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/fff-mode` | FFF 模式切换 | pi-fff |
| `/fff-health` | FFF 健康检查 | pi-fff |
| `/fff-rescan` | FFF 重新扫描 | pi-fff |

#### LSP 与代码分析（pi-lens）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/lens-toggle` | Lens 开关 | pi-lens |
| `/lens-context-toggle` | Lens 上下文开关 | pi-lens |
| `/lens-widget-toggle` | Lens 组件开关 | pi-lens |
| `/lens-tdi` | Lens TDI | pi-lens |
| `/lens-health` | Lens 健康检查 | pi-lens |
| `/lens-tools` | Lens 工具状态 | pi-lens |
| `/lens-allow-edit` | 允许编辑 | pi-lens |

#### 记忆（pi-hermes-memory）

| 命令 | 功能 | 来源 |
|------|------|------|
| `/memory-insights` | 显示记忆 | pi-hermes-memory |
| `/memory-skills` | 列出技能 | pi-hermes-memory |
| `/memory-consolidate` | 记忆整合 | pi-hermes-memory |
| `/memory-interview` | 记忆面试 | pi-hermes-memory |
| `/memory-switch-project` | 切换项目 | pi-hermes-memory |
| `/memory-index-sessions` | 索引会话 | pi-hermes-memory |
| `/memory-sync-markdown` | 同步 Markdown | pi-hermes-memory |
| `/memory-preview-context` | 预览上下文 | pi-hermes-memory |
| `/learn-memory-tool` | 学习记忆工具 | pi-hermes-memory |

#### 工具

| 命令 | 功能 | 来源 |
|------|------|------|
| `/rewind` | 会话回退 | pi-rewind |
| `/loop-police` | 循环检测状态 | pi-loop-police |
| `/plan` | 切换计划模式 | pi-plan-mode |

---

## 3. 键盘快捷键（不消耗上下文）

| 快捷键 | 功能 | 来源 |
|--------|------|------|
| `ctrl+up` | 上一条命令 | pi-command-history |
| `ctrl+down` | 下一条命令 | pi-command-history |
| `ctrl+alt+p` | 切换计划模式 | coding-agent |
| `tab` | 切换计划模式 | coding-agent |
| `escape escape` | 触发回退 | pi-rewind |
| `ctrl+shift+b` | 旁问 | pi-btw |

---

## 4. 统计

| 类别 | 数量 | 消耗上下文 |
|------|------|------------|
| 核心工具 | 7 | 是 |
| 扩展工具 | 19 | 是 |
| 核心命令 | 22 | 否 |
| 扩展命令 | 43 | 否 |
| 键盘快捷键 | 6 | 否 |
| **总计** | **97** | **26个工具消耗** |

---

## 5. 上下文消耗分析

### 5.1 消耗上下文的内容

| 内容 | 消耗方式 | 估算token |
|------|----------|-----------|
| 系统提示 | 每次对话 | ~2000-4000 |
| 工具定义 | 注入到 "Available tools" | ~100-200/工具 |
| 工具promptSnippet | 出现在系统提示 | ~10-20/工具 |
| 工具promptGuidelines | 出现在系统提示 | ~20-50/工具 |

### 5.2 不消耗上下文的内容

- 本地命令（/commands）
- 键盘快捷键
- 工具执行结果（除非被引用）

### 5.3 优化建议

1. **只启用需要的工具**：通过 `--tools` 参数控制
2. **使用 compact prompt**：减少系统提示长度
3. **禁用不常用的扩展**：减少工具定义数量
