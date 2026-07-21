import { describe, it, expect } from "vitest";
import { kelly, applyClusterCap, PER_POSITION_CAP, CLUSTER_CAP } from "@/modules/scoring/kelly";

describe("Kelly sizing", () => {
  it("full Kelly = (p−c)/(1−c), fractional ×0.15 (hand-computed)", () => {
    // p=0.70, c=0.55 → f* = 0.15/0.45 = 0.33333; ×0.15 = 0.05 → over 3% cap
    const r = kelly(0.7, 0.55);
    expect(r.full).toBeCloseTo(1 / 3, 12);
    expect(r.used).toBe(PER_POSITION_CAP);
    expect(r.cappedReason).toBe("3% per-position cap");
  });

  it("stays uncapped when fractional Kelly is below 3%", () => {
    // p=0.56, c=0.55 → f* = 0.01/0.45 = 0.02222; ×0.15 = 0.003333
    const r = kelly(0.56, 0.55);
    expect(r.full).toBeCloseTo(0.01 / 0.45, 12);
    expect(r.used).toBeCloseTo(0.15 * (0.01 / 0.45), 12);
    expect(r.cappedReason).toBeNull();
  });

  it("returns zero size for non-positive edge", () => {
    expect(kelly(0.5, 0.55).used).toBe(0);
    expect(kelly(0.5, 0.55).cappedReason).toBeNull();
  });

  it("guards a degenerate cost of 1", () => {
    expect(kelly(0.9, 1).full).toBe(0);
  });

  it("scales a cluster down to the 8% aggregate cap", () => {
    // three positions at the 3% cap sum to 9% → scaled to 8% total
    const scaled = applyClusterCap([
      { used: 0.03, cappedReason: "3% per-position cap" },
      { used: 0.03, cappedReason: "3% per-position cap" },
      { used: 0.03, cappedReason: "3% per-position cap" },
    ]);
    const total = scaled.reduce((s, p) => s + p.used, 0);
    expect(total).toBeCloseTo(CLUSTER_CAP, 12);
    expect(scaled[0]!.cappedReason).toBe("8% event-cluster cap");
  });

  it("leaves a cluster under the cap untouched", () => {
    const positions = [
      { used: 0.02, cappedReason: null },
      { used: 0.03, cappedReason: "3% per-position cap" },
    ];
    expect(applyClusterCap(positions)).toEqual(positions);
  });
});
