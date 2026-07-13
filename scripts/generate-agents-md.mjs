#!/usr/bin/env node
/**
 * Generate AGENTS.md for the current project.
 * Usage: node scripts/generate-agents-md.mjs [--force]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const cwd = process.cwd();
const agentsPath = join(cwd, "AGENTS.md");
const force = process.argv.includes("--force");

if (existsSync(agentsPath) && !force) {
  console.log("AGENTS.md already exists. Use --force to overwrite.");
  process.exit(0);
}

function detectPlatform() {
  const p = process.platform;
  if (p === "win32") return { platform: "Windows", shell: "PowerShell" };
  if (p === "darwin") return { platform: "macOS", shell: "bash/zsh" };
  return { platform: "Linux", shell: "bash" };
}

function analyzeProject() {
  const { platform, shell } = detectPlatform();
  const info = {
    name: basename(cwd),
    description: "",
    language: "Unknown",
    buildCommand: "",
    testCommand: "",
    lintCommand: "",
    framework: "",
    isMonorepo: false,
    platform,
    shell,
  };

  // package.json
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      info.name = pkg.name || info.name;
      info.description = pkg.description || "";
      if (pkg.scripts) {
        info.buildCommand = pkg.scripts.build || "";
        info.testCommand = pkg.scripts.test || "";
        info.lintCommand = pkg.scripts.lint || pkg.scripts.check || "";
      }
      if (pkg.workspaces) info.isMonorepo = true;
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps.react) info.framework = "React";
      else if (allDeps.vue) info.framework = "Vue";
      else if (allDeps.svelte) info.framework = "Svelte";
      else if (allDeps.next) info.framework = "Next.js";
      else if (allDeps.express || allDeps.fastify) info.framework = "Node.js Backend";
      info.language = "TypeScript/JavaScript";
    } catch {}
  }

  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
    info.language = "Python";
    info.buildCommand = "python -m build";
    info.testCommand = "pytest";
  }
  if (existsSync(join(cwd, "Cargo.toml"))) {
    info.language = "Rust";
    info.buildCommand = "cargo build";
    info.testCommand = "cargo test";
  }
  if (existsSync(join(cwd, "go.mod"))) {
    info.language = "Go";
    info.buildCommand = "go build";
    info.testCommand = "go test";
  }

  return info;
}

function generate(info) {
  const lines = [];
  lines.push(`# ${info.name}`);
  lines.push("");
  if (info.description) { lines.push(info.description); lines.push(""); }

  lines.push("## Platform");
  lines.push(`- OS: ${info.platform}`);
  lines.push(`- Shell: ${info.shell}`);
  lines.push("");

  if (info.platform === "Windows") {
    lines.push("## Windows Commands");
    lines.push("- Use `Get-ChildItem` instead of `find` or `ls`");
    lines.push("- Use `Select-String` instead of `grep`");
    lines.push("- Use `Copy-Item` instead of `cp`");
    lines.push("- Use `Move-Item` instead of `mv`");
    lines.push("- Use `Remove-Item` instead of `rm`");
    lines.push("");
  }

  lines.push("## Development");
  if (info.language !== "Unknown") lines.push(`- Language: ${info.language}`);
  if (info.framework) lines.push(`- Framework: ${info.framework}`);
  if (info.isMonorepo) lines.push("- Monorepo: Yes");
  lines.push("");

  if (info.buildCommand || info.testCommand || info.lintCommand) {
    lines.push("## Commands");
    if (info.buildCommand) lines.push(`- Build: \`${info.buildCommand}\``);
    if (info.testCommand) lines.push(`- Test: \`${info.testCommand}\``);
    if (info.lintCommand) lines.push(`- Lint: \`${info.lintCommand}\``);
    lines.push("");
  }

  lines.push("## Guidelines");
  lines.push("- Read files before making changes");
  lines.push("- Run tests after modifications");
  lines.push("- Follow existing code style");
  lines.push("- Keep changes minimal and focused");
  lines.push("");

  return lines.join("\n");
}

const info = analyzeProject();
const content = generate(info);
writeFileSync(agentsPath, content, "utf-8");
console.log(`Generated AGENTS.md for ${info.name} (${info.language})`);
