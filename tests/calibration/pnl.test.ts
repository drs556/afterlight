import { describe, it, expect } from "vitest";
import { paperPnl, type PaperPnlInput } from "@/modules/calibration/pnl";

function row(over: Partial<PaperPnlInput> = {}): PaperPnlInput {
  return {
    ticker: "T",
    direction: "yes",
    feeAdjustedCost: 0.55,
    kellyUsed: 0.03,
    actionable: true,
    outcome: 1,
    ...over,
  };
}

describe("paper PnL", () => {
  it("hand-computed win: stake=$300 (3% of $10k), c=0.55 → ROI (1-c)/c", () => {
    const res = paperPnl([row()], 10_000);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.stakeUsd).toBeCloseTo(300, 9);
    // profit = 300 * (0.45/0.55) = 245.4545...
    expect(res.rows[0]!.pnlUsd).toBeCloseTo(300 * (0.45 / 0.55), 9);
    expect(res.rows[0]!.won).toBe(true);
    expect(res.totalPnlUsd).toBeCloseTo(300 * (0.45 / 0.55), 9);
  });

  it("hand-computed loss: total stake lost", () => {
    const res = paperPnl([row({ outcome: 0 })], 10_000);
    expect(res.rows[0]!.won).toBe(false);
    expect(res.rows[0]!.pnlUsd).toBeCloseTo(-300, 9);
  });

  it("NO direction wins when outcome is 0", () => {
    const res = paperPnl([row({ direction: "no", outcome: 0 })], 10_000);
    expect(res.rows[0]!.won).toBe(true);
  });

  it("skips non-actionable rows", () => {
    const res = paperPnl([row({ actionable: false })], 10_000);
    expect(res.rows).toHaveLength(0);
  });

  it("skips rows with missing direction/cost/size", () => {
    expect(paperPnl([row({ direction: null })], 10_000).rows).toHaveLength(0);
    expect(paperPnl([row({ feeAdjustedCost: null })], 10_000).rows).toHaveLength(0);
    expect(paperPnl([row({ kellyUsed: null })], 10_000).rows).toHaveLength(0);
  });

  it("skips degenerate cost (<=0 or >=1)", () => {
    expect(paperPnl([row({ feeAdjustedCost: 0 })], 10_000).rows).toHaveLength(0);
    expect(paperPnl([row({ feeAdjustedCost: 1 })], 10_000).rows).toHaveLength(0);
  });

  it("aggregates wins/losses and totals across multiple rows", () => {
    const res = paperPnl(
      [row({ ticker: "A", outcome: 1 }), row({ ticker: "B", outcome: 0 })],
      10_000,
    );
    expect(res.wins).toBe(1);
    expect(res.losses).toBe(1);
    expect(res.totalStakedUsd).toBeCloseTo(600, 9);
  });
});
