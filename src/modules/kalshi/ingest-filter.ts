import type { NormalizedMarket } from "./types";

export type IngestDecision = "store" | "excluded" | "below_floor";

/**
 * Which open markets ingest persists (docs/02 §5). Pure.
 *
 * Excluded categories are dropped first; everything else must clear the 24h
 * volume floor. Measured 2026-09-22: 113,274 open markets, ~95% with no 24h
 * volume. Those can't be traded at the quoted price, so storing them only
 * costs write time — and ingest runs against a 300s function ceiling.
 * Unknown volume counts as below the floor.
 */
export function classifyForIngest(
  m: Pick<NormalizedMarket, "category" | "volume">,
  opts: { excluded: ReadonlySet<string>; minVolume: number },
): IngestDecision {
  if (m.category && opts.excluded.has(m.category.toLowerCase())) return "excluded";
  if (m.volume === null || m.volume < opts.minVolume) return "below_floor";
  return "store";
}
