import { db, schema } from "@/db";
import { getActiveConfig } from "@/lib/services/config";
import { getKalshiClient } from "./index";
import { classifyForIngest } from "./ingest-filter";
import type { NormalizedMarket } from "./types";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Walk every open Kalshi market; store only those in stored categories whose
 * 24h volume clears `ingest_min_volume` — upsert `markets`, append
 * `market_snapshots` (docs/02 §5). Cursor-paginated, partial failure
 * tolerated: a single bad market increments itemsFailed rather than aborting.
 */
export async function runIngest(): Promise<RunResult> {
  const client = getKalshiClient();
  const { thresholds } = await getActiveConfig();
  const opts = {
    excluded: new Set(thresholds.excluded_categories.map((c) => c.toLowerCase())),
    minVolume: thresholds.ingest_min_volume,
  };

  let itemsOk = 0;
  let itemsFailed = 0;
  let skippedExcluded = 0;
  let skippedBelowFloor = 0;
  let cursor: string | undefined;

  do {
    const page = await client.listMarkets({ status: "open", cursor });
    for (const m of page.markets) {
      const decision = classifyForIngest(m, opts);
      if (decision === "excluded") {
        skippedExcluded++;
        continue;
      }
      if (decision === "below_floor") {
        skippedBelowFloor++;
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

  return {
    itemsOk,
    itemsFailed,
    meta: { skippedExcluded, skippedBelowFloor, minVolume: opts.minVolume },
  };
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
