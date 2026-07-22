import { describe, it, expect } from "vitest";
import { normalizeMarket } from "@/modules/kalshi/mapper";
import type { KalshiMarketDto } from "@/modules/kalshi/schemas";

const base: KalshiMarketDto = {
  ticker: "TEST-1",
  event_ticker: "EVT-1",
  title: "Will it rain?",
  status: "active",
  close_time: "2026-08-01T00:00:00Z",
  yes_bid: 40,
  yes_ask: 44,
  volume_24h: 1234,
  open_interest: 5000,
  result: "",
};

describe("normalizeMarket", () => {
  it("normalizes cents to probabilities and derives mid/spread", () => {
    const m = normalizeMarket(base);
    expect(m.yesBid).toBeCloseTo(0.4, 12);
    expect(m.yesAsk).toBeCloseTo(0.44, 12);
    expect(m.yesMid).toBeCloseTo(0.42, 12);
    expect(m.spread).toBeCloseTo(0.04, 12);
  });

  it("carries category and series from the event context", () => {
    const m = normalizeMarket(base, { category: "Politics", seriesTicker: "SER-1" });
    expect(m.category).toBe("Politics");
    expect(m.seriesTicker).toBe("SER-1");
  });

  it("appends subtitle to the title when present", () => {
    const m = normalizeMarket({ ...base, subtitle: "Seattle" });
    expect(m.title).toBe("Will it rain? — Seattle");
  });

  it("leaves prices null when the book is empty", () => {
    const m = normalizeMarket({ ...base, yes_bid: null, yes_ask: null });
    expect(m.yesMid).toBeNull();
    expect(m.spread).toBeNull();
  });

  it("parses only yes/no results, else null", () => {
    expect(normalizeMarket({ ...base, result: "yes" }).result).toBe("yes");
    expect(normalizeMarket({ ...base, result: "no" }).result).toBe("no");
    expect(normalizeMarket({ ...base, result: "" }).result).toBeNull();
  });

  it("prefers 24h volume over lifetime volume", () => {
    expect(normalizeMarket({ ...base, volume: 99, volume_24h: 7 }).volume).toBe(7);
    expect(normalizeMarket({ ...base, volume: 99, volume_24h: undefined }).volume).toBe(99);
  });

  it("prefers current dollar-string fields over legacy cents fields", () => {
    const m = normalizeMarket({
      ...base,
      yes_bid: 40, // legacy fields present but should be ignored
      yes_ask: 44,
      yes_bid_dollars: "0.12",
      yes_ask_dollars: "0.13",
      volume_24h_fp: "1409.24",
      open_interest_fp: "500.5",
    });
    expect(m.yesBid).toBeCloseTo(0.12, 12);
    expect(m.yesAsk).toBeCloseTo(0.13, 12);
    expect(m.volume).toBeCloseTo(1409.24, 12);
    expect(m.openInterest).toBeCloseTo(500.5, 12);
  });

  it("falls back to legacy cents fields when dollar-string fields are absent", () => {
    const m = normalizeMarket({ ...base, yes_bid_dollars: undefined, yes_ask_dollars: undefined });
    expect(m.yesBid).toBeCloseTo(0.4, 12);
    expect(m.yesAsk).toBeCloseTo(0.44, 12);
  });

  it("falls back to the event title when the market has no title of its own", () => {
    const { title, ...noTitle } = base;
    void title;
    const m = normalizeMarket(noTitle, { eventTitle: "2028 Presidential Election" });
    expect(m.title).toBe("2028 Presidential Election");
  });

  it("combines event title with subtitle when the market has no title", () => {
    const { title, ...noTitle } = base;
    void title;
    const m = normalizeMarket(
      { ...noTitle, subtitle: "Candidate X" },
      { eventTitle: "2028 Presidential Election" },
    );
    expect(m.title).toBe("2028 Presidential Election — Candidate X");
  });

  it("falls back to the ticker when neither market nor event has a title", () => {
    const { title, ...noTitle } = base;
    void title;
    const m = normalizeMarket(noTitle);
    expect(m.title).toBe("TEST-1");
  });
});
