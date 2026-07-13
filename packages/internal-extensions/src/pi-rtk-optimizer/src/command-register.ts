import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getRtkArgumentCompletions } from "./command-completions";
import { handleRtkIntegrationCommand } from "./config-modal";
import type { RtkIntegrationConfig, RuntimeStatus } from "./types";

export interface RtkIntegrationController {
	getConfig(): RtkIntegrationConfig;
	setConfig(next: RtkIntegrationConfig, ctx: ExtensionCommandContext): void;
	getConfigPath(): string;
	getRuntimeStatus(): RuntimeStatus;
	refreshRuntimeStatus(): Promise<RuntimeStatus>;
	getMetricsSummary(): string;
	clearMetrics(): void;
}

export function registerRtkIntegrationCommand(pi: ExtensionAPI, controller: RtkIntegrationController): void {
	pi.registerCommand("rtk", {
		description: "Configure RTK rewrite and output compaction integration",
		getArgumentCompletions: getRtkArgumentCompletions,
		handler: async (args, ctx) => {
			await handleRtkIntegrationCommand(args, ctx, controller);
		},
	});
}
