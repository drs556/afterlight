import { describe, it, expect } from "vitest";
import {
  MAX_SNAPSHOT_AGE_HOURS,
  rankCandidates,
  type CandidateInput,
  type RankOptions,
} from "@/modules/enrich/select";

const NOW = new Date("2026-09-24T12:00:00Z");
const H = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H);

let seq = 0;
/** An eligible Politics market, 10 days from close, never assessed. */
function row(over: Partial<CandidateInput> = {}): CandidateInput {
  seq++;
  return {
    ticker: `T-${seq}`,
    eventTicker: `EV-${seq}`,
    category: "Politics",
    title: `Market ${seq}`,
    rulesSummary: null,
    resolutionSource: null,
    closeTime: at(240),
    snapshotId: seq,
    snapshotCapturedAt: at(-1),
    yesMid: 0.5,
    spread: 0.02,
    volume: 1000,
    lastAssessedAt: null,
    ...over,
  };
}

const opts: RankOptions = {
  now: NOW,
  topK: 40,
  maxPerEvent: 2,
  categories: ["Politics", "Economics"],
  minVolume: 500,
  maxSpread: 0.08,
  maxDaysToClose: 540,
};

const tickers = (rows: CandidateInput[], o: Partial<RankOptions> = {}) =>
  rankCandidates(rows, { ...opts, ...o }).candidates.map((c) => c.ticker);

describe("rankCandidates — eligibility (docs/04 §1)", () => {
  it("keeps only allowlisted categories, case-insensitively", () => {
    const rows = [
      row({ ticker: "POL", category: "Politics" }),
      row({ ticker: "ECO", category: "economics" }),
      row({ ticker: "SPO", category: "Sports" }),
      row({ ticker: "NUL", category: null }),
    ];
    expect(tickers(rows).sort()).toEqual(["ECO", "POL"]);
  });

  it("treats an empty allowlist as no category filter", () => {
    const rows = [row({ ticker: "SPO", category: "Sports" }), row({ ticker: "NUL", category: null })];
    expect(tickers(rows, { categories: [] }).sort()).toEqual(["NUL", "SPO"]);
  });

  it("drops snapshots older than MAX_SNAPSHOT_AGE_HOURS and keeps the boundary", () => {
    const rows = [
      row({ ticker: "EDGE", snapshotCapturedAt: at(-MAX_SNAPSHOT_AGE_HOURS) }),
      row({ ticker: "OLD", snapshotCapturedAt: at(-MAX_SNAPSHOT_AGE_HOURS - 0.01) }),
    ];
    expect(tickers(rows)).toEqual(["EDGE"]);
  });

  it("applies the liquidity floor inclusively and treats unknown volume as zero", () => {
    const rows = [
      row({ ticker: "AT", volume: 500 }),
      row({ ticker: "BELOW", volume: 499 }),
      row({ ticker: "NULL", volume: null }),
    ];
    expect(tickers(rows)).toEqual(["AT"]);
  });

  it("applies the spread ceiling inclusively and rejects an unknown spread", () => {
    const rows = [
      row({ ticker: "AT", spread: 0.08 }),
      row({ ticker: "WIDE", spread: 0.09 }),
      row({ ticker: "NOBOOK", spread: null }),
    ];
    expect(tickers(rows)).toEqual(["AT"]);
  });

  it("requires 6h..maxDaysToClose until close, and a known close time", () => {
    const rows = [
      row({ ticker: "SIX", closeTime: at(6) }),
      row({ ticker: "SOON", closeTime: at(5.9) }),
      row({ ticker: "FAR", closeTime: at(541 * 24) }),
      row({ ticker: "NOCLOSE", closeTime: null }),
    ];
    expect(tickers(rows)).toEqual(["SIX"]);
  });
});

describe("rankCandidates — ordering", () => {
  it("orders by volume × 1/(1+daysToClose) × (1+stalenessHours)", () => {
    // NEW:  1000 × 1/11 × (1 + 1e6) ≈ 90,909,182  (never assessed ranks first)
    // NEAR: 2000 × 1/2  × (1 + 24)  =     25,000  (closes in 1 day)
    // BIG:  5000 × 1/11 × (1 + 24)  ≈     11,364
    const rows = [
      row({ ticker: "BIG", volume: 5000, lastAssessedAt: at(-24) }),
      row({ ticker: "NEAR", volume: 2000, closeTime: at(24), lastAssessedAt: at(-24) }),
      row({ ticker: "NEW", volume: 1000 }),
    ];
    expect(tickers(rows)).toEqual(["NEW", "NEAR", "BIG"]);
  });

  it("breaks score ties by ticker so runs are deterministic", () => {
    const rows = [row({ ticker: "B" }), row({ ticker: "A" }), row({ ticker: "C" })];
    expect(tickers(rows)).toEqual(["A", "B", "C"]);
  });

  it("stops at topK", () => {
    const rows = [row({ ticker: "A" }), row({ ticker: "B" }), row({ ticker: "C" })];
    expect(tickers(rows, { topK: 2 })).toEqual(["A", "B"]);
  });
});

describe("rankCandidates — per-event cap", () => {
  it("takes at most maxPerEvent markets from one event, in rank order", () => {
    const ladder = [5000, 4000, 3000, 2000, 1000].map((volume, i) =>
      row({ ticker: `LAD-${i}`, eventTicker: "EV-LADDER", volume }),
    );
    const other = row({ ticker: "OTHER", eventTicker: "EV-OTHER", volume: 600 });
    expect(tickers([...ladder, other])).toEqual(["LAD-0", "LAD-1", "OTHER"]);
  });

  it("does not let capped markets consume topK slots", () => {
    const ladder = [5000, 4000, 3000].map((volume, i) =>
      row({ ticker: `LAD-${i}`, eventTicker: "EV-L", volume }),
    );
    const rest = [
      row({ ticker: "X", eventTicker: "EV-X", volume: 700 }),
      row({ ticker: "Y", eventTicker: "EV-Y", volume: 600 }),
    ];
    expect(tickers([...ladder, ...rest], { topK: 3, maxPerEvent: 1 })).toEqual(["LAD-0", "X", "Y"]);
  });

  it("treats a market with no event as its own group", () => {
    const rows = [row({ ticker: "A", eventTicker: null }), row({ ticker: "B", eventTicker: null })];
    expect(tickers(rows, { maxPerEvent: 1 })).toEqual(["A", "B"]);
  });
});

describe("rankCandidates — backlog count and payload", () => {
  it("counts eligible never-assessed markets, including ones the cap cut", () => {
    const rows = [
      row({ ticker: "A", eventTicker: "E" }),
      row({ ticker: "B", eventTicker: "E" }),
      row({ ticker: "C", eventTicker: "E" }), // cut by the cap, still backlog
      row({ ticker: "DONE", lastAssessedAt: at(-2) }), // assessed: not backlog
      row({ ticker: "SPORT", category: "Sports" }), // ineligible: not backlog
    ];
    const r = rankCandidates(rows, opts);
    expect(r.candidates.map((c) => c.ticker)).toEqual(["A", "B", "DONE"]);
    expect(r.eligibleUnassessed).toBe(3);
  });

  it("carries the snapshot id and price through for the assessment", () => {
    const [c] = rankCandidates([row({ ticker: "A", snapshotId: 77, yesMid: 0.31 })], opts).candidates;
    expect(c).toMatchObject({ ticker: "A", snapshotId: 77, yesMid: 0.31 });
  });
});
