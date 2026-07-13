/**
 * ExtensionHost provides runtime dependencies that internal-extensions needs
 * from coding-agent. This breaks the circular dependency:
 * coding-agent implements ExtensionHost and passes it to internal-extensions.
 *
 * All types are 'any' here intentionally — the actual types live in coding-agent.
 * internal-extensions uses these at runtime, not compile time.
 */

export interface ExtensionHost {
	createAgentSession(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
	AuthStorage: new (...args: unknown[]) => unknown;
	ModelRegistry: new (...args: unknown[]) => unknown;
	SessionManager: {
		create(cwd: string, sessionDir?: string, options?: Record<string, unknown>): unknown;
		open(path: string, sessionDir?: string, cwdOverride?: string): unknown;
		inMemory(cwd?: string, options?: Record<string, unknown>): unknown;
	};
	DynamicBorder: new (...args: unknown[]) => unknown;
	convertToLlm(messages: unknown[]): unknown[];
	serializeConversation(messages: unknown[]): string;
	estimateTokens(message: unknown): number;
}
