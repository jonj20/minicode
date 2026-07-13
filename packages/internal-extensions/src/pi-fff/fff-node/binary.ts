/**
 * Binary resolution utilities for fff-node
 *
 * Resolves the native library from:
 * 1. Platform-specific npm package (e.g. @ff-labs/fff-bin-darwin-arm64)
 * 2. Project node_modules
 * 3. ~/.minicode/node_modules (where ensureFffNativeLib installs)
 * 4. Local dev build (target/release or target/debug)
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getLibFilename, getNpmPackageName } from "./platform.js";

/**
 * Get the current file's directory
 */
function getCurrentDir(): string {
	const url = import.meta.url;

	if (url.startsWith("file://")) {
		return dirname(fileURLToPath(url));
	}
	return dirname(url);
}

/**
 * Get the package root directory
 */
function getPackageDir(): string {
	const currentDir = getCurrentDir();
	// In dev: src/ -> package root
	// In dist: dist/src/ -> package root
	// We look for package.json to find the actual root
	let dir = currentDir;
	for (let i = 0; i < 5; i++) {
		if (existsSync(join(dir, "package.json"))) {
			try {
				const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
				if (pkg.name === "@ff-labs/fff-node" || pkg.name === "fff-node") {
					return dir;
				}
			} catch {
				// Not our package.json, keep going up
			}
		}
		dir = dirname(dir);
	}
	// Fallback: assume we're one level deep in src/
	return dirname(currentDir);
}

/**
 * Check if the binary exists in any known location
 */
export function binaryExists(): boolean {
	return findBinary() !== null;
}

/**
 * Try to resolve the binary from the platform-specific npm package.
 *
 * When users install @ff-labs/fff-node, npm automatically installs the matching
 * optionalDependency (e.g. @ff-labs/fff-bin-darwin-arm64). We resolve the binary
 * path by requiring that package's package.json and looking for the binary
 * in the same directory.
 */
function resolveFromNpmPackage(): string | null {
	const packageName = getNpmPackageName();

	try {
		// Use createRequire to resolve the platform package's location
		const require = createRequire(join(getPackageDir(), "package.json"));
		const packageJsonPath = require.resolve(`${packageName}/package.json`);
		const packageDir = dirname(packageJsonPath);
		const binaryPath = join(packageDir, getLibFilename());

		if (existsSync(binaryPath)) {
			return binaryPath;
		}
	} catch {
		// Package not installed - this is expected on unsupported platforms
		// or when installed without optional dependencies
	}

	return null;
}

/**
 * Try to resolve the binary from project node_modules
 * (installed via npm install @ff-labs/fff-bin-*)
 */
function resolveFromProjectNodeModules(): string | null {
	const packageName = getNpmPackageName();
	const ourDir = getCurrentDir();
	// Walk up from fff-node/ to find project root node_modules
	let dir = ourDir;
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, "node_modules", packageName, getLibFilename());
		if (existsSync(candidate)) return candidate;
		dir = dirname(dir);
	}
	return null;
}

/**
 * Try to resolve the binary from ~/.minicode/node_modules
 * This is where ensureFffNativeLib installs the native library
 */
function resolveFromMinicodeDir(): string | null {
	const packageName = getNpmPackageName();

	try {
		const minicodeDir = join(homedir(), ".minicode", "node_modules");
		const require = createRequire(join(minicodeDir, "package.json"));
		const packageJsonPath = require.resolve(`${packageName}/package.json`);
		const packageDir = dirname(packageJsonPath);
		const binaryPath = join(packageDir, getLibFilename());

		if (existsSync(binaryPath)) {
			return binaryPath;
		}
	} catch {
		// Package not installed in ~/.minicode/node_modules
	}

	return null;
}

/**
 * Get the development binary path (for local development)
 */
function getDevBinaryPath(): string | null {
	const packageDir = getPackageDir();
	const workspaceRoot = join(packageDir, "..", "..");

	const possiblePaths = [
		join(workspaceRoot, "target", "release", getLibFilename()),
		join(workspaceRoot, "target", "debug", getLibFilename()),
	];

	for (const path of possiblePaths) {
		if (existsSync(path)) {
			return path;
		}
	}

	return null;
}

function isDevWorkspace(): boolean {
	const packageDir = getPackageDir();
	const workspaceRoot = join(packageDir, "..", "..");
	return existsSync(join(workspaceRoot, "Cargo.toml"));
}

/**
 * Find the native library binary.
 *
 * Resolution order:
 * - Dev workspace: local dev build first, then project node_modules, then npm package
 * - Production: project node_modules first, then npm package, then ~/.minicode
 *
 * @returns Absolute path to the library, or null if not found
 */
export function findBinary(): string | null {
	if (isDevWorkspace()) {
		// 1. Local bin/ directory (populated by `make prepare-node`)
		const binPath = join(getPackageDir(), "bin", getLibFilename());
		if (existsSync(binPath)) return binPath;

		// 2. Local dev build (target/release or target/debug)
		const devPath = getDevBinaryPath();
		if (devPath) return devPath;

		// 3. Project node_modules (npm install @ff-labs/fff-bin-*)
		const projectPath = resolveFromProjectNodeModules();
		if (projectPath) return projectPath;

		// 4. Fallback to npm package
		const npmPath = resolveFromNpmPackage();
		if (npmPath) return npmPath;

		// 5. Fallback to ~/.minicode/node_modules
		const minicodePath = resolveFromMinicodeDir();
		if (minicodePath) return minicodePath;

		return null;
	}

	// Production: project node_modules first
	const projectPath = resolveFromProjectNodeModules();
	if (projectPath) return projectPath;

	// Then npm package
	const npmPath = resolveFromNpmPackage();
	if (npmPath) return npmPath;

	// Then try ~/.minicode/node_modules (where ensureFffNativeLib installs)
	const minicodePath = resolveFromMinicodeDir();
	if (minicodePath) return minicodePath;

	// Fallback: local dev build (e.g. user built from source)
	return getDevBinaryPath();
}
