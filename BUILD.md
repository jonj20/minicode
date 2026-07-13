# Build Guide

## Project Structure

Monorepo with 4 packages built in order:

```
packages/tui            — Terminal UI library
packages/ai             — LLM API layer
packages/agent          — Core agent framework
packages/coding-agent   — CLI + TUI application (final artifact)
```

## Prerequisites

- **Node.js** >= 22.19.0
- **bun** (for compiling single-file executable) — `npm i -g bun`
- **npm** (included with Node.js)

## Build Pipeline

```
npm ci --ignore-scripts             (1) Install dependencies (skip lifecycle scripts for safety)
npx tsx .../generate-embed.ts        (2) Embed themes/templates/extensions into src/embedded.ts
npm run build                        (3) Compile all packages via tsgo (tui → ai → agent → coding-agent)
bun build --compile --target=...     (4) Bundle + compile into single-file executable
```

### Step details

**1. Install deps** — `npm ci --ignore-scripts` ensures a reproducible install from `package-lock.json`.

**2. Generate embedded assets** — `packages/coding-agent/scripts/generate-embed.ts` reads themes (`src/modes/interactive/theme/*.json`), export-html templates, assets (PNGs), docs, examples, and internal-extensions, then writes them all into `packages/coding-agent/src/embedded.ts` as TypeScript constants. This file is checked in so builds work without the raw source files at runtime.

**3. Build packages** — Each package uses `tsgo -p tsconfig.build.json` (from `@typescript/native-preview`, a native TypeScript 7 compiler). The root `npm run build` script compiles in strict order:

```json
"build": "cd packages/tui && npm run build && cd ../ai && npm run build && cd ../agent && npm run build && cd ../coding-agent && npm run build"
```

- `@earendil-works/pi-tui` — `tsgo -p tsconfig.build.json`
- `@earendil-works/pi-ai` — `npm run generate-models && npm run generate-image-models && tsgo -p tsconfig.build.json`
- `@earendil-works/pi-agent-core` — `tsgo -p tsconfig.build.json`
- `@earendil-works/pi-coding-agent` — `tsgo -p tsconfig.build.json && shx chmod +x dist/cli.js && npm run copy-assets`

The `copy-assets` step copies theme JSONs, templates, vendor JS, and internal-extensions into `dist/` so they can be resolved at runtime without the embedding system.

**4. Bundle with bun** — Uses `bun build --compile` to produce a standalone executable:

```
bun build --compile --target=bun-windows-x64 ^
    packages/coding-agent/dist/bun/cli.js ^
    packages/coding-agent/src/utils/image-resize-worker.ts ^
    --outfile pi.exe
```

- **IMPORTANT**: The entry point is `dist/bun/cli.ts` (Bun-specific entry, supports worker threads via `new URL()`), NOT `dist/cli.js` (Node.js entry).
- The `image-resize-worker.ts` is passed as an explicit build entry so bun embeds it in the binary; otherwise `new Worker(new URL(...))` would fail at runtime.

## Build Scripts

### `build-exe.ps1` — Single-file executable (Windows)

```powershell
.\build-exe.ps1                       # Full build
.\build-exe.ps1 -SkipInstall          # Skip npm ci (fast re-build)
.\build-exe.ps1 -SkipBuild            # Skip package compilation (just bundle)
.\build-exe.ps1 -OutFile my-pi.exe    # Custom output name
```

Steps: check prerequisites → `npm ci --ignore-scripts` → `generate-embed.ts` → clean stale dist → `npm run build` → `bun build --compile` → sync to `packages/coding-agent/binaries/windows-x64/pi.exe` → verify with `--help`.

### `build-and-run.ps1` — Build + run in one shot

```powershell
.\build-and-run.ps1 -p "Say hello"    # Build, then run pi with the prompt
.\build-and-run.ps1 --help            # Build, then show help
.\build-and-run.ps1 -SkipInstall      # Fast rebuild + run
```

Any arguments after the named flags are forwarded to the built `pi.exe`.

### `scripts/build-binaries.sh` — Cross-platform binary build (Linux/macOS)

```bash
./scripts/build-binaries.sh                                           # All 6 platforms
./scripts/build-binaries.sh --platform windows-x64                    # Single platform
./scripts/build-binaries.sh --platform windows-x64 --out ./dist       # Custom output dir
```

This script:
1. Installs cross-platform clipboard bindings (`npm install --include=optional ... @mariozechner/clipboard-*`)
2. Builds packages
3. Bundles for each target platform
4. Copies native helpers (win32-console-mode.node, darwin-modifiers.node)
5. Creates release archives (`.zip` for Windows, `.tar.gz` for Unix)

## Known pitfalls

| Issue | Symptom | Fix |
|---|---|---|
| Wrong entry point (`dist/cli.js` vs `dist/bun/cli.js`) | Binary fails to start or worker features broken | Always use `dist/bun/cli.js` for bun-compiled builds |
| Stale dist artifacts | Binary uses old code | Run clean step or `npm run clean --workspaces` before rebuilding |
| Missing cross-platform clipboard deps | `@mariozechner/clipboard` not found on target platform | Run `npm install --include=optional` or use `build-binaries.sh` |
| Piped output swallows exit code | Build continues after npm failure | Use direct command calls (not `2>&1 \| Select-Object`) and check `$LASTEXITCODE` |

## Internal Extensions 加载机制

内置扩展（`internal-extensions/`，包括 `/plan` 等命令）在 bun 编译的 exe 中通过以下方式加载：

1. `scripts/generate-embed.ts` 将 `internal-extensions/` 下所有源文件编码到 `src/embedded.ts` 的 `EMBEDDED_INTERNAL_EXTENSIONS` 常量中
2. 编译时 `config.ts` 静态导入 `embedded.ts`，`core/extensions/loader.ts` 通过 `config.ts` 静态引用数据（而非运行时动态 `import()`）
3. 运行时：
   - **bun 编译的 exe**：检查 `isBunBinary` → 将嵌入的扩展源码解压到临时目录 → 用 jiti 加载注册
   - **tsx 开发模式**：直接从 `dist/internal-extensions/`（或 `internal-extensions/`）通过文件系统加载

### 常见问题

| 问题 | 原因 | 修复 |
|---|---|---|
| 内置扩展命令（`/plan` 等）找不到 | `loader.ts` 使用动态 `import()` 加载嵌入数据，在 bun 编译的二进制中路径解析失败 | 改用静态 import 链（`config.ts` 中转），确保 bun bundler 正确打包 |
| `isBunBinary` 检测失败 | bun 版本差异导致 `import.meta.url` 格式变化 | 增加了 `Bun.isCompiledBinary()` 检测兜底 |
