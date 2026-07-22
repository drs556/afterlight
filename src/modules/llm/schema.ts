import { z } from "zod";

// LLM assessment output contract (docs/04 §4). Zod-validated; on schema failure
// the caller retries once, then marks the assessment failed — never guesses.
// Numeric fields use z.coerce: the model intermittently quotes numbers (e.g.
// "p_yes": "0.35" or "citation_ids": ["1","2"]), which is a formatting quirk,
// not a forecasting difference — coerce rather than fail on it.
export const assessmentOutputSchema = z.object({
  p_yes: z.coerce.number().min(0).max(1),
  p_low: z.coerce.number().min(0).max(1),
  p_high: z.coerce.number().min(0).max(1),
  thesis: z.string(),
  evidence_for: z.array(z.string()),
  evidence_against: z.array(z.string()),
  change_triggers: z.array(z.string()),
  citation_ids: z.array(z.coerce.number().int()),
  self_check: z.object({
    // NOT coerced: z.coerce.boolean() treats any non-empty string as true, so
    // "false" would become true. The failures were numeric-only.
    is_resolution_criterion_clear: z.boolean(),
    does_estimate_rely_on_info_after_cutoff: z.boolean(),
    key_uncertainty: z.string(),
  }),
});

export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>;
