import { PROMPT_VERSION, type PromptInput } from "./prompts/assessment-v1";
import { assessmentCostUsd } from "./cost";
import type { AssessmentOutput } from "./schema";
import type { LlmAssessment, LlmClient } from "./types";

/**
 * Deterministic fixture LLM — zero external calls, zero cost (docs/03 §6.5).
 * Produces a plausible assessment anchored near the market price with a wide
 * band, so the enrichment path can be exercised without an API key.
 */
export class FixtureLlmClient implements LlmClient {
  readonly name = "fixture";

  async assess(input: PromptInput): Promise<LlmAssessment> {
    const anchor = input.marketPriceYes ?? 0.5;
    // Nudge slightly toward the news-implied direction, bounded.
    const nudge = input.news.length > 0 ? 0.03 : 0;
    const pYes = clamp(anchor + nudge);
    const band = input.news.length >= 3 ? 0.06 : 0.12;

    const output: AssessmentOutput = {
      p_yes: pYes,
      p_low: clamp(pYes - band),
      p_high: clamp(pYes + band),
      thesis: `Fixture estimate anchored near the market price (${(anchor * 100).toFixed(0)}%) for "${input.title}".`,
      evidence_for: input.news.slice(0, 2).map((n) => n.headline),
      evidence_against: [],
      change_triggers: ["material news on the resolution criterion before close"],
      citation_ids: input.news.map((n) => n.id),
      self_check: {
        is_resolution_criterion_clear: input.rulesSummary !== null,
        does_estimate_rely_on_info_after_cutoff: false,
        key_uncertainty: "fixture data — not a real forecast",
      },
    };

    // Nominal token counts so cost/budget plumbing is exercised (but ~$0).
    const tokensIn = 500;
    const tokensOut = 200;
    return {
      output,
      model: "fixture",
      promptVersion: PROMPT_VERSION,
      tokensIn,
      tokensOut,
      costUsd: assessmentCostUsd(tokensIn, tokensOut),
    };
  }
}

function clamp(p: number): number {
  return Math.min(0.99, Math.max(0.01, p));
}
