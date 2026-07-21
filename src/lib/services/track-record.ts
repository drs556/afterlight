import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeCalibrationReport, type CalibrationReport, type ResolvedRow } from "@/modules/calibration";
import { getActiveConfig } from "@/lib/services/config";

/**
 * Assemble resolved rows for calibration and compute the report on demand
 * (docs/04 §9, docs/01 §3.3). Cheap pure computation over already-materialized
 * data, so no separate persisted "calibration run" is needed — the settle job
 * (docs/05 M4) is what keeps `resolutions` current; this just reads it fresh.
 *
 * For markets resolved more than once-scored, uses the SCORE closest to (but
 * not after) resolution, so calibration reflects what we believed before the
 * outcome was known.
 */
export async function getTrackRecordReport(): Promise<CalibrationReport> {
  const { thresholds } = await getActiveConfig();
  const resolutions = await db.query.resolutions.findMany();
  if (resolutions.length === 0) {
    return computeCalibrationReport([], thresholds.bankroll_usd);
  }

  const tickers = resolutions.map((r) => r.ticker);
  const markets = await db.query.markets.findMany({ where: inArray(schema.markets.ticker, tickers) });
  const marketByTicker = new Map(markets.map((m) => [m.ticker, m]));

  const allScores = await db.query.scores.findMany({
    where: inArray(schema.scores.ticker, tickers),
    orderBy: (s, { desc }) => desc(s.createdAt),
  });
  const scoresByTicker = new Map<string, typeof allScores>();
  for (const s of allScores) {
    const list = scoresByTicker.get(s.ticker) ?? [];
    list.push(s);
    scoresByTicker.set(s.ticker, list);
  }

  const rows: ResolvedRow[] = [];
  for (const res of resolutions) {
    if (res.outcome !== "yes" && res.outcome !== "no") continue;
    const scores = scoresByTicker.get(res.ticker);
    if (!scores || scores.length === 0) continue;

    // Prefer the latest score at/before resolution time; fall back to the
    // latest score overall if none predate resolution (e.g. fixture data).
    const resolvedAt = res.resolvedAt ? new Date(res.resolvedAt).getTime() : Infinity;
    const beforeResolution = scores.filter((s) => new Date(s.createdAt).getTime() <= resolvedAt);
    const chosen = beforeResolution[0] ?? scores[0]!;
    if (chosen.pModel === null || chosen.pMarket === null) continue;

    rows.push({
      ticker: res.ticker,
      category: marketByTicker.get(res.ticker)?.category ?? null,
      confidenceTier: chosen.confidenceTier,
      pModel: chosen.pModel,
      pMarket: chosen.pMarket,
      netEdge: chosen.netEdge ?? 0,
      actionable: chosen.actionable,
      direction: chosen.direction as "yes" | "no" | null,
      feeAdjustedCost: chosen.feeAdjustedCost,
      kellyUsed: chosen.kellyUsed,
      outcome: res.outcome === "yes" ? 1 : 0,
    });
  }

  return computeCalibrationReport(rows, thresholds.bankroll_usd);
}

// Re-exported so the page doesn't need to import from both services and modules.
export { RESOLVED_PREDICTIONS_TARGET } from "@/modules/calibration";
export type { CalibrationReport } from "@/modules/calibration";
