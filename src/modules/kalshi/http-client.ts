import crypto from "node:crypto";
import {
  kalshiEventsEnvelopeSchema,
  kalshiMarketSchema,
  kalshiMarketsResponseSchema,
  type KalshiMarketDto,
} from "./schemas";
import { normalizeMarket } from "./mapper";
import type { KalshiClient, ListMarketsPage, ListMarketsParams, NormalizedMarket } from "./types";

const BASE_URL =
  process.env.KALSHI_API_BASE ?? "https://api.elections.kalshi.com/trade-api/v2";
const PATH_PREFIX = "/trade-api/v2";

interface HttpClientOptions {
  keyId: string;
  privateKeyPem: string;
  minIntervalMs?: number;
  maxRetries?: number;
}

/**
 * Real Kalshi Trade API v2 client. Read-only (docs/02 §7 — no order paths).
 * - Rate limited by a minimum inter-request interval + exponential backoff.
 * - RSA-PSS request signing per Kalshi's auth scheme.
 * - Responses validated with zod; malformed pages throw.
 *
 * NOTE: exercised only when KALSHI_API_KEY_ID is set. Fixtures cover the
 * pipeline in dev/CI (docs/03 §6.5); this path needs live keys to verify.
 */
export class HttpKalshiClient implements KalshiClient {
  private lastRequestAt = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;

  constructor(private readonly opts: HttpClientOptions) {
    this.minIntervalMs = opts.minIntervalMs ?? 120;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  private sign(timestamp: string, method: string, path: string): string {
    const message = `${timestamp}${method}${path}`;
    return crypto.sign("sha256", Buffer.from(message), {
      key: this.opts.privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    }).toString("base64");
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get(path: string, query: Record<string, string | undefined>): Promise<unknown> {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][],
    ).toString();
    const fullPath = `${PATH_PREFIX}${path}`;
    const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const timestamp = Date.now().toString();
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "KALSHI-ACCESS-KEY": this.opts.keyId,
          "KALSHI-ACCESS-SIGNATURE": this.sign(timestamp, "GET", fullPath),
          "KALSHI-ACCESS-TIMESTAMP": timestamp,
          Accept: "application/json",
        },
      });

      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        throw new Error(`Kalshi GET ${path} failed: ${res.status} ${await res.text()}`);
      }
      const backoff = Math.min(2000, 250 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  async listMarkets(params: ListMarketsParams): Promise<ListMarketsPage> {
    if (params.status === "open") {
      // Events carry category + series_ticker; nested markets give us prices.
      const raw = await this.get("/events", {
        status: "open",
        with_nested_markets: "true",
        limit: "200",
        cursor: params.cursor,
      });
      const parsed = kalshiEventsEnvelopeSchema.parse(raw);
      const markets: NormalizedMarket[] = [];
      for (const ev of parsed.events) {
        for (const rawM of ev.markets ?? []) {
          // Per-market parse: a single malformed market is skipped, never
          // aborts the page (docs/02 §5). Kalshi's combo/multivariate legs
          // occasionally omit required fields.
          const r = kalshiMarketSchema.safeParse(rawM);
          if (!r.success) continue;
          if (r.data.status !== "active") continue;
          markets.push(
            normalizeMarket(r.data, {
              category: ev.category,
              seriesTicker: ev.series_ticker,
              eventTitle: ev.title,
            }),
          );
        }
      }
      return { markets, cursor: parsed.cursor ?? null };
    }

    // Settled markets: /markets?status=settled (category not needed for settle).
    const raw = await this.get("/markets", {
      status: "settled",
      limit: "200",
      cursor: params.cursor,
    });
    const parsed = kalshiMarketsResponseSchema.parse(raw);
    const markets = parsed.markets.map((m: KalshiMarketDto) => normalizeMarket(m));
    return { markets, cursor: parsed.cursor ?? null };
  }
}
