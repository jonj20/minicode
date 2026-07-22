export interface EnvFlag {
	name: string;
	legacyName?: string;
}

export const ENV_FLAGS = {
	strict: { name: "CC_SAFETY_NET_STRICT", legacyName: "SAFETY_NET_STRICT" },
	paranoid: { name: "CC_SAFETY_NET_PARANOID", legacyName: "SAFETY_NET_PARANOID" },
	paranoidRm: { name: "CC_SAFETY_NET_PARANOID_RM", legacyName: "SAFETY_NET_PARANOID_RM" },
	paranoidInterpreters: {
		name: "CC_SAFETY_NET_PARANOID_INTERPRETERS",
		legacyName: "SAFETY_NET_PARANOID_INTERPRETERS",
	},
	worktree: { name: "CC_SAFETY_NET_WORKTREE", legacyName: "SAFETY_NET_WORKTREE" },
	debug: { name: "CC_SAFETY_NET_DEBUG" },
} as const satisfies Record<string, EnvFlag>;

export interface SafetyNetModes {
	strict: boolean;
	paranoidAll: boolean;
	paranoidRm: boolean;
	paranoidInterpreters: boolean;
	worktreeMode: boolean;
	debug: boolean;
}

export function getCCSafetyNetEnvModes(config?: Record<string, unknown>): SafetyNetModes {
	// Prefer config.json settings, fall back to environment variables
	const configStrict = config?.strict === true;
	const configParanoid = config?.paranoid === true;
	const configParanoidRm = config?.paranoidRm === true;
	const configParanoidInterpreters = config?.paranoidInterpreters === true;
	const configWorktree = config?.worktreeMode === true;
	const configDebug = config?.debug === true;

	const paranoidAll = configParanoid || envTruthy(ENV_FLAGS.paranoid);
	return {
		strict: configStrict || envTruthy(ENV_FLAGS.strict),
		paranoidAll,
		paranoidRm: paranoidAll || configParanoidRm || envTruthy(ENV_FLAGS.paranoidRm),
		paranoidInterpreters: paranoidAll || configParanoidInterpreters || envTruthy(ENV_FLAGS.paranoidInterpreters),
		worktreeMode: configWorktree || envTruthy(ENV_FLAGS.worktree),
		debug: configDebug || envTruthy(ENV_FLAGS.debug),
	};
}

export function envTruthy(flag: string | EnvFlag): boolean {
	const value = typeof flag === "string" ? process.env[flag] : getEnvFlagValue(flag);
	return value === "1" || value?.toLowerCase() === "true";
}

export function getEnvFlagValue(flag: EnvFlag): string | undefined {
	if (process.env[flag.name] !== undefined) {
		return process.env[flag.name];
	}
	if (flag.legacyName) {
		return process.env[flag.legacyName];
	}
	return undefined;
}

export function envFlagIsSet(flag: EnvFlag): boolean {
	return process.env[flag.name] !== undefined || (!!flag.legacyName && process.env[flag.legacyName] !== undefined);
}
