import Anthropic from "@anthropic-ai/sdk";
import { assessmentOutputSchema } from "./schema";
import { assessmentCostUsd, MODEL } from "./cost";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt, type PromptInput } from "./prompts/assessment-v1";
import type { LlmAssessment, LlmClient } from "./types";

/**
 * Anthropic-backed assessment client (docs/02 §1, docs/03 §3). Uses
 * claude-sonnet-5 per the spec's cost/quality choice.
 *
 * NOTE (spec drift, docs/04 §4): the spec calls for "temperature 0–0.3", but
 * current Sonnet rejects any temperature parameter (400). We omit it and
 * disable thinking to keep per-assessment cost aligned with the spec's
 * ~$0.02–0.04 estimate that the daily budget guard depends on.
 *
 * Exercised only when ANTHROPIC_API_KEY is set; fixtures cover dev/CI.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    // Per-call timeout (ms) + a single network retry so one hung request can't
    // stall the enrich time budget or the serverless function (docs/02 §5).
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  }

  async assess(input: PromptInput): Promise<LlmAssessment> {
    const userPrompt = buildUserPrompt(input);

    // One retry on schema failure, then fail (docs/04 §4).
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        thinking: { type: "disabled" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const parsed = tryParse(text);
      if (parsed.success) {
        const tokensIn = res.usage.input_tokens;
        const tokensOut = res.usage.output_tokens;
        return {
          output: parsed.data,
          model: MODEL,
          promptVersion: PROMPT_VERSION,
          tokensIn,
          tokensOut,
          costUsd: assessmentCostUsd(tokensIn, tokensOut),
        };
      }
      lastError = parsed.error;
    }
    throw new Error(`LLM assessment failed schema validation after retry: ${String(lastError)}`);
  }
}

function tryParse(text: string) {
  // Strip code fences / prose the model may wrap around the JSON.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return { success: false as const, error: "no JSON object in response" };
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { success: false as const, error: e };
  }
  return assessmentOutputSchema.safeParse(json);
}
