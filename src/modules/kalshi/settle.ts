import { and, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getKalshiClient } from "./index";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Cap per invocation so the job stays inside the serverless budget as the
 * tracked universe grows (docs/02 §6 — small batch + reschedule). Resolved
 * markets drop out of the candidate set, so re-running drains the backlog.
 */
const MAX_PER_RUN = 2000;

/** Rows per write statement — one round trip each on neon-http. */
const WRITE_BATCH_SIZE = 500;

/**
 * Detect resolved Kalshi markets and write `resolutions` (docs/02 §5).
 *
 * Driven from *our* table, not Kalshi's: we ask about the markets we track that
 * are past close and have no resolution yet. Walking `?status=settled` from the
 * top would page through Kalshi's entire settled history — unbounded, and
 * almost all of it markets we never ingested.
 *
 * Idempotent: `onConflictDoNothing` keeps the first-seen resolution immutable
 * (append-only — docs/02 §4).
 */
export async function runSettle(): Promise<RunResult> {
  const client = getKalshiClient();

  // Ticker column only — never select `raw` across the universe (Neon 64MB cap).
  // Absence of a resolutions row is the idempotency key, not markets.status, so
  // a market whose status write failed previously is still retried.
  const candidates = await db
    .select({ ticker: schema.markets.ticker })
    .from(schema.markets)
    .leftJoin(schema.resolutions, sql`${schema.resolutions.ticker} = ${schema.markets.ticker}`)
    .where(and(isNull(schema.resolutions.ticker), lt(schema.markets.closeTime, new Date())))
    .orderBy(schema.markets.closeTime)
    .limit(MAX_PER_RUN);

  if (candidates.length === 0) {
    return { itemsOk: 0, itemsFailed: 0, meta: { candidates: 0, remaining: 0 } };
  }

  const tickers = candidates.map((c) => c.ticker);

  let fetched;
  try {
    fetched = await client.getMarketsByTickers(tickers);
  } catch (err) {
    // A Kalshi outage must not poison the run ledger with a partial state.
    return {
      itemsOk: 0,
      itemsFailed: tickers.length,
      meta: { candidates: tickers.length, error: (err as Error).message },
    };
  }

  const resolved = fetched.filter((m) => m.result === "yes" || m.result === "no");

  let itemsOk = 0;
  let itemsFailed = 0;

  for (let i = 0; i < resolved.length; i += WRITE_BATCH_SIZE) {
    const batch = resolved.slice(i, i + WRITE_BATCH_SIZE);
    try {
      await db
        .insert(schema.resolutions)
        .values(
          batch.map((m) => ({
            ticker: m.ticker,
            resolvedAt: m.closeTime ?? new Date(),
            outcome: m.result,
            settlementSource: "kalshi",
          })),
        )
        .onConflictDoNothing({ target: schema.resolutions.ticker });

      await db
        .update(schema.markets)
        .set({ status: "settled", updatedAt: new Date() })
        .where(
          inArray(
            schema.markets.ticker,
            batch.map((m) => m.ticker),
          ),
        );
      itemsOk += batch.length;
    } catch {
      itemsFailed += batch.length;
    }
  }

  return {
    itemsOk,
    itemsFailed,
    meta: {
      candidates: tickers.length,
      unresolvedOnKalshi: fetched.length - resolved.length,
      notFoundOnKalshi: tickers.length - fetched.length,
      // Non-zero means the cap was hit and a re-run will continue.
      remaining: candidates.length === MAX_PER_RUN ? "capped, re-run to continue" : 0,
    },
  };
}
