const result = await Bun.build({
	entrypoints: ["../internal-extensions/src/index.ts"],
	outdir: "./dist/internal-extensions-bundled",
	target: "bun",
	format: "esm",
});

if (!result.success) {
	console.error("Failed to bundle internal extensions:");
	for (const msg of result.logs) {
		console.error(msg);
	}
	process.exit(1);
}

for (const output of result.outputs) {
	console.log(`Bundled: ${output.path} (${(output.size / 1024).toFixed(1)}KB)`);
}
