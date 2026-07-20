import { db, schema } from "@/db";
import { getActiveConfig } from "@/lib/services/config";
import { getKalshiClient } from "./index";
import type { NormalizedMarket } from "./types";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Pull open Kalshi markets in included categories; upsert `markets` and append
 * `market_snapshots` (docs/02 §5). Cursor-paginated, partial failure tolerated:
 * a single bad market increments itemsFailed rather than aborting the run.
 */
export async function runIngest(): Promise<RunResult> {
  const client = getKalshiClient();
  const { thresholds } = await getActiveConfig();
  const excluded = new Set(thresholds.excluded_categories.map((c) => c.toLowerCase()));

  let itemsOk = 0;
  let itemsFailed = 0;
  let skipped = 0;
  let cursor: string | undefined;

  do {
    const page = await client.listMarkets({ status: "open", cursor });
    for (const m of page.markets) {
      if (m.category && excluded.has(m.category.toLowerCase())) {
        skipped++;
        continue;
      }
      try {
        await upsertMarketWithSnapshot(m);
        itemsOk++;
      } catch {
        itemsFailed++;
      }
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return { itemsOk, itemsFailed, meta: { skippedExcluded: skipped } };
}

async function upsertMarketWithSnapshot(m: NormalizedMarket): Promise<void> {
  await db
    .insert(schema.markets)
    .values({
      ticker: m.ticker,
      eventTicker: m.eventTicker,
      seriesTicker: m.seriesTicker,
      title: m.title,
      category: m.category,
      rulesSummary: m.rulesSummary,
      resolutionSource: m.resolutionSource,
      closeTime: m.closeTime,
      status: m.status,
      kalshiUrl: m.kalshiUrl,
      raw: m.raw,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.markets.ticker,
      set: {
        title: m.title,
        category: m.category,
        rulesSummary: m.rulesSummary,
        closeTime: m.closeTime,
        status: m.status,
        raw: m.raw,
        updatedAt: new Date(),
      },
    });

  // Append-only snapshot (docs/02 §4).
  await db.insert(schema.marketSnapshots).values({
    ticker: m.ticker,
    yesBid: m.yesBid,
    yesAsk: m.yesAsk,
    yesMid: m.yesMid,
    spread: m.spread,
    volume: m.volume,
    openInterest: m.openInterest,
    raw: m.raw,
  });
}
