import { z } from "zod";

// Zod schemas for Kalshi Trade API v2 responses (docs/02 §8.4, docs/03 §1).
// Prices from Kalshi are integer cents (0–100); we normalize to [0,1] in the mapper.

// A market as returned nested inside an event, or from GET /markets.
export const kalshiMarketSchema = z.object({
  ticker: z.string(),
  event_ticker: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string(), // "active" | "closed" | "settled" | "finalized" ...
  close_time: z.string().optional(), // ISO 8601
  yes_bid: z.number().nullish(),
  yes_ask: z.number().nullish(),
  no_bid: z.number().nullish(),
  no_ask: z.number().nullish(),
  last_price: z.number().nullish(),
  volume: z.number().nullish(),
  volume_24h: z.number().nullish(),
  open_interest: z.number().nullish(),
  liquidity: z.number().nullish(),
  result: z.string().optional(), // "yes" | "no" | "" while open
  rules_primary: z.string().optional(),
  rules_secondary: z.string().optional(),
});

export type KalshiMarketDto = z.infer<typeof kalshiMarketSchema>;

// GET /markets response.
export const kalshiMarketsResponseSchema = z.object({
  markets: z.array(kalshiMarketSchema),
  cursor: z.string().nullish(),
});

// An event carries the category + series_ticker; markets can be nested when
// requested with ?with_nested_markets=true.
export const kalshiEventSchema = z.object({
  event_ticker: z.string(),
  series_ticker: z.string().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  markets: z.array(kalshiMarketSchema).optional(),
});

export type KalshiEventDto = z.infer<typeof kalshiEventSchema>;

// GET /events response.
export const kalshiEventsResponseSchema = z.object({
  events: z.array(kalshiEventSchema),
  cursor: z.string().nullish(),
});
