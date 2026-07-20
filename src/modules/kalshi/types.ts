// Normalized Kalshi domain types (prices in [0,1]) and the client interface.
// The UI/jobs depend only on this interface, never on the HTTP details —
// so a fixture double can stand in for the real API (docs/03 §6.5).

export interface NormalizedMarket {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  title: string;
  category: string | null;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  status: string;
  kalshiUrl: string;
  // Snapshot fields, normalized to [0,1]. Null when the book is empty.
  yesBid: number | null;
  yesAsk: number | null;
  yesMid: number | null;
  spread: number | null;
  volume: number | null;
  openInterest: number | null;
  // Resolution (present once settled).
  result: "yes" | "no" | null;
  raw: unknown;
}

export type MarketStatusFilter = "open" | "settled";

export interface ListMarketsParams {
  status: MarketStatusFilter;
  cursor?: string;
}

export interface ListMarketsPage {
  markets: NormalizedMarket[];
  cursor: string | null;
}

export interface KalshiClient {
  /** One page of markets for the given status. Callers loop on `cursor`. */
  listMarkets(params: ListMarketsParams): Promise<ListMarketsPage>;
}
