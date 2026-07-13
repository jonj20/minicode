import * as esbuild from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const result = await esbuild.build({
	entryPoints: [resolve(root, "../internal-extensions/src/index.ts")],
	bundle: true,
	format: "esm",
	outfile: resolve(root, "dist/core/extensions/register-builtins.js"),
	platform: "node",
	target: "node22",
	allowOverwrite: true,
	external: [
		"node:*",
		"@earendil-works/*",
		"@ast-grep/*",
		"@yuuang/*",
		"@modelcontextprotocol/*",
		"@ff-labs/*",
		"@hypabolic/*",
		"better-sqlite3",
		"ffi-rs",
		"typebox",
		"cross-spawn",
		"yaml",
		"open",
		"recheck",
		"zod",
		"vscode-jsonrpc",
	],
	logLevel: "info",
});
if (result.errors.length > 0) {
	console.error("Failed to bundle internal extensions:", result.errors);
	process.exit(1);
}
console.log(`Bundled internal extensions -> dist/core/extensions/register-builtins.js`);
console.log(`External: node:*, @earendil-works/*, typebox`);
