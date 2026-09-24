import { z } from "zod";

// Config schemas (docs/02 §4). Pure — no DB or env imports — so tests and
// scripts can use them without a database. New fields MUST carry a default so
// older config_versions rows keep parsing (CLAUDE.md "Config").

export const thresholdsSchema = z.object({
  net_edge_min: z.number().default(0.05),
  net_edge_min_longshot: z.number().default(0.08),
  min_volume: z.number().default(500),
  max_spread: z.number().default(0.08),
  exit_friction: z.number().default(0.01),
  excluded_categories: z.array(z.string()).default([]),
  // Enrich-eligibility upper bound on time-to-close (docs/04 §1). Long-dated
  // markets (e.g. elections) may warrant a wider window than short-term ones.
  max_days_to_close: z.number().default(90),
  // Enrichment controls (docs/02 §5, docs/03 §3).
  llm_daily_budget_usd: z.number().default(10),
  enrich_top_k: z.number().default(40),
  // Wall-clock budget per enrich invocation (docs/02 §5 — small batch +
  // reschedule). Enrich stops cleanly before this so it never hits the Vercel
  // function timeout; re-running continues with the still-stale markets.
  // Invariant: this + the 60s per-call LLM timeout must be <= the route's
  // maxDuration (300s in app/api/jobs/enrich/route.ts). Raising it past 240
  // requires raising maxDuration too.
  enrich_max_seconds: z.number().default(240),
  // Bankroll for sizing display only — the app never trades (docs/01 §3.5).
  bankroll_usd: z.number().default(10000),
  // Storage floor for ingest (docs/02 §5): markets whose 24h volume is below
  // this are walked but not stored. ~95% of Kalshi's open universe has none.
  ingest_min_volume: z.number().min(0).default(500),
  // Allowlist of categories eligible for the paid enrich pass (docs/04 §1),
  // case-insensitive; empty = no category filter. Separate from
  // excluded_categories, which scopes what ingest *stores*.
  enrich_categories: z.array(z.string()).default(["Politics", "Economics"]),
  // Markets per Kalshi event per enrich run, so one event's strike ladder
  // cannot consume the run's slots (docs/04 §1).
  enrich_max_per_event: z.number().int().min(1).default(2),
  // Assessments in flight at once (docs/03 §3). Each is ~22s of mostly
  // network wait, so concurrency is near-free throughput.
  enrich_concurrency: z.number().int().min(1).max(8).default(4),
});

export const weightsSchema = z.object({
  w_mkt: z.number(),
  w_llm: z.number(),
  w_base: z.number(),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;
export type Weights = z.infer<typeof weightsSchema>;

/**
 * Next thresholds for a new config row: `current` with `patch` applied.
 * Every field the patch doesn't name is carried forward; arrays are replaced,
 * not merged. Unknown names throw (a typo must not silently no-op), and the
 * result is re-validated.
 */
export function applyThresholdsPatch(
  current: Thresholds,
  patch: Record<string, unknown>,
): Thresholds {
  const known = new Set(Object.keys(thresholdsSchema.shape));
  const unknown = Object.keys(patch).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown threshold field(s): ${unknown.join(", ")}`);
  }
  return thresholdsSchema.parse({ ...current, ...patch });
}
