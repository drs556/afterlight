import { describe, it, expect } from "vitest";
import { feesUsd, feePerContract } from "@/modules/scoring/fees";

// Fixtures pinned to Kalshi's published formula: ceil_to_cent(0.07·C·P·(1−P)).
describe("Kalshi fees", () => {
  it("is ~2¢ per contract at 50/50 (blueprint sanity check)", () => {
    // 0.07 × 0.5 × 0.5 = 0.0175 → rounds up to $0.02
    expect(feePerContract(0.5)).toBe(0.02);
  });

  it("rounds up to the next cent", () => {
    // 0.07 × 0.13 × 0.87 = 0.0079... → $0.01
    expect(feePerContract(0.13)).toBe(0.01);
    // 0.07 × 0.9 × 0.1 = 0.0063 → $0.01
    expect(feePerContract(0.9)).toBe(0.01);
  });

  it("is near zero at the extremes but still rounds up to a cent", () => {
    expect(feePerContract(0.99)).toBe(0.01);
    expect(feePerContract(0.01)).toBe(0.01);
  });

  it("scales with contract count (aggregate rounding)", () => {
    // 0.07 × 100 × 0.25 = 1.75 → $1.75
    expect(feesUsd(0.5, 100)).toBe(1.75);
  });

  it("round-trip near 50/50 reproduces the ~4¢ fee sanity check", () => {
    // Entry + exit, each ~2¢ per contract near the middle of the book.
    expect(feePerContract(0.5) + feePerContract(0.5)).toBeCloseTo(0.04, 12);
  });
});
