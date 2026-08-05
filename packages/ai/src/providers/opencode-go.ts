import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.ts";
import { openAICompletionsApi } from "../api/openai-completions.lazy.ts";
import { openAIResponsesApi } from "../api/openai-responses.lazy.ts";
import { envApiKeyAuth } from "../auth/helpers.ts";
import { createProvider, type Provider } from "../models.ts";
import type { Api, ProviderStreams } from "../types.ts";
import { OPENCODE_GO_MODELS } from "./opencode-go.models.ts";

// The stream map covers all three APIs even when the committed catalog (or an
// offline regeneration) lists no openai-responses models yet. Widening to the
// full `Api` union keeps the excess-property check from rejecting the entry,
// so this provider type-checks against both stale and freshly generated
// catalogs.
export function opencodeGoProvider(): Provider<"anthropic-messages" | "openai-completions" | "openai-responses"> {
	return createProvider({
		id: "opencode-go",
		name: "OpenCode Zen Go",
		auth: { apiKey: envApiKeyAuth("OpenCode API key", ["OPENCODE_API_KEY"]) },
		models: Object.values(OPENCODE_GO_MODELS),
		api: {
			"anthropic-messages": anthropicMessagesApi(),
			"openai-completions": openAICompletionsApi(),
			"openai-responses": openAIResponsesApi(),
		} as Partial<Record<Api, ProviderStreams>>,
	});
}
