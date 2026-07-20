import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getKalshiClient } from "./index";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Detect resolved Kalshi markets and write `resolutions` (docs/02 §5).
 * Only writes markets we already track and that have a YES/NO result.
 * Idempotent: onConflictDoNothing keeps the first-seen resolution immutable.
 */
export async function runSettle(): Promise<RunResult> {
  const client = getKalshiClient();
  let itemsOk = 0;
  let itemsFailed = 0;
  let cursor: string | undefined;

  do {
    const page = await client.listMarkets({ status: "settled", cursor });
    for (const m of page.markets) {
      if (m.result !== "yes" && m.result !== "no") continue;
      try {
        const known = await db.query.markets.findFirst({
          where: (mk, { eq }) => eq(mk.ticker, m.ticker),
        });
        if (!known) continue; // only settle markets we ingested

        await db
          .insert(schema.resolutions)
          .values({
            ticker: m.ticker,
            resolvedAt: m.closeTime ?? new Date(),
            outcome: m.result,
            settlementSource: "kalshi",
          })
          .onConflictDoNothing({ target: schema.resolutions.ticker });

        await db
          .update(schema.markets)
          .set({ status: "settled", updatedAt: new Date() })
          .where(eq(schema.markets.ticker, m.ticker));
        itemsOk++;
      } catch {
        itemsFailed++;
      }
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return { itemsOk, itemsFailed };
}
