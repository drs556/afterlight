// Versioned assessment prompt (docs/04 §4). Bump PROMPT_VERSION on any change —
// calibration must be comparable within a version (docs/03 §3).
export const PROMPT_VERSION = "assessment-v1";

export interface PromptNewsItem {
  id: number;
  source: string | null;
  headline: string;
  publishedAt: string | null;
  snippet: string | null;
}

export interface PromptInput {
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: string | null;
  marketPriceYes: number | null; // [0,1]
  today: string; // ISO date
  news: PromptNewsItem[];
}

export const SYSTEM_PROMPT = `You are a careful forecaster pricing Kalshi event markets. \
Reason about the resolution criterion literally as written — Kalshi resolves on the rules \
text, not vibes. Distinguish "will happen eventually" from "will happen before the close". \
State base rates when the event type is recurring. Widen [p_low, p_high] when evidence is thin; \
never exceed the interval the evidence supports. Only use news published before today's date \
(no lookahead). Respond with a single JSON object and nothing else.`;

/** Build the user prompt. The current market price is stated so the model must
 *  argue against the market, not in a vacuum (docs/04 §4). */
export function buildUserPrompt(input: PromptInput): string {
  const price =
    input.marketPriceYes !== null ? `${(input.marketPriceYes * 100).toFixed(1)}%` : "unknown";
  const news =
    input.news.length === 0
      ? "(no relevant news retrieved)"
      : input.news
          .map(
            (n) =>
              `[${n.id}] ${n.source ?? "?"} — ${n.headline} (${n.publishedAt ?? "undated"})\n${n.snippet ?? ""}`,
          )
          .join("\n\n");

  return `Today's date: ${input.today}

Market: ${input.title}
Resolution rules: ${input.rulesSummary ?? "(none provided)"}
Resolution source: ${input.resolutionSource ?? "(unspecified)"}
Closes: ${input.closeTime ?? "(unknown)"}
Current market price (YES): ${price}

Relevant news (cite by id):
${news}

Return JSON with exactly these keys:
{
  "p_yes": number in [0,1],
  "p_low": number in [0,1],
  "p_high": number in [0,1],
  "thesis": "one-paragraph position",
  "evidence_for": ["..."],
  "evidence_against": ["..."],
  "change_triggers": ["what news would move this estimate"],
  "citation_ids": [ids of news items you used],
  "self_check": {
    "is_resolution_criterion_clear": boolean,
    "does_estimate_rely_on_info_after_cutoff": boolean,
    "key_uncertainty": "..."
  }
}`;
}
