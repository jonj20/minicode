# 智能输出过滤模块

## 概述

按命令类型设置不同的截断阈值，异常输出时自动高亮错误。减少 bash 输出对上下文的占用。

## 核心文件

| 文件 | 功能 |
|------|------|
| `src/core/tools/output-filter.ts` | 命令分类与阈值配置 |
| `src/core/tools/bash.ts` | Bash tool 集成输出过滤 |

## 命令分类与阈值

`classifyCommand(command)` → 13 个分类：

| 分类 | 匹配前缀 | 最大行数 | 最大字节 |
|------|---------|---------|---------|
| ls | ls, dir, tree, Get-ChildItem | 200 | 10KB |
| git | git | 400 | 25KB |
| npm | npm, pnpm, yarn, bun, npx | 100 | 10KB |
| grep | grep, rg, ag, findstr, Select-String | 500 | 30KB |
| find | find | 500 | 30KB |
| build | npm run build, tsc, webpack, vite build | 200 | 20KB |
| test | npm test, npm run test, vitest, jest | 300 | 30KB |
| docker | docker, podman | 150 | 15KB |
| system | systemctl, service, ps, top, free | 100 | 10KB |
| network | curl, wget, ping, traceroute, netstat | 150 | 15KB |
| archive | tar, zip, unzip, gzip, 7z | 100 | 10KB |
| output | echo, printf, cat, type, pwd, date | 2000 | 50KB |
| general | 其他 | 2000 | 50KB |

注：`output` 和 `general` 使用 `DEFAULT_MAX_LINES`(2000) 和 `DEFAULT_MAX_BYTES`(50KB)。

## 集成到 bash.ts

`bash.ts` 在创建 `OutputAccumulator` 之前调用 `getOutputFilterConfig(command)` 获取配置：

```typescript
const filterConfig = getOutputFilterConfig(command);
const outputAccumulator = new OutputAccumulator(filterConfig);
```

当输出被截断时，检查异常行并添加错误高亮摘要。

## 输出摘要 (`summarizeOutput`)

`summarizeOutput(output, maxLines=10)` 返回：

```typescript
interface OutputSummary {
  totalLines: number;       // 总行数
  totalBytes: number;       // 总字节数
  firstLines: string[];     // 前 N 行
  lastLines: string[];      // 后 N 行
  errorLines: string[];     // 包含 error/fatal/failed/warning 的行
  hasError: boolean;        // 是否有异常
}
```

`formatOutputSummary(summary)` → 格式化摘要文本：

```
[Output: 1500 lines, 45.2KB]
[Errors/Warnings: 3 lines]
Error highlights:
  Error: ENOENT: no such file or directory
  fatal: not a git repository
  warning: slow git operation detected
```

## 测试

无专用单元测试。通过 `test/suite/` 下的 bash tool 测试间接覆盖。

## 已知问题

1. 输出过滤的命令分类依赖前缀正则，`npm run build` 和 `npm run test` 可能被误分类
2. errorLines 检测仅通过关键词（error/fatal/failed/warning），有误报可能
