import { describe, it, expect } from "vitest";
import { scoreMarket, type ScoreInputs } from "@/modules/scoring";

const thresholds = { net_edge_min: 0.05, net_edge_min_longshot: 0.08, exit_friction: 0.01 };
const weights = { w_mkt: 0.55, w_llm: 0.3, w_base: 0.15 };

function inputs(over: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    yesBid: 0.44,
    yesAsk: 0.48,
    pLlm: 0.6,
    pLlmLow: 0.54,
    pLlmHigh: 0.66,
    pBase: null,
    weights,
    thresholds,
    newsCount: 3,
    snapshotAgeHours: 1,
    ...over,
  };
}

describe("scoreMarket (end to end)", () => {
  it("produces a shrunk model estimate and a fee-adjusted edge", () => {
    const r = scoreMarket(inputs());
    expect(r.pMarket).toBeCloseTo(0.46, 12);
    // model sits between the market (0.46) and the LLM (0.60)
    expect(r.pModel).toBeGreaterThan(0.46);
    expect(r.pModel).toBeLessThan(0.6);
    expect(r.pModelLow).toBeLessThan(r.pModel);
    expect(r.pModelHigh).toBeGreaterThan(r.pModel);
  });

  it("marks a clear, confident divergence actionable", () => {
    // Strong LLM lean with a tight band and cheap YES relative to model.
    const r = scoreMarket(
      inputs({ yesBid: 0.4, yesAsk: 0.42, pLlm: 0.75, pLlmLow: 0.72, pLlmHigh: 0.78 }),
    );
    expect(r.direction).toBe("yes");
    expect(r.netEdge).toBeGreaterThan(0.05);
    expect(r.confidenceTier).not.toBe("Low");
    expect(r.actionable).toBe(true);
  });

  it("is never actionable at Low confidence even with edge", () => {
    // Wide band → Low tier → not actionable regardless of edge.
    const r = scoreMarket(
      inputs({ pLlm: 0.9, pLlmLow: 0.5, pLlmHigh: 0.99, snapshotAgeHours: 20 }),
    );
    expect(r.confidenceTier).toBe("Low");
    expect(r.actionable).toBe(false);
  });

  it("keeps a below-threshold row scored but not actionable", () => {
    // LLM agrees with the market → tiny/negative edge after fees.
    const r = scoreMarket(inputs({ pLlm: 0.46, pLlmLow: 0.44, pLlmHigh: 0.48 }));
    expect(r.actionable).toBe(false);
    expect(Number.isFinite(r.rankingScore)).toBe(true);
  });
});
