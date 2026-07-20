// Cost model for LLM assessments (docs/03 §3). Rates are planning figures and
// must be verified against current Anthropic pricing in docs/COSTS.md.
// claude-sonnet-5 standard pricing: $3 / $15 per million tokens (input / output).
// (An intro rate of $2 / $10 applies through 2026-08-31; we use the higher
//  standard rate so the daily budget guard errs conservative.)
export const MODEL = "claude-sonnet-5";

const INPUT_USD_PER_MTOK = 3.0;
const OUTPUT_USD_PER_MTOK = 15.0;

export function assessmentCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * INPUT_USD_PER_MTOK + (tokensOut / 1_000_000) * OUTPUT_USD_PER_MTOK;
}
