import { AnthropicLlmClient } from "./anthropic-client";
import { FixtureLlmClient } from "./fixture-client";
import type { LlmClient } from "./types";

export type { LlmClient, LlmAssessment } from "./types";
export { PROMPT_VERSION } from "./prompts/assessment-v1";

/** Anthropic client when ANTHROPIC_API_KEY is set, else the fixture client. */
export function getLlmClient(): LlmClient {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicLlmClient(key) : new FixtureLlmClient();
}

export function usingLlmFixtures(): boolean {
  return !process.env.ANTHROPIC_API_KEY;
}
