// Hand-authored fixtures mirroring Kalshi Trade API v2 payload shapes.
// Includes a crypto event so category-exclusion (docs/04 §1) is testable,
// and settled markets so the settle job has resolutions to write.

export const openEventsResponse = {
  events: [
    {
      event_ticker: "USPREZ-24",
      series_ticker: "USPREZ",
      title: "2024 US Presidential Election",
      category: "Politics",
      markets: [
        {
          ticker: "USPREZ-24-DEM",
          event_ticker: "USPREZ-24",
          title: "Will the Democratic nominee win?",
          status: "active",
          close_time: "2026-11-03T00:00:00Z",
          yes_bid: 47,
          yes_ask: 49,
          no_bid: 51,
          no_ask: 53,
          last_price: 48,
          volume: 1_200_000,
          volume_24h: 34_000,
          open_interest: 220_000,
          liquidity: 90_000,
          result: "",
          rules_primary: "Resolves YES if the Democratic Party nominee wins the 2024 US presidential election.",
        },
      ],
    },
    {
      event_ticker: "FEDDECISION-26JUL",
      series_ticker: "FED",
      title: "Fed rate decision — July 2026",
      category: "Economics",
      markets: [
        {
          ticker: "FED-26JUL-HIKE",
          event_ticker: "FEDDECISION-26JUL",
          title: "Will the Fed raise rates in July 2026?",
          status: "active",
          close_time: "2026-07-31T18:00:00Z",
          yes_bid: 12,
          yes_ask: 15,
          no_bid: 85,
          no_ask: 88,
          last_price: 13,
          volume: 400_000,
          volume_24h: 8_500,
          open_interest: 60_000,
          liquidity: 25_000,
          result: "",
          rules_primary: "Resolves YES if the FOMC raises the target range at its July 2026 meeting.",
        },
      ],
    },
    {
      // A recently-closed market we track — its settled counterpart appears in
      // settledMarketsResponse, exercising the open→settled resolution path.
      event_ticker: "CPI-26JUN",
      series_ticker: "CPI",
      title: "June 2026 CPI",
      category: "Economics",
      markets: [
        {
          ticker: "CPI-26JUN-ABOVE3",
          event_ticker: "CPI-26JUN",
          title: "June 2026 CPI above 3%?",
          status: "active",
          close_time: "2026-07-10T12:30:00Z",
          yes_bid: 28,
          yes_ask: 31,
          volume_24h: 5_000,
          open_interest: 40_000,
          result: "",
          rules_primary: "Resolves YES if YoY CPI for June 2026 exceeds 3.0%.",
        },
      ],
    },
    {
      // Excluded by config (crypto) — must not be ingested.
      event_ticker: "BTCPRICE-26",
      series_ticker: "BTC",
      title: "Bitcoin price end of 2026",
      category: "Crypto",
      markets: [
        {
          ticker: "BTC-26-100K",
          event_ticker: "BTCPRICE-26",
          title: "Will BTC close 2026 above $100k?",
          status: "active",
          close_time: "2026-12-31T23:59:00Z",
          yes_bid: 60,
          yes_ask: 63,
          volume_24h: 500_000,
          open_interest: 800_000,
          result: "",
          rules_primary: "Resolves YES if BTC/USD closes above 100000 on 2026-12-31.",
        },
      ],
    },
  ],
  cursor: null,
};

export const settledMarketsResponse = {
  markets: [
    {
      ticker: "CPI-26JUN-ABOVE3",
      event_ticker: "CPI-26JUN",
      title: "June 2026 CPI above 3%?",
      status: "settled",
      close_time: "2026-07-10T12:30:00Z",
      result: "no",
      volume_24h: 0,
      rules_primary: "Resolves YES if YoY CPI for June 2026 exceeds 3.0%.",
    },
  ],
  cursor: null,
};
