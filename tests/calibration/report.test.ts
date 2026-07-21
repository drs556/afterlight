import { describe, it, expect } from "vitest";
import { computeCalibrationReport, RESOLVED_PREDICTIONS_TARGET, type ResolvedRow } from "@/modules/calibration";

function row(over: Partial<ResolvedRow> = {}): ResolvedRow {
  return {
    ticker: "T",
    category: "Politics",
    confidenceTier: "High",
    pModel: 0.7,
    pMarket: 0.6,
    netEdge: 0.05,
    actionable: true,
    direction: "yes",
    feeAdjustedCost: 0.6,
    kellyUsed: 0.03,
    outcome: 1,
    ...over,
  };
}

describe("computeCalibrationReport (M3/M4 acceptance: hand-computed end to end)", () => {
  it("reproduces Brier ours vs market and flags beating the baseline", () => {
    // ours: (0.7-1)^2=0.09 ; market: (0.6-1)^2=0.16 → ours beats market
    const report = computeCalibrationReport([row()], 10_000);
    expect(report.n).toBe(1);
    expect(report.brierOurs).toBeCloseTo(0.09, 12);
    expect(report.brierMarket).toBeCloseTo(0.16, 12);
    expect(report.beatsBaseline).toBe(true);
  });

  it("progress toward the 200-prediction target is capped at 1", () => {
    const empty = computeCalibrationReport([], 10_000);
    expect(empty.progressToTarget).toBe(0);

    const many = Array.from({ length: RESOLVED_PREDICTIONS_TARGET + 50 }, () => row());
    expect(computeCalibrationReport(many, 10_000).progressToTarget).toBe(1);

    const half = Array.from({ length: 100 }, () => row());
    expect(computeCalibrationReport(half, 10_000).progressToTarget).toBeCloseTo(0.5, 12);
  });

  it("empty input never throws and reports n=0", () => {
    const report = computeCalibrationReport([], 10_000);
    expect(report.n).toBe(0);
    expect(report.beatsBaseline).toBe(false);
    expect(report.calibrationOurs).toHaveLength(10);
    expect(report.paperPnl.rows).toHaveLength(0);
  });

  it("carries paper PnL through end to end (hand-computed)", () => {
    // c=0.6, win → profit = stake * (0.4/0.6); stake = 0.03*10000 = 300
    const report = computeCalibrationReport([row()], 10_000);
    expect(report.paperPnl.totalPnlUsd).toBeCloseTo(300 * (0.4 / 0.6), 9);
  });

  it("slices sum to the same n as the headline count", () => {
    const rows = [row({ category: "Politics" }), row({ category: "Economics", outcome: 0 })];
    const report = computeCalibrationReport(rows, 10_000);
    const total = report.byCategory.reduce((s, c) => s + c.n, 0);
    expect(total).toBe(report.n);
  });
});
