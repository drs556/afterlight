import { describe, it, expect } from "vitest";
import { clampProb, logit, sigmoid } from "@/modules/scoring/math";

describe("scoring math", () => {
  it("clamps probabilities into [0.01, 0.99]", () => {
    expect(clampProb(0)).toBe(0.01);
    expect(clampProb(1)).toBe(0.99);
    expect(clampProb(0.5)).toBe(0.5);
  });

  it("logit(0.5) is 0", () => {
    expect(logit(0.5)).toBeCloseTo(0, 12);
  });

  it("sigmoid is the inverse of logit", () => {
    for (const p of [0.05, 0.2, 0.5, 0.73, 0.95]) {
      expect(sigmoid(logit(p))).toBeCloseTo(p, 12);
    }
  });
});
