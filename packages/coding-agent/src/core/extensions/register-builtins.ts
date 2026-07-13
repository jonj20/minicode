import type { ExtensionAPI } from "./types.ts";

// This file is replaced at postbuild time by bundle-internal-extensions.mjs.
// In tsx dev mode (where isBunBinary=false), this is a no-op because
// extensions are loaded from the filesystem path (resource-loader.ts:510).
export default async function registerBuiltins(_pi: ExtensionAPI): Promise<void> {
	// Replaced by bundle
}
