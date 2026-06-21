import type { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Resolve the chat model. Two backends, auto-detected:
 *
 *  - Google AI Studio (Gemini) — used when GOOGLE_GENERATIVE_AI_API_KEY is set.
 *    Model id comes from CHAT_MODEL if it looks like a Gemini id, else a sane
 *    Gemini default.
 *  - Vercel AI Gateway — used when AI_GATEWAY_API_KEY is set; CHAT_MODEL is a
 *    "provider/model" string routed through the gateway.
 *
 * Returns null when no generation key is configured (retrieval still works).
 */
export function getChatModel(): LanguageModel | null {
  const configured = process.env.CHAT_MODEL?.trim();

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const model =
      configured && /gemini/i.test(configured) ? configured : "gemini-2.5-flash";
    return google(model);
  }

  if (process.env.AI_GATEWAY_API_KEY) {
    // The AI SDK accepts a bare "provider/model" string routed via the gateway.
    return (configured ?? "anthropic/claude-sonnet-4-6") as unknown as LanguageModel;
  }

  return null;
}

/** True when some generation backend is configured. */
export function hasGenerationKey(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_GATEWAY_API_KEY
  );
}
