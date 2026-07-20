import { z } from "zod";
import { db } from "@/db";

const thresholdsSchema = z.object({
  net_edge_min: z.number().default(0.05),
  net_edge_min_longshot: z.number().default(0.08),
  min_volume: z.number().default(500),
  max_spread: z.number().default(0.08),
  exit_friction: z.number().default(0.01),
  excluded_categories: z.array(z.string()).default([]),
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
