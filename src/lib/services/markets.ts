import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface OpportunityRow {
  ticker: string;
  title: string;
  category: string | null;
  closeTime: Date | null;
  yesMid: number | null;
  spread: number | null;
  volume: number | null;
  capturedAt: Date | null;
}

export interface OpportunitiesView {
  rows: OpportunityRow[];
  total: number;
}

/**
 * Active markets with their latest snapshot (market data only — no model
 * columns yet; those arrive in M3). Sorted by volume desc as a stand-in for
 * ranking until scores exist. Capped at `limit` rows (the full universe can be
 * tens of thousands); `total` reports how many active markets exist.
 */
export async function getOpportunities(limit = 100): Promise<OpportunitiesView> {
  const markets = await db.query.markets.findMany({
    where: eq(schema.markets.status, "active"),
    // Never load the large `raw` jsonb (Neon 64MB response cap) — only the row fields.
    columns: { ticker: true, title: true, category: true, closeTime: true },
  });
  if (markets.length === 0) return { rows: [], total: 0 };

  const tickers = markets.map((m) => m.ticker);
  const snaps = await db.query.marketSnapshots.findMany({
    where: inArray(schema.marketSnapshots.ticker, tickers),
    columns: { ticker: true, yesMid: true, spread: true, volume: true, capturedAt: true },
    orderBy: (s, { desc }) => desc(s.capturedAt),
  });

  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latest.has(s.ticker)) latest.set(s.ticker, s);

  const rows = markets
    .map((m) => {
      const s = latest.get(m.ticker);
      return {
        ticker: m.ticker,
        title: m.title,
        category: m.category,
        closeTime: m.closeTime,
        yesMid: s?.yesMid ?? null,
        spread: s?.spread ?? null,
        volume: s?.volume ?? null,
        capturedAt: s?.capturedAt ?? null,
      };
    })
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit);

  return { rows, total: markets.length };
}

export interface RankedOpportunity {
  ticker: string;
  title: string;
  category: string | null;
  closeTime: Date | null;
  yesMid: number | null;
  pModel: number | null;
  uncertainty: number | null;
  netEdge: number | null;
  confidenceTier: string | null;
  kellyUsed: number | null;
  sizeCappedReason: string | null;
  actionable: boolean;
  rankingScore: number | null;
  volume: number | null;
  capturedAt: Date | null;
}

/**
 * Latest score per active market, ranked by ranking_score desc (docs/01 §3.1).
 * Ties broken by volume via the snapshot. Returns [] when nothing is scored yet.
 */
export async function getRankedOpportunities(): Promise<RankedOpportunity[]> {
  const markets = await db.query.markets.findMany({
    where: eq(schema.markets.status, "active"),
    // Never load the large `raw` jsonb (Neon 64MB response cap).
    columns: { ticker: true, title: true, category: true, closeTime: true },
  });
  if (markets.length === 0) return [];
  const tickers = markets.map((m) => m.ticker);
  const marketById = new Map(markets.map((m) => [m.ticker, m]));

  const allScores = await db.query.scores.findMany({
    where: inArray(schema.scores.ticker, tickers),
    orderBy: (s, { desc }) => desc(s.createdAt),
  });
  const latest = new Map<string, (typeof allScores)[number]>();
  for (const s of allScores) if (!latest.has(s.ticker)) latest.set(s.ticker, s);
  if (latest.size === 0) return [];

  const snapIds = [...latest.values()].map((s) => s.snapshotId).filter((v): v is number => v !== null);
  const snaps = snapIds.length
    ? await db.query.marketSnapshots.findMany({
        where: inArray(schema.marketSnapshots.id, snapIds),
        columns: { id: true, capturedAt: true, volume: true },
      })
    : [];
  const snapById = new Map(snaps.map((s) => [s.id, s]));

  const rows: RankedOpportunity[] = [];
  for (const s of latest.values()) {
    const m = marketById.get(s.ticker)!;
    const snap = s.snapshotId !== null ? snapById.get(s.snapshotId) : undefined;
    const uncertainty =
      s.pModel !== null && s.pModelLow !== null && s.pModelHigh !== null
        ? Math.max(s.pModelHigh - s.pModel, s.pModel - s.pModelLow)
        : null;
    rows.push({
      ticker: s.ticker,
      title: m.title,
      category: m.category,
      closeTime: m.closeTime,
      yesMid: s.pMarket,
      pModel: s.pModel,
      uncertainty,
      netEdge: s.netEdge,
      confidenceTier: s.confidenceTier,
      kellyUsed: s.kellyUsed,
      sizeCappedReason: s.sizeCappedReason,
      actionable: s.actionable,
      rankingScore: s.rankingScore,
      volume: snap?.volume ?? null,
      capturedAt: snap?.capturedAt ?? null,
    });
  }
  return rows.sort(
    (a, b) => (b.rankingScore ?? -Infinity) - (a.rankingScore ?? -Infinity),
  );
}

export interface AssessmentRationale {
  thesis?: string;
  evidence_for?: string[];
  evidence_against?: string[];
  change_triggers?: string[];
  self_check?: { key_uncertainty?: string };
}

export interface MarketDetail {
  market: typeof schema.markets.$inferSelect;
  history: { capturedAt: Date; yesMid: number | null }[];
  resolution: typeof schema.resolutions.$inferSelect | null;
  assessment: typeof schema.llmAssessments.$inferSelect | null;
  news: (typeof schema.newsItems.$inferSelect)[];
  score: typeof schema.scores.$inferSelect | null;
  scoreWeights: { w_mkt: number; w_llm: number; w_base: number } | null;
}

/** A market with its full price history (for the chart) and resolution, if any. */
export async function getMarketDetail(ticker: string): Promise<MarketDetail | null> {
  const market = await db.query.markets.findFirst({
    where: eq(schema.markets.ticker, ticker),
  });
  if (!market) return null;

  const snaps = await db.query.marketSnapshots.findMany({
    where: eq(schema.marketSnapshots.ticker, ticker),
    orderBy: (s, { asc }) => asc(s.capturedAt),
  });
  const resolution =
    (await db.query.resolutions.findFirst({
      where: eq(schema.resolutions.ticker, ticker),
    })) ?? null;

  const assessment =
    (await db.query.llmAssessments.findFirst({
      where: eq(schema.llmAssessments.ticker, ticker),
      orderBy: (a, { desc }) => desc(a.createdAt),
    })) ?? null;

  // News linked to this market, most-recently retrieved first.
  const links = await db.query.marketNews.findMany({
    where: eq(schema.marketNews.marketTicker, ticker),
    orderBy: (mn, { desc }) => desc(mn.retrievedAt),
    limit: 12,
  });
  const newsIds = [...new Set(links.map((l) => l.newsId))];
  const news = newsIds.length
    ? await db.query.newsItems.findMany({
        where: inArray(schema.newsItems.id, newsIds),
      })
    : [];

  const score =
    (await db.query.scores.findFirst({
      where: eq(schema.scores.ticker, ticker),
      orderBy: (s, { desc }) => desc(s.createdAt),
    })) ?? null;

  let scoreWeights: MarketDetail["scoreWeights"] = null;
  if (score) {
    const cfg = await db.query.configVersions.findFirst({
      where: eq(schema.configVersions.id, score.configVersion),
    });
    const w = cfg?.weights as { w_mkt?: number; w_llm?: number; w_base?: number } | undefined;
    if (w && w.w_mkt !== undefined && w.w_llm !== undefined && w.w_base !== undefined) {
      scoreWeights = { w_mkt: w.w_mkt, w_llm: w.w_llm, w_base: w.w_base };
    }
  }

  return {
    market,
    history: snaps.map((s) => ({ capturedAt: s.capturedAt, yesMid: s.yesMid })),
    resolution,
    assessment,
    news,
    score,
    scoreWeights,
  };
}
