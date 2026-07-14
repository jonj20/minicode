import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getWorkflowConfig } from "../src/config.js";
import { createWorkflowTool } from "../src/index.js";

export default function extension(pi: ExtensionAPI) {
	const config = getWorkflowConfig();
	const workflowTool = createWorkflowTool({
		concurrency: config.concurrency,
	});
	pi.registerTool(workflowTool);

	pi.on("session_start", () => {
		const active = pi.getActiveTools();
		if (!active.includes(workflowTool.name)) {
			pi.setActiveTools([...active, workflowTool.name]);
		}
	});
}
