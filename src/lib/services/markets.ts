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

/**
 * Active markets with their latest snapshot (market data only — no model
 * columns yet; those arrive in M3). Sorted by volume desc as a stand-in for
 * ranking until scores exist.
 */
export async function getOpportunities(): Promise<OpportunityRow[]> {
  const markets = await db.query.markets.findMany({
    where: eq(schema.markets.status, "active"),
  });
  if (markets.length === 0) return [];

  const tickers = markets.map((m) => m.ticker);
  const snaps = await db.query.marketSnapshots.findMany({
    where: inArray(schema.marketSnapshots.ticker, tickers),
    orderBy: (s, { desc }) => desc(s.capturedAt),
  });

  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latest.has(s.ticker)) latest.set(s.ticker, s);

  return markets
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
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
}

export interface MarketDetail {
  market: typeof schema.markets.$inferSelect;
  history: { capturedAt: Date; yesMid: number | null }[];
  resolution: typeof schema.resolutions.$inferSelect | null;
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

  return {
    market,
    history: snaps.map((s) => ({ capturedAt: s.capturedAt, yesMid: s.yesMid })),
    resolution,
  };
}
