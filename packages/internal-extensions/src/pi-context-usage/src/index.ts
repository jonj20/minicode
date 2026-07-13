import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerContextCommand } from "./context";
import { registerReleaseCommand } from "./release";

export * from "./context/breakdown";
export * from "./context/grid";
export * from "./context/tokens";

export default function (pi: ExtensionAPI) {
	registerContextCommand(pi);
	registerReleaseCommand(pi);
}
