import { kalshiEventsResponseSchema, kalshiMarketsResponseSchema } from "./schemas";
import { normalizeMarket } from "./mapper";
import { openEventsResponse, settledMarketsResponse } from "./fixtures/data";
import type { KalshiClient, ListMarketsPage, ListMarketsParams, NormalizedMarket } from "./types";

/**
 * Fixture-backed client — runs the pipeline end-to-end with zero external
 * calls (docs/03 §6.5). Validates fixtures through the same schemas + mapper
 * as the HTTP client, so it exercises the real normalization path.
 * Selected automatically when no Kalshi API key is configured.
 */
export class FixtureKalshiClient implements KalshiClient {
  async listMarkets(params: ListMarketsParams): Promise<ListMarketsPage> {
    if (params.status === "open") {
      const parsed = kalshiEventsResponseSchema.parse(openEventsResponse);
      const markets: NormalizedMarket[] = [];
      for (const ev of parsed.events) {
        for (const m of ev.markets ?? []) {
          if (m.status !== "active") continue;
          markets.push(
            normalizeMarket(m, { category: ev.category, seriesTicker: ev.series_ticker }),
          );
        }
      }
      return { markets, cursor: null };
    }

    const parsed = kalshiMarketsResponseSchema.parse(settledMarketsResponse);
    return { markets: parsed.markets.map((m) => normalizeMarket(m)), cursor: null };
  }

  async getMarketsByTickers(tickers: string[]): Promise<NormalizedMarket[]> {
    const wanted = new Set(tickers);
    // Keyed by ticker: Kalshi returns one row per ticker, and a ticker present
    // in both fixtures must not come back twice. The settled fixture is written
    // last so a resolved market wins over its open snapshot — the resolution is
    // the authoritative current state.
    const byTicker = new Map<string, NormalizedMarket>();

    const events = kalshiEventsResponseSchema.parse(openEventsResponse);
    for (const ev of events.events) {
      for (const m of ev.markets ?? []) {
        const n = normalizeMarket(m, { category: ev.category, seriesTicker: ev.series_ticker });
        if (wanted.has(n.ticker)) byTicker.set(n.ticker, n);
      }
    }
    const settled = kalshiMarketsResponseSchema.parse(settledMarketsResponse);
    for (const m of settled.markets) {
      const n = normalizeMarket(m);
      if (wanted.has(n.ticker)) byTicker.set(n.ticker, n);
    }

    // Unknown tickers are simply absent, as with the live client.
    return [...byTicker.values()];
  }
}
