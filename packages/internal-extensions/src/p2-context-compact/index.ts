import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.ts";
import { registerHooks } from "./hooks.ts";

export default function adaptiveCompact(pi: ExtensionAPI) {
	// Register flags
	pi.registerFlag("compression-tier", {
		description: "Force compression strategy: aggressive, balanced, conservative (auto-detect if omitted)",
		type: "string",
	});

	pi.registerFlag("small-context", {
		description: "Enable small-context optimization mode (8K-16K models)",
		type: "boolean",
		default: false,
	});

	// Register all hooks
	registerHooks(pi);

	// Register all commands
	registerCommands(pi);
}
