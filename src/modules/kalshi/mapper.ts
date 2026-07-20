import type { KalshiMarketDto } from "./schemas";
import type { NormalizedMarket } from "./types";

const KALSHI_WEB_BASE = "https://kalshi.com/markets";

/** Kalshi prices are integer cents in [0,100]; normalize to a probability in [0,1]. */
function centsToProb(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return v / 100;
}

function parseResult(result: string | undefined): "yes" | "no" | null {
  if (result === "yes" || result === "no") return result;
  return null;
}

/**
 * Map a raw Kalshi market DTO to our normalized domain shape.
 * `category` and `seriesTicker` come from the enclosing event (passed in),
 * since Kalshi carries them on the event, not the market.
 */
export function normalizeMarket(
  dto: KalshiMarketDto,
  ctx: { category?: string | null; seriesTicker?: string | null } = {},
): NormalizedMarket {
  const yesBid = centsToProb(dto.yes_bid);
  const yesAsk = centsToProb(dto.yes_ask);
  const yesMid = yesBid !== null && yesAsk !== null ? (yesBid + yesAsk) / 2 : null;
  const spread = yesBid !== null && yesAsk !== null ? yesAsk - yesBid : null;

  const rules = [dto.rules_primary, dto.rules_secondary].filter(Boolean).join("\n\n") || null;

  return {
    ticker: dto.ticker,
    eventTicker: dto.event_ticker ?? null,
    seriesTicker: ctx.seriesTicker ?? null,
    title: dto.subtitle ? `${dto.title} — ${dto.subtitle}` : dto.title,
    category: ctx.category ?? null,
    rulesSummary: rules,
    resolutionSource: null,
    closeTime: dto.close_time ? new Date(dto.close_time) : null,
    status: dto.status,
    kalshiUrl: `${KALSHI_WEB_BASE}/${dto.ticker}`,
    yesBid,
    yesAsk,
    yesMid,
    spread,
    // §1 uses 24h volume for the liquidity floor; fall back to lifetime volume.
    volume: dto.volume_24h ?? dto.volume ?? null,
    openInterest: dto.open_interest ?? null,
    result: parseResult(dto.result),
    raw: dto,
  };
}
