#!/usr/bin/env node
import { BUILD_VERSION } from "./build-info.js";
import { main } from "@earendil-works/pi-coding-agent";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
	console.log(BUILD_VERSION);
	process.exit(0);
}
main(process.argv.slice(2));
