import { describe, it, expect } from "vitest";
import { computeEdge, edgeThreshold } from "@/modules/scoring/edge";

describe("net edge & direction", () => {
  it("chooses YES and computes fee-adjusted cost (hand-computed)", () => {
    // ask=0.52 → fee 0.02, +exit 0.01 → cAdjYes=0.55; edgeYes=0.70−0.55=0.15
    const r = computeEdge({ pModel: 0.7, yesBid: 0.5, yesAsk: 0.52, exitFriction: 0.01 });
    expect(r.direction).toBe("yes");
    expect(r.cAdjYes).toBeCloseTo(0.55, 12);
    expect(r.netEdge).toBeCloseTo(0.15, 12);
    expect(r.entryCost).toBeCloseTo(0.55, 12);
    expect(r.pWin).toBeCloseTo(0.7, 12);
  });

  it("chooses NO when the model is well below the market", () => {
    // pModel=0.2; NO side: noPrice=1−0.5=0.5, fee 0.02, +0.01 → cAdjNo=0.53
    // edgeNo = 0.8 − 0.53 = 0.27
    const r = computeEdge({ pModel: 0.2, yesBid: 0.5, yesAsk: 0.52, exitFriction: 0.01 });
    expect(r.direction).toBe("no");
    expect(r.netEdge).toBeCloseTo(0.27, 12);
    expect(r.pWin).toBeCloseTo(0.8, 12);
  });

  it("applies the 8pp longshot threshold when the entry is cheap (<10¢)", () => {
    expect(edgeThreshold(0.08, 0.05, 0.08)).toBe(0.08);
    expect(edgeThreshold(0.55, 0.05, 0.08)).toBe(0.05);
    expect(edgeThreshold(0.1, 0.05, 0.08)).toBe(0.05); // exactly 10¢ is not a longshot
  });
});
