import chalk from "chalk";
import { type SpawnSyncReturns, spawnSync } from "child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { arch, homedir, platform } from "os";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { APP_NAME, getBinDir } from "../config.ts";

const TOOLS_DIR = getBinDir();
const NETWORK_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

// Mirror sources for GitHub downloads, ordered by priority (npm first)
const GITHUB_MIRRORS = [
	{
		name: "npmmirror",
		url: (original: string) =>
			original.replace("https://github.com", "https://registry.npmmirror.com/-/binary/github.com"),
	},
	{ name: "ghproxy", url: (original: string) => `https://ghproxy.com/${original}` },
	{ name: "gh-proxy", url: (original: string) => `https://gh-proxy.com/${original}` },
	{ name: "github", url: (original: string) => original },
];

function isOfflineModeEnabled(): boolean {
	const value = process.env.PI_OFFLINE;
	if (!value) return false;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

interface ToolConfig {
	name: string;
	repo: string; // GitHub repo (e.g., "sharkdp/fd")
	binaryName: string; // Name of the binary inside the archive
	systemBinaryNames?: string[]; // Alternative system command names to try before downloading
	tagPrefix: string; // Prefix for tags (e.g., "v" for v1.0.0, "" for 1.0.0)
	getAssetName: (version: string, plat: string, architecture: string) => string | null;
	// Fallback version when GitHub API is unreachable (used for backup mirror downloads)
	fallbackVersion?: string;
	// Optional backup mirror for tools that have alternative download sources (e.g., Gitee)
	backupMirror?: {
		name: string;
		// If true, backup URL doesn't need version (e.g., Gitee stores files without version prefix)
		skipVersion?: boolean;
		getUrl: (assetName: string) => string;
	};
}

const TOOLS: Record<string, ToolConfig> = {
	fd: {
		name: "fd",
		repo: "sharkdp/fd",
		binaryName: "fd",
		systemBinaryNames: ["fd", "fdfind"],
		tagPrefix: "v",
		fallbackVersion: "10.2.0",
		getAssetName: (version, plat, architecture) => {
			if (plat === "darwin") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-apple-darwin.tar.gz`;
			} else if (plat === "linux") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-unknown-linux-gnu.tar.gz`;
			} else if (plat === "win32") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `fd-v${version}-${archStr}-pc-windows-msvc.zip`;
			}
			return null;
		},
		backupMirror: {
			name: "gitee",
			skipVersion: true,
			getUrl: (assetName: string) => `https://gitee.com/jon.j/RTK/raw/master/${assetName}`,
		},
	},
	rg: {
		name: "ripgrep",
		repo: "BurntSushi/ripgrep",
		binaryName: "rg",
		tagPrefix: "",
		fallbackVersion: "14.1.1",
		getAssetName: (version, plat, architecture) => {
			if (plat === "darwin") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `ripgrep-${version}-${archStr}-apple-darwin.tar.gz`;
			} else if (plat === "linux") {
				if (architecture === "arm64") {
					return `ripgrep-${version}-aarch64-unknown-linux-gnu.tar.gz`;
				}
				return `ripgrep-${version}-x86_64-unknown-linux-musl.tar.gz`;
			} else if (plat === "win32") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `ripgrep-${version}-${archStr}-pc-windows-msvc.zip`;
			}
			return null;
		},
		backupMirror: {
			name: "gitee",
			skipVersion: true,
			getUrl: (assetName: string) => `https://gitee.com/jon.j/RTK/raw/master/${assetName}`,
		},
	},
	rtk: {
		name: "rtk",
		repo: "rtk-ai/rtk",
		binaryName: "rtk",
		systemBinaryNames: ["rtk"],
		tagPrefix: "v",
		fallbackVersion: "0.43.0",
		getAssetName: (_version, plat, architecture) => {
			if (plat === "darwin") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `rtk-${archStr}-apple-darwin.tar.gz`;
			} else if (plat === "linux") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `rtk-${archStr}-unknown-linux-gnu.tar.gz`;
			} else if (plat === "win32") {
				const archStr = architecture === "arm64" ? "aarch64" : "x86_64";
				return `rtk-${archStr}-pc-windows-msvc.zip`;
			}
			return null;
		},
		backupMirror: {
			name: "gitee",
			skipVersion: true,
			getUrl: (assetName: string) => `https://gitee.com/jon.j/RTK/raw/master/${assetName}`,
		},
	},
};

// Check if a command exists in PATH by trying to run it
function commandExists(cmd: string): boolean {
	try {
		const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
		// Check for ENOENT error (command not found)
		return result.error === undefined || result.error === null;
	} catch {
		return false;
	}
}

// Get the path to a tool (system-wide or in our tools dir)
export function getToolPath(tool: "fd" | "rg" | "rtk"): string | null {
	const config = TOOLS[tool];
	if (!config) return null;

	// Check our tools directory first
	const localPath = join(TOOLS_DIR, config.binaryName + (platform() === "win32" ? ".exe" : ""));
	if (existsSync(localPath)) {
		return localPath;
	}

	// Check system PATH - if found, just return the command name (it's in PATH)
	const systemBinaryNames = config.systemBinaryNames ?? [config.binaryName];
	for (const systemBinaryName of systemBinaryNames) {
		if (commandExists(systemBinaryName)) {
			return systemBinaryName;
		}
	}

	return null;
}

// Fetch latest release version from GitHub
async function getLatestVersion(repo: string): Promise<string> {
	// Try direct GitHub API first
	const directUrl = `https://api.github.com/repos/${repo}/releases/latest`;

	// Try mirrors for API access too
	const apiMirrors = [
		{ name: "npmmirror", url: `https://registry.npmmirror.com/-/binary/github.com/repos/${repo}/releases/latest` },
		{ name: "github", url: directUrl },
	];

	for (const mirror of apiMirrors) {
		try {
			const response = await fetch(mirror.url, {
				headers: { "User-Agent": `${APP_NAME}-coding-agent` },
				signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS * 3), // Use 3x timeout for version check
			});

			if (response.ok) {
				const data = (await response.json()) as { tag_name: string };
				return data.tag_name.replace(/^v/, "");
			}
		} catch {
			// Continue to next mirror
		}
	}

	throw new Error(`Failed to fetch latest version from all sources`);
}

// Download a file from URL
async function downloadFile(url: string, dest: string): Promise<void> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`Failed to download: ${response.status}`);
	}

	if (!response.body) {
		throw new Error("No response body");
	}

	const fileStream = createWriteStream(dest);
	await pipeline(Readable.fromWeb(response.body as any), fileStream);
}

function findBinaryRecursively(rootDir: string, binaryFileName: string): string | null {
	const stack: string[] = [rootDir];

	while (stack.length > 0) {
		const currentDir = stack.pop();
		if (!currentDir) continue;

		const entries = readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);
			if (entry.isFile() && entry.name === binaryFileName) {
				return fullPath;
			}
			if (entry.isDirectory()) {
				stack.push(fullPath);
			}
		}
	}

	return null;
}

function formatSpawnFailure(result: SpawnSyncReturns<Buffer>): string {
	if (result.error?.message) {
		return result.error.message;
	}
	const stderr = result.stderr?.toString().trim();
	if (stderr) {
		return stderr;
	}
	const stdout = result.stdout?.toString().trim();
	if (stdout) {
		return stdout;
	}
	return `exit status ${result.status ?? "unknown"}`;
}

function runExtractionCommand(command: string, args: string[]): string | null {
	const result = spawnSync(command, args, { stdio: "pipe" });
	if (!result.error && result.status === 0) {
		return null;
	}
	return `${command}: ${formatSpawnFailure(result)}`;
}

function extractTarGzArchive(archivePath: string, extractDir: string, assetName: string): void {
	const failure = runExtractionCommand("tar", ["xzf", archivePath, "-C", extractDir]);
	if (failure) {
		throw new Error(`Failed to extract ${assetName}: ${failure}`);
	}
}

function getWindowsTarCommand(): string {
	const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
	if (systemRoot) {
		const systemTar = join(systemRoot, "System32", "tar.exe");
		if (existsSync(systemTar)) {
			return systemTar;
		}
	}
	return "tar.exe";
}

function extractZipArchive(archivePath: string, extractDir: string, assetName: string): void {
	const failures: string[] = [];

	if (platform() === "win32") {
		// Windows ships bsdtar as tar.exe, which supports zip files. Prefer the
		// System32 binary over Git Bash's GNU tar, which does not handle zip archives.
		const tarFailure = runExtractionCommand(getWindowsTarCommand(), ["xf", archivePath, "-C", extractDir]);
		if (!tarFailure) return;
		failures.push(tarFailure);

		const script =
			"& { param($archive, $destination) $ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
		const powershellFailure = runExtractionCommand("powershell.exe", [
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-Command",
			script,
			archivePath,
			extractDir,
		]);
		if (!powershellFailure) return;
		failures.push(powershellFailure);
	} else {
		const unzipFailure = runExtractionCommand("unzip", ["-q", archivePath, "-d", extractDir]);
		if (!unzipFailure) return;
		failures.push(unzipFailure);

		const tarFailure = runExtractionCommand("tar", ["xf", archivePath, "-C", extractDir]);
		if (!tarFailure) return;
		failures.push(tarFailure);
	}

	throw new Error(`Failed to extract ${assetName}: ${failures.join("; ")}`);
}

// Download and install a tool
async function downloadTool(tool: "fd" | "rg" | "rtk"): Promise<string> {
	const config = TOOLS[tool];
	if (!config) throw new Error(`Unknown tool: ${tool}`);

	const plat = platform();
	const architecture = arch();

	// Get latest version, fall back to hardcoded version if API is unreachable
	let version: string;
	try {
		version = await getLatestVersion(config.repo);
	} catch {
		if (config.fallbackVersion) {
			version = config.fallbackVersion;
		} else {
			throw new Error(`Failed to fetch latest version and no fallback available`);
		}
	}

	if (tool === "fd" && plat === "darwin" && architecture === "x64") {
		version = "10.3.0";
	}

	// Get asset name for this platform
	const assetName = config.getAssetName(version, plat, architecture);
	if (!assetName) {
		throw new Error(`Unsupported platform: ${plat}/${architecture}`);
	}

	// Create tools directory
	mkdirSync(TOOLS_DIR, { recursive: true });

	const archivePath = join(TOOLS_DIR, assetName);
	const binaryExt = plat === "win32" ? ".exe" : "";
	const binaryPath = join(TOOLS_DIR, config.binaryName + binaryExt);

	// Try backup mirror first if it doesn't need version (e.g., Gitee)
	if (config.backupMirror?.skipVersion) {
		const backupUrl = config.backupMirror.getUrl(assetName);
		try {
			await downloadFile(backupUrl, archivePath);
			// Skip GitHub mirrors, go directly to extract
			return await extractAndInstall(archivePath, assetName, binaryPath, binaryExt, config, plat);
		} catch {
			// Backup failed, continue to GitHub mirrors
		}
	}

	// Try GitHub mirrors
	const originalUrl = `https://github.com/${config.repo}/releases/download/${config.tagPrefix}${version}/${assetName}`;
	let lastError: Error | null = null;
	for (const mirror of GITHUB_MIRRORS) {
		const url = mirror.url(originalUrl);
		try {
			await downloadFile(url, archivePath);
			lastError = null;
			break;
		} catch (e) {
			lastError = e instanceof Error ? e : new Error(String(e));
		}
	}

	// If all GitHub mirrors failed, try backup mirror (e.g., Gitee)
	if (lastError && config.backupMirror && !config.backupMirror.skipVersion) {
		try {
			const backupUrl = config.backupMirror.getUrl(assetName);
			await downloadFile(backupUrl, archivePath);
			lastError = null;
		} catch (e) {
			lastError = e instanceof Error ? e : new Error(String(e));
		}
	}

	if (lastError) {
		throw new Error(`Failed to download from all sources: ${lastError.message}`);
	}

	return await extractAndInstall(archivePath, assetName, binaryPath, binaryExt, config, plat);
}

// Extract archive and install binary
async function extractAndInstall(
	archivePath: string,
	assetName: string,
	binaryPath: string,
	binaryExt: string,
	config: ToolConfig,
	plat: string,
): Promise<string> {
	// Extract into a unique temp directory. fd and rg downloads can run concurrently
	// during startup, so sharing a fixed directory causes races.
	const extractDir = join(
		TOOLS_DIR,
		`extract_tmp_${config.binaryName}_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
	);
	mkdirSync(extractDir, { recursive: true });

	try {
		if (assetName.endsWith(".tar.gz")) {
			extractTarGzArchive(archivePath, extractDir, assetName);
		} else if (assetName.endsWith(".zip")) {
			extractZipArchive(archivePath, extractDir, assetName);
		} else {
			throw new Error(`Unsupported archive format: ${assetName}`);
		}

		// Find the binary in extracted files. Some archives contain files directly
		// at root, others nest under a versioned subdirectory.
		const binaryFileName = config.binaryName + binaryExt;
		const extractedDir = join(extractDir, assetName.replace(/\.(tar\.gz|zip)$/, ""));
		const extractedBinaryCandidates = [join(extractedDir, binaryFileName), join(extractDir, binaryFileName)];
		let extractedBinary = extractedBinaryCandidates.find((candidate) => existsSync(candidate));

		if (!extractedBinary) {
			extractedBinary = findBinaryRecursively(extractDir, binaryFileName) ?? undefined;
		}

		if (extractedBinary) {
			renameSync(extractedBinary, binaryPath);
		} else {
			throw new Error(`Binary not found in archive: expected ${binaryFileName} under ${extractDir}`);
		}

		// Make executable (Unix only)
		if (plat !== "win32") {
			chmodSync(binaryPath, 0o755);
		}
	} finally {
		// Cleanup
		rmSync(archivePath, { force: true });
		rmSync(extractDir, { recursive: true, force: true });
	}

	return binaryPath;
}

// Termux package names for tools
const TERMUX_PACKAGES: Record<string, string> = {
	fd: "fd",
	rg: "ripgrep",
	rtk: "rtk",
};

// Ensure a tool is available, downloading if necessary
// Returns the path to the tool, or null if unavailable
export async function ensureTool(tool: "fd" | "rg" | "rtk", silent: boolean = false): Promise<string | undefined> {
	const existingPath = getToolPath(tool);
	if (existingPath) {
		return existingPath;
	}

	const config = TOOLS[tool];
	if (!config) return undefined;

	if (isOfflineModeEnabled()) {
		if (!silent) {
			console.log(chalk.yellow(`${config.name} not found. Offline mode enabled, skipping download.`));
		}
		return undefined;
	}

	// On Android/Termux, Linux binaries don't work due to Bionic libc incompatibility.
	// Users must install via pkg.
	if (platform() === "android") {
		const pkgName = TERMUX_PACKAGES[tool] ?? tool;
		if (!silent) {
			console.log(chalk.yellow(`${config.name} not found. Install with: pkg install ${pkgName}`));
		}
		return undefined;
	}

	// Tool not found - download it
	if (!silent) {
		console.log(chalk.dim(`${config.name} not found. Downloading...`));
	}

	try {
		const path = await downloadTool(tool);
		if (!silent) {
			console.log(chalk.dim(`${config.name} installed to ${path}`));
		}
		return path;
	} catch (e) {
		if (!silent) {
			console.log(chalk.yellow(`Failed to download ${config.name}: ${e instanceof Error ? e.message : e}`));
		}
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// FFF native library (fff-bin-<platform>)
// ---------------------------------------------------------------------------

function getFffBinPackage(): string | null {
	const plat = platform();
	const archStr = arch();
	if (plat === "win32" && archStr === "x64") return "@ff-labs/fff-bin-win32-x64";
	if (plat === "win32" && archStr === "arm64") return "@ff-labs/fff-bin-win32-arm64";
	if (plat === "darwin" && archStr === "x64") return "@ff-labs/fff-bin-darwin-x64";
	if (plat === "darwin" && archStr === "arm64") return "@ff-labs/fff-bin-darwin-arm64";
	if (plat === "linux" && archStr === "x64") return "@ff-labs/fff-bin-linux-x64-gnu";
	if (plat === "linux" && archStr === "arm64") return "@ff-labs/fff-bin-linux-arm64-gnu";
	return null;
}

function getFffDllPath(): string | null {
	const pkg = getFffBinPackage();
	if (!pkg) return null;
	const home = homedir();
	const libName = platform() === "win32" ? "fff_c.dll" : `libfff_c.${platform() === "darwin" ? "dylib" : "so"}`;
	return join(home, ".minicode", "node_modules", pkg, libName);
}

export async function ensureFffNativeLib(silent: boolean = false): Promise<void> {
	const dll = getFffDllPath();
	if (dll && existsSync(dll)) return;

	if (isOfflineModeEnabled()) {
		if (!silent) console.log(chalk.yellow("[FFF] offline mode, skipping native library download."));
		return;
	}

	const pkg = getFffBinPackage();
	if (!pkg) {
		if (!silent) console.log(chalk.yellow(`[FFF] unsupported platform ${platform()}/${arch()}`));
		return;
	}

	const home = homedir();
	const minicodeDir = join(home, ".minicode");

	if (!silent) console.log(chalk.dim(`[FFF] 正在安装 native library (${pkg})...`));

	spawnSync("npm", ["install", `${pkg}@0.9.6`, "--no-save", "--prefix", minicodeDir], {
		timeout: 120_000,
		stdio: silent ? "pipe" : "inherit",
	});

	const afterDll = getFffDllPath();
	if (afterDll && existsSync(afterDll)) {
		if (!silent) console.log(chalk.dim(`[FFF] native library 安装成功`));
	} else {
		if (!silent) console.log(chalk.yellow(`[FFF] native library 安装失败`));
	}
}
