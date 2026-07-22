import { z } from "zod";
import { db } from "@/db";

const thresholdsSchema = z.object({
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
  enrich_max_seconds: z.number().default(240),
  // Bankroll for sizing display only — the app never trades (docs/01 §3.5).
  bankroll_usd: z.number().default(10000),
});

const weightsSchema = z.object({
  w_mkt: z.number(),
  w_llm: z.number(),
  w_base: z.number(),
});

export interface ActiveConfig {
  id: number;
  weights: z.infer<typeof weightsSchema>;
  thresholds: z.infer<typeof thresholdsSchema>;
}

/** Latest config_versions row (the active config). Throws if unseeded. */
export async function getActiveConfig(): Promise<ActiveConfig> {
  const row = await db.query.configVersions.findFirst({
    orderBy: (c, { desc }) => desc(c.createdAt),
  });
  if (!row) throw new Error("No config_version found — run the seed script");
  return {
    id: row.id,
    weights: weightsSchema.parse(row.weights),
    thresholds: thresholdsSchema.parse(row.thresholds),
  };
}
