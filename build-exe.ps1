param(
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$SkipEmbed,
    [string]$OutFile = "minicode.exe"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Err($msg)  { Write-Host "    ERROR: $msg" -ForegroundColor Red }

# 1. Check prerequisites
Write-Step "Checking prerequisites"

$bunPath = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunPath) { Write-Err "bun not found. Install: npm i -g bun"; exit 1 }
Write-Ok "bun $(& $bunPath.Path --version)"

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) { Write-Err "node not found"; exit 1 }
Write-Ok "node $(& $nodePath.Path --version)"

# 2. Install dependencies
if (-not $SkipInstall) {
    Write-Step "Installing dependencies"
    npm install --ignore-scripts
    if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed"; exit 1 }
} else {
    Write-Step "Skipping npm install (--skip-install)"
}

# 3. Generate build info (git-based version)
Write-Step "Generating build info"
npx tsx scripts/generate-build-info.ts
if ($LASTEXITCODE -ne 0) { Write-Err "generate-build-info.ts failed"; exit 1 }
Write-Ok "build-info generated"

# 4. Regenerate embedded assets (themes, templates, internal extensions)
if (-not $SkipEmbed) {
    Write-Step "Regenerating embedded assets"
    npx tsx packages/coding-agent/scripts/generate-embed.ts
    if ($LASTEXITCODE -ne 0) { Write-Err "generate-embed.ts failed"; exit 1 }
    Write-Ok "embedded.ts regenerated"
} else {
    Write-Step "Skipping generate-embed (--skip-embed)"
}

# 5. Clean stale dist
Write-Step "Cleaning stale dist"
Get-ChildItem packages\*\dist -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -Recurse -Force $_.FullName
    Write-Ok "Cleaned: $($_.FullName)"
}

# 6. Build all packages (tui -> ai -> agent -> coding-agent)
if (-not $SkipBuild) {
    Write-Step "Building all packages"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Err "npm run build failed"; exit 1 }
} else {
    Write-Step "Skipping package build (--skip-build)"
}

# 7. Bundle with bun
Write-Step "Bundling with bun (entry: dist/bun/cli.js)"

$entryCli    = "packages/coding-agent/dist/bun/cli.js"
$entryWorker = "packages/coding-agent/src/utils/image-resize-worker.ts"

if (-not (Test-Path $entryCli)) {
    Write-Err "Entry point not found: $entryCli"
    Write-Err "Run 'npm run build' first or remove -SkipBuild flag."
    exit 1
}

$target = "bun-windows-x64"
Write-Ok "Target: $target"
Write-Ok "Entry:  $entryCli"

bun build --compile --target=$target `
    $entryCli `
    $entryWorker `
    --minify `
    --outfile $OutFile

if ($LASTEXITCODE -ne 0) { Write-Err "bun build --compile failed"; exit 1 }

# 8. Sync to binaries directory
$binDir = "packages/coding-agent/binaries/windows-x64"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
Copy-Item $OutFile -Destination "$binDir\minicode.exe" -Force

# 9. Verify: run --help
Write-Step "Verifying executable"
$helpOut = & ".\$OutFile" --help 2>&1 | Out-String
if ($LASTEXITCODE -eq 0 -and $helpOut.Length -gt 10) {
    Write-Ok "minicode.exe --help: OK"
} else {
    Write-Err "minicode.exe --help returned exit code $LASTEXITCODE or empty output"
    Write-Err "Output: $helpOut"
    exit 1
}

# 9. Report result
$fileInfo = Get-Item $OutFile -ErrorAction SilentlyContinue
if ($fileInfo) {
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 1)
    Write-Step "Build complete"
    Write-Ok "Output:  $($fileInfo.FullName)"
    Write-Ok "Synced:  $binDir\minicode.exe"
    Write-Ok "Size:    $sizeMB MB"
} else {
    Write-Err "Output file not found: $OutFile"
    exit 1
}
