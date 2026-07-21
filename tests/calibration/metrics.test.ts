import { describe, it, expect } from "vitest";
import { brierScore, meanBrier, logLoss, meanLogLoss } from "@/modules/calibration/metrics";

describe("Brier score", () => {
  it("is 0 for a perfect prediction", () => {
    expect(brierScore(1, 1)).toBe(0);
    expect(brierScore(0, 0)).toBe(0);
  });

  it("is 1 for a maximally wrong prediction", () => {
    expect(brierScore(1, 0)).toBe(1);
    expect(brierScore(0, 1)).toBe(1);
  });

  it("hand-computed: p=0.7 outcome=1 → 0.09", () => {
    expect(brierScore(0.7, 1)).toBeCloseTo(0.09, 12);
  });

  it("mean over a small set (hand-computed)", () => {
    // (0.7,1)->0.09, (0.3,0)->0.09, (0.9,0)->0.81 → mean = 0.99/3 = 0.33
    const m = meanBrier([
      { p: 0.7, outcome: 1 },
      { p: 0.3, outcome: 0 },
      { p: 0.9, outcome: 0 },
    ]);
    expect(m).toBeCloseTo(0.33, 12);
  });

  it("is NaN for an empty set", () => {
    expect(meanBrier([])).toBeNaN();
  });
});

describe("log loss", () => {
  it("hand-computed: p=0.8 outcome=1 → -ln(0.8)", () => {
    expect(logLoss(0.8, 1)).toBeCloseTo(-Math.log(0.8), 12);
  });

  it("hand-computed: p=0.2 outcome=0 → -ln(0.8)", () => {
    expect(logLoss(0.2, 0)).toBeCloseTo(-Math.log(0.8), 12);
  });

  it("clamps extreme probabilities so it never returns Infinity", () => {
    expect(Number.isFinite(logLoss(1, 0))).toBe(true);
    expect(Number.isFinite(logLoss(0, 1))).toBe(true);
  });

  it("mean is NaN for an empty set", () => {
    expect(meanLogLoss([])).toBeNaN();
  });

  it("mean over a small set", () => {
    const m = meanLogLoss([
      { p: 0.8, outcome: 1 },
      { p: 0.2, outcome: 0 },
    ]);
    expect(m).toBeCloseTo(-Math.log(0.8), 12);
  });
});
