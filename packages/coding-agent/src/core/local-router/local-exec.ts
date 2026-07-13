import { spawn } from "child_process";
import { getShellConfig } from "../../utils/shell.ts";
import { DEFAULT_MAX_LINES } from "../tools/truncate.ts";

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	truncated: boolean;
}

export async function execSimple(command: string, cwd: string, timeoutMs = 30000): Promise<ExecResult> {
	const shellConfig = getShellConfig();
	const isStdin = shellConfig.commandTransport === "stdin";

	return new Promise((resolve, reject) => {
		const child = spawn(shellConfig.shell, isStdin ? shellConfig.args : [...shellConfig.args, command], {
			cwd,
			windowsHide: true,
			timeout: timeoutMs,
			env: { ...process.env, SHELLOPTS: "errexit:pipefail" },
		});

		const stdoutLines: string[] = [];
		const stderrLines: string[] = [];
		let truncated = false;

		if (isStdin) {
			child.stdin!.write(command);
			child.stdin!.end();
		}

		child.stdout!.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n");
			stdoutLines.push(...lines);
			if (stdoutLines.length > DEFAULT_MAX_LINES) {
				truncated = true;
				stdoutLines.splice(0, stdoutLines.length - DEFAULT_MAX_LINES);
			}
		});

		child.stderr!.on("data", (data: Buffer) => {
			const lines = data.toString().split("\n");
			stderrLines.push(...lines);
			if (stderrLines.length > DEFAULT_MAX_LINES) {
				stderrLines.splice(0, stderrLines.length - DEFAULT_MAX_LINES);
			}
		});

		child.on("error", (err) => reject(err));
		child.on("close", (code) => {
			resolve({
				stdout: stdoutLines.join("\n").trim(),
				stderr: stderrLines.join("\n").trim(),
				exitCode: code ?? -1,
				truncated,
			});
		});
	});
}
