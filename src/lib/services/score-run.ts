import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getActiveConfig } from "@/lib/services/config";
import { scoreMarket, applyClusterCap } from "@/modules/scoring";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Score job (docs/04, docs/05 M3): recompute `scores` for markets that have a
 * fresh snapshot AND a latest assessment. Pure scoring math lives in
 * modules/scoring; this orchestrator does the I/O and applies the 8%
 * event-cluster Kelly cap across markets sharing an event_ticker.
 *
 * Every row is append-only and stamps config_version + assessment + snapshot,
 * so toggling weights in Settings produces new scores without touching old rows.
 */
export async function runScore(): Promise<RunResult> {
  const config = await getActiveConfig();
  const baseRates = await computeSeriesBaseRates();

  const markets = await db.query.markets.findMany({
    where: eq(schema.markets.status, "active"),
  });
  if (markets.length === 0) return { itemsOk: 0, itemsFailed: 0 };

  const tickers = markets.map((m) => m.ticker);

  const snaps = await db.query.marketSnapshots.findMany({
    where: inArray(schema.marketSnapshots.ticker, tickers),
    orderBy: (s, { desc }) => desc(s.capturedAt),
  });
  const latestSnap = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latestSnap.has(s.ticker)) latestSnap.set(s.ticker, s);

  const assessments = await db.query.llmAssessments.findMany({
    where: inArray(schema.llmAssessments.ticker, tickers),
    orderBy: (a, { desc }) => desc(a.createdAt),
  });
  const latestAssessment = new Map<string, (typeof assessments)[number]>();
  for (const a of assessments) if (!latestAssessment.has(a.ticker)) latestAssessment.set(a.ticker, a);

  const newsCounts = await countNewsPerMarket(tickers);

  const now = Date.now();
  let itemsFailed = 0;

  // Compute a score per eligible market, tagging its event cluster.
  const rows: {
    eventTicker: string;
    row: typeof schema.scores.$inferInsert;
  }[] = [];

  for (const m of markets) {
    const snap = latestSnap.get(m.ticker);
    const asmt = latestAssessment.get(m.ticker);
    if (!snap || !asmt || snap.yesBid === null || snap.yesAsk === null) continue;
    if (asmt.pEstimate === null || asmt.pLow === null || asmt.pHigh === null) continue;

    try {
      const s = scoreMarket({
        yesBid: snap.yesBid,
        yesAsk: snap.yesAsk,
        pLlm: asmt.pEstimate,
        pLlmLow: asmt.pLow,
        pLlmHigh: asmt.pHigh,
        pBase: m.seriesTicker ? (baseRates.get(m.seriesTicker) ?? null) : null,
        weights: config.weights,
        thresholds: config.thresholds,
        newsCount: newsCounts.get(m.ticker) ?? 0,
        snapshotAgeHours: (now - new Date(snap.capturedAt).getTime()) / 3_600_000,
      });

      rows.push({
        eventTicker: m.eventTicker ?? m.ticker,
        row: {
          ticker: m.ticker,
          snapshotId: snap.id,
          assessmentId: asmt.id,
          configVersion: config.id,
          pMarket: s.pMarket,
          pModel: s.pModel,
          pModelLow: s.pModelLow,
          pModelHigh: s.pModelHigh,
          feeAdjustedCost: s.feeAdjustedCost,
          netEdge: s.netEdge,
          direction: s.direction,
          confidenceTier: s.confidenceTier,
          kellyFull: s.kellyFull,
          kellyUsed: s.kellyUsed,
          sizeCappedReason: s.sizeCappedReason,
          rankingScore: s.rankingScore,
          actionable: s.actionable,
        },
      });
    } catch {
      itemsFailed++;
    }
  }

  // Apply the 8% event-cluster cap across markets sharing an event_ticker.
  const byCluster = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCluster.get(r.eventTicker) ?? [];
    list.push(r);
    byCluster.set(r.eventTicker, list);
  }
  for (const list of byCluster.values()) {
    const capped = applyClusterCap(
      list.map((r) => ({ used: r.row.kellyUsed ?? 0, cappedReason: r.row.sizeCappedReason ?? null })),
    );
    list.forEach((r, i) => {
      r.row.kellyUsed = capped[i]!.used;
      r.row.sizeCappedReason = capped[i]!.cappedReason;
    });
  }

  if (rows.length > 0) {
    await db.insert(schema.scores).values(rows.map((r) => r.row));
  }

  return {
    itemsOk: rows.length,
    itemsFailed,
    meta: { actionable: rows.filter((r) => r.row.actionable).length },
  };
}

/** Per-series YES frequency with Laplace smoothing (k+1)/(n+2), n ≥ 8 (docs/04 §3.3). */
async function computeSeriesBaseRates(): Promise<Map<string, number>> {
  const resolutions = await db.query.resolutions.findMany();
  if (resolutions.length === 0) return new Map();

  const resolvedTickers = resolutions.map((r) => r.ticker);
  const resolvedMarkets = await db.query.markets.findMany({
    where: inArray(schema.markets.ticker, resolvedTickers),
  });
  const seriesOf = new Map(resolvedMarkets.map((m) => [m.ticker, m.seriesTicker]));

  const counts = new Map<string, { yes: number; n: number }>();
  for (const r of resolutions) {
    const series = seriesOf.get(r.ticker);
    if (!series) continue;
    const c = counts.get(series) ?? { yes: 0, n: 0 };
    c.n++;
    if (r.outcome === "yes") c.yes++;
    counts.set(series, c);
  }

  const rates = new Map<string, number>();
  for (const [series, c] of counts) {
    if (c.n >= 8) rates.set(series, (c.yes + 1) / (c.n + 2));
  }
  return rates;
}

async function countNewsPerMarket(tickers: string[]): Promise<Map<string, number>> {
  const links = await db.query.marketNews.findMany({
    where: inArray(schema.marketNews.marketTicker, tickers),
  });
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.marketTicker, (counts.get(l.marketTicker) ?? 0) + 1);
  return counts;
}
