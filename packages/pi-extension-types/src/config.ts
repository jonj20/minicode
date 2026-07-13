import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR_NAME: string = ".minicode";

export const ENV_AGENT_DIR = "MINICODE_CODING_AGENT_DIR";

export function expandTildePath(path: string): string {
	return path;
}

export function getAgentDir(): string {
	const envDir = process.env[ENV_AGENT_DIR];
	if (envDir) {
		return expandTildePath(envDir);
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}
