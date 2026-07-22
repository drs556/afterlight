import type { KalshiMarketDto } from "./schemas";
import type { NormalizedMarket } from "./types";

const KALSHI_WEB_BASE = "https://kalshi.com/markets";

/** Kalshi prices are integer cents in [0,100]; normalize to a probability in [0,1]. */
function centsToProb(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return v / 100;
}

/** Current API returns dollar-denominated decimal strings already in [0,1]. */
function dollarsToProb(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Prefer the current dollar-string fields; fall back to legacy integer cents. */
function pickProb(
  dollars: string | null | undefined,
  cents: number | null | undefined,
): number | null {
  const fromDollars = dollarsToProb(dollars);
  return fromDollars !== null ? fromDollars : centsToProb(cents);
}

function pickCount(fp: string | null | undefined, legacy: number | null | undefined): number | null {
  // The current `*_fp` fields are fractional (e.g. "282.01"); volume/open_interest
  // are stored as bigint, so round to the nearest whole count. The exact raw value
  // is preserved in `market_snapshots.raw` for audit.
  if (fp !== null && fp !== undefined) {
    const n = Number(fp);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return legacy ?? null;
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
  ctx: { category?: string | null; seriesTicker?: string | null; eventTitle?: string | null } = {},
): NormalizedMarket {
  const yesBid = pickProb(dto.yes_bid_dollars, dto.yes_bid);
  const yesAsk = pickProb(dto.yes_ask_dollars, dto.yes_ask);
  const yesMid = yesBid !== null && yesAsk !== null ? (yesBid + yesAsk) / 2 : null;
  const spread = yesBid !== null && yesAsk !== null ? yesAsk - yesBid : null;

  const rules = [dto.rules_primary, dto.rules_secondary].filter(Boolean).join("\n\n") || null;

  // Kalshi carries the title on the event; a nested market may only add a
  // subtitle (or nothing). Fall back event title → subtitle → ticker so
  // `title` is always a non-empty string.
  const baseTitle = dto.title ?? ctx.eventTitle ?? null;
  const title = dto.subtitle
    ? baseTitle
      ? `${baseTitle} — ${dto.subtitle}`
      : dto.subtitle
    : (baseTitle ?? dto.ticker);

  return {
    ticker: dto.ticker,
    eventTicker: dto.event_ticker ?? null,
    seriesTicker: ctx.seriesTicker ?? null,
    title,
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
    volume: pickCount(dto.volume_24h_fp, dto.volume_24h) ?? pickCount(dto.volume_fp, dto.volume),
    openInterest: pickCount(dto.open_interest_fp, dto.open_interest),
    result: parseResult(dto.result),
    raw: dto,
  };
}
