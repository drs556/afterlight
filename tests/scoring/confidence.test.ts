import { describe, it, expect } from "vitest";
import {
  confidenceTier,
  oneSidedUncertainty,
  rankingScore,
} from "@/modules/scoring/confidence";

describe("confidence tier", () => {
  const base = { u: 0.05, newsCount: 3, snapshotAgeHours: 1, spread: 0.03 };

  it("High when all four conditions hold", () => {
    expect(confidenceTier(base)).toBe("High");
  });

  it("drops from High to Medium when news is thin", () => {
    expect(confidenceTier({ ...base, newsCount: 2 })).toBe("Medium");
  });

  it("drops to Medium when the snapshot is stale for High but fresh for Medium", () => {
    expect(confidenceTier({ ...base, snapshotAgeHours: 4 })).toBe("Medium");
  });

  it("Low when uncertainty is wide", () => {
    expect(confidenceTier({ ...base, u: 0.2 })).toBe("Low");
  });

  it("Low when the snapshot is stale beyond the Medium window", () => {
    expect(confidenceTier({ ...base, snapshotAgeHours: 10 })).toBe("Low");
  });
});

describe("uncertainty & ranking", () => {
  it("one-sided uncertainty is the larger half-width", () => {
    expect(oneSidedUncertainty(0.5, 0.46, 0.54)).toBeCloseTo(0.04, 12);
    expect(oneSidedUncertainty(0.5, 0.4, 0.53)).toBeCloseTo(0.1, 12);
  });

  it("ranking score = net_edge / (u + 0.02)", () => {
    expect(rankingScore(0.15, 0.03)).toBeCloseTo(3, 12);
  });
});
