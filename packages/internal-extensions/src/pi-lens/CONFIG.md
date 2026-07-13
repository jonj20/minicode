# pi-lens 配置手册

## 零、扩展配置

路径：`~/.minicode/extensions.json`

控制哪些工具扩展加载。**默认全部关闭**，只有配置了 `true` 才启动。

```json
{
  "pi-lens": true,
  "p2-task-tracker": true,
  "p2-subagent": true
}
```

### 可配置的扩展（注册工具，消耗上下文）

| 扩展 | 默认 | 工具数 | tokens | 说明 |
|------|------|--------|--------|------|
| `pi-lens` | 关 | 5–11 | ~1,400 | LSP 诊断/导航、ast-grep、模块分析 |
| `pi-goal` | 关 | 3 | ~400 | 目标管理、任务追踪 |
| `p2-task-tracker` | 关 | 7 | ~800 | 任务追踪（create/list/start/done...） |
| `p2-memory` | 关 | 3 | ~400 | 记忆/技能管理 |
| `p2-subagent` | 关 | 1 | ~300 | 子代理调度 |

不配置 = 不加载 = 不消耗 tokens。

### 推荐配置

```json
{
  "pi-lens": true,
  "p2-task-tracker": true,
  "p2-subagent": true
}
```

只启用核心功能（LSP + 任务 + 子代理），省 ~2,200 tokens（相比全开）。

### 不受影响的扩展（始终加载）

caveman, context-compact, context-prune, context-usage, rtk-optimizer, execution-time, command-history, init, btw, rewind, pi-continue, loop-police, web-search, fff, context-handoff — 这些不注册工具，不消耗 system prompt tokens。

---

## 一、全局配置文件

路径：`~/.minicode/.pi-lens/config.json`

```json
{
  "enabled": true,
  "ignore": ["dist/**", "build/**", "*.min.js"],
  "dispatch": {
    "runnerTimeoutFloorMs": 30000
  },
  "widget": {
    "visible": true
  },
  "format": {
    "enabled": true,
    "mode": "deferred"
  },
  "contextInjection": {
    "enabled": true
  },
  "actionableWarnings": {
    "enabled": false,
    "includeLspCodeActions": false,
    "deltaOnly": true,
    "autoFix": {
      "enabled": false
    }
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `false` | pi-lens 总开关 |
| `ignore` | string[] | `[]` | 全局排除的 gitignore 模式 |
| `dispatch.runnerTimeoutFloorMs` | number | `30000` | 诊断运行器最小超时（ms） |
| `widget.visible` | boolean | `true` | TUI 诊断面板是否显示 |
| `format.enabled` | boolean | `true` | 自动格式化 |
| `format.mode` | `"deferred"` \| `"immediate"` | `"deferred"` | 格式化时机 |
| `contextInjection.enabled` | boolean | `true` | 自动注入上下文提示 |
| `actionableWarnings.enabled` | boolean | `false` | 可操作警告报告 |
| `actionableWarnings.includeLspCodeActions` | boolean | `false` | 警告附带 LSP 修复建议 |
| `actionableWarnings.deltaOnly` | boolean | `true` | 仅显示本轮新增警告 |
| `actionableWarnings.autoFix.enabled` | boolean | `false` | agent_end 自动修复警告 |

## 二、项目级配置

路径：项目根目录 `.pi-lens.json`

```json
{
  "ignore": ["generated/**", "test/fixtures/**"]
}
```

仅支持 `ignore` 字段，优先级高于全局配置。

## 三、CLI Flags

| Flag | 说明 |
|------|------|
| `--no-lens` | 单次会话关闭 pi-lens |
| `--no-lsp` | 关闭 LSP 诊断 |
| `--no-autoformat` | 关闭自动格式化 |
| `--immediate-format` | 写入后立即格式化（而非 agent_end） |
| `--no-autofix` | 关闭 lint 自动修复 |
| `--no-tests` | 关闭写入后自动测试 |
| `--no-delta` | 显示全部诊断（而非仅新增） |
| `--lens-guard` | 阻止有未解决错误的 commit/push |
| `--no-opengrep` | 关闭 Opengrep 安全扫描 |
| `--no-read-guard` | 关闭编辑前必须先读取的守卫 |
| `--extended-tools` | 启用扩展工具集（+400 tokens） |
| `--no-lens-context` | 关闭上下文注入（保留工具/LSP） |

## 四、运行时命令

| 命令 | 说明 |
|------|------|
| `/lens-toggle` | 会话内开关 pi-lens |
| `/lens-context-toggle` | 会话内开关上下文注入 |
| `/lens-widget-toggle` | 会话内开关诊断面板 |
| `/lens-tdi` | 查看技术债务指数 |
| `/lens-health` | 查看运行时健康状态 |
| `/lens-tools` | 查看工具安装状态 |
| `/lens-allow-edit <path>` | 豁免一次编辑守卫 |

## 五、环境变量

| 变量 | 说明 |
|------|------|
| `PI_LENS_NO_CONTEXT_INJECTION=1` | 关闭上下文注入 |
| `PI_LENS_NO_LSP=1` | 关闭 LSP |
| `PI_LENS_COLD_START_QUICK=0` | 关闭冷启动快速模式 |
| `PI_LENS_WARMUP_DELAY_MS` | 预热延迟（默认 2000ms） |
| `PI_LENS_TOOLCALL_NAV_TOUCH_MS` | LSP 导航触碰超时（默认 1500ms） |
| `PI_LENS_TOOLCALL_TOUCH_MS` | LSP 普通触碰超时（默认 750ms） |
| `PI_LENS_CONFIG_PATH` | 覆盖全局配置文件路径 |
| `PI_LENS_RUNNER_TIMEOUT_FLOOR_MS` | 覆盖运行器最小超时 |
| `PI_LENS_TEST_MODE=1` | 测试模式（跳过日志） |

## 六、优先级

```
CLI flags > 环境变量 > 全局配置 > 项目配置 > 默认值
```

## 七、工具注册

### 核心工具（始终注册，5 个）

| 工具 | 功能 |
|------|------|
| `lsp_navigation` | 跳转定义、查引用、hover、rename、codeAction 等 17 种操作 |
| `ast_grep_search` | 结构化 AST 搜索 |
| `module_report` | 模块结构概览 |
| `read_symbol` | 精确读取单个函数/类体 |
| `read_enclosing` | 读取当前光标所在的函数/类边界 |

### 扩展工具（需 `--extended-tools` 启用，6 个）

| 工具 | 功能 |
|------|------|
| `lsp_diagnostics` | 主动查文件/目录的类型错误、lint 警告 |
| `lens_diagnostics` | 会话级诊断状态跟踪 |
| `ast_grep_replace` | AST 级精确替换 |
| `ast_grep_outline` | 文件符号树 |
| `ast_grep_dump` | 调试用 AST 结构输出 |
| `ast_dump` | `ast_grep_dump` 兼容别名 |

## 八、上下文消耗

### 固定消耗（每次对话）

| 组件 | tokens |
|------|--------|
| 5 个核心工具定义 | ~820 |
| SESSION_START_GUIDANCE | ~90 |
| CONTEXT_PRIMER | ~380 |
| **核心总计** | **~1,290** |

开启 `--extended-tools` 后额外增加：

| 组件 | tokens |
|------|--------|
| 6 个扩展工具定义 | ~590 |
| SESSION_START_GUIDANCE 追加 | ~60 |
| **扩展额外** | **~650** |
| **全量总计** | **~1,940** |

### 按需消耗（技能加载）

| 技能 | tokens | 触发条件 |
|------|--------|---------|
| `lsp-navigation` | ~450 | 模型主动加载或用户触发 |
| `ast-grep` | ~1,000 | 搜索代码模式时 |
| `write-ast-grep-rule` | ~600 | 编写自定义规则时 |
| `write-tree-sitter-rule` | ~500 | 编写 tree-sitter 规则时 |

### 单次工具调用返回值

| 操作 | 典型 tokens |
|------|------------|
| hover | 50–200 |
| definition/references | 30–800 |
| documentSymbol | 200–1,500 |
| diagnostics（单文件） | 50–500 |
| diagnostics（目录批量） | 200–2,500 |
| codeAction | 100–400 |
| rename | 100–600 |

## 九、最小化配置推荐

### 只要 LSP 诊断和导航（最省 token）

```json
{
  "enabled": true,
  "format": { "enabled": false },
  "contextInjection": { "enabled": false },
  "widget": { "visible": false },
  "actionableWarnings": { "enabled": false }
}
```

### 全功能开启

```json
{
  "enabled": true,
  "extendedTools": { "enabled": true },
  "format": { "enabled": true, "mode": "deferred" },
  "contextInjection": { "enabled": true },
  "widget": { "visible": true },
  "actionableWarnings": { "enabled": true, "deltaOnly": true }
}
```
