import { db } from "@/db";
import { thresholdsSchema, weightsSchema, type Thresholds, type Weights } from "@/lib/config-schema";

export interface ActiveConfig {
  id: number;
  weights: Weights;
  thresholds: Thresholds;
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
