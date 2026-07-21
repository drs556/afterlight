import { describe, it, expect } from "vitest";
import { calibrationCurve } from "@/modules/calibration/bins";

describe("calibration curve", () => {
  it("produces 10 bins covering [0,1]", () => {
    const bins = calibrationCurve([]);
    expect(bins).toHaveLength(10);
    expect(bins[0]!.binLow).toBe(0);
    expect(bins[9]!.binHigh).toBe(1);
  });

  it("empty bins report n=0 and NaN stats", () => {
    const bins = calibrationCurve([{ p: 0.05, outcome: 1 }]);
    expect(bins[0]!.n).toBe(1);
    expect(bins[1]!.n).toBe(0);
    expect(bins[1]!.meanPredicted).toBeNaN();
  });

  it("hand-computed: two points in the 0.7-0.8 bin", () => {
    const bins = calibrationCurve([
      { p: 0.71, outcome: 1 },
      { p: 0.79, outcome: 0 },
    ]);
    const bin7 = bins[7]!; // [0.7, 0.8)
    expect(bin7.n).toBe(2);
    expect(bin7.meanPredicted).toBeCloseTo(0.75, 12);
    expect(bin7.realizedFrequency).toBeCloseTo(0.5, 12);
  });

  it("clamps p=1.0 into the last bin (not an 11th bin)", () => {
    const bins = calibrationCurve([{ p: 1.0, outcome: 1 }]);
    expect(bins[9]!.n).toBe(1);
  });

  it("clamps p=0.0 into the first bin", () => {
    const bins = calibrationCurve([{ p: 0.0, outcome: 0 }]);
    expect(bins[0]!.n).toBe(1);
  });
});
