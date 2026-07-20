import { z } from "zod";

// LLM assessment output contract (docs/04 §4). Zod-validated; on schema failure
// the caller retries once, then marks the assessment failed — never guesses.
export const assessmentOutputSchema = z.object({
  p_yes: z.number().min(0).max(1),
  p_low: z.number().min(0).max(1),
  p_high: z.number().min(0).max(1),
  thesis: z.string(),
  evidence_for: z.array(z.string()),
  evidence_against: z.array(z.string()),
  change_triggers: z.array(z.string()),
  citation_ids: z.array(z.number().int()),
  self_check: z.object({
    is_resolution_criterion_clear: z.boolean(),
    does_estimate_rely_on_info_after_cutoff: z.boolean(),
    key_uncertainty: z.string(),
  }),
});

export type AssessmentOutput = z.infer<typeof assessmentOutputSchema>;
