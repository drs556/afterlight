import { describe, it, expect } from "vitest";
import { blend, signalBreakdown, type Weights } from "@/modules/scoring/blend";

const W: Weights = { w_mkt: 0.55, w_llm: 0.3, w_base: 0.15 };

describe("log-odds blend", () => {
  it("with no base, shrinks the LLM view toward the market (hand-computed)", () => {
    // pMarket=0.5 (sMkt=0), pLlm=0.6. Renormalized w_llm=0.3/0.85.
    // L = (0.3/0.85)·logit(0.6) = 0.352941·0.405465 = 0.143105
    // p_model = sigmoid(0.143105) = 0.53572
    const r = blend(
      { pMarket: 0.5, pLlm: 0.6, pLlmLow: 0.55, pLlmHigh: 0.65, pBase: null },
      W,
    );
    expect(r.pModel).toBeCloseTo(0.53572, 4);
    // Bounded distance from the market despite a 0.6 LLM view (humility).
    expect(r.pModel).toBeLessThan(0.6);
    expect(r.pModel).toBeGreaterThan(0.5);
  });

  it("propagates the interval: low < model < high", () => {
    const r = blend(
      { pMarket: 0.5, pLlm: 0.6, pLlmLow: 0.55, pLlmHigh: 0.65, pBase: null },
      W,
    );
    expect(r.pModelLow).toBeLessThan(r.pModel);
    expect(r.pModelHigh).toBeGreaterThan(r.pModel);
  });

  it("includes the base rate when present (renormalizes over all three)", () => {
    const withBase = blend(
      { pMarket: 0.5, pLlm: 0.6, pLlmLow: 0.6, pLlmHigh: 0.6, pBase: 0.5 },
      W,
    );
    // base at 0.5 (sBase=0) pulls the estimate back toward the market vs no base.
    const noBase = blend(
      { pMarket: 0.5, pLlm: 0.6, pLlmLow: 0.6, pLlmHigh: 0.6, pBase: null },
      W,
    );
    expect(withBase.pModel).toBeLessThan(noBase.pModel);
  });

  it("falls back to even odds if all weights are zero (guard)", () => {
    const r = blend(
      { pMarket: 0.3, pLlm: 0.8, pLlmLow: 0.8, pLlmHigh: 0.8, pBase: 0.5 },
      { w_mkt: 0, w_llm: 0, w_base: 0 },
    );
    expect(r.pModel).toBeCloseTo(0.5, 12);
  });

  it("returns the market when the LLM agrees with it", () => {
    const r = blend(
      { pMarket: 0.5, pLlm: 0.5, pLlmLow: 0.5, pLlmHigh: 0.5, pBase: null },
      W,
    );
    expect(r.pModel).toBeCloseTo(0.5, 12);
  });
});

describe("signalBreakdown", () => {
  it("renormalizes weights and sums contributions to the blended log-odds", () => {
    const rows = signalBreakdown({ pMarket: 0.5, pLlm: 0.6, pBase: null }, W);
    expect(rows).toHaveLength(2);
    // weights renormalize over the two present signals
    expect(rows[0]!.weight + rows[1]!.weight).toBeCloseTo(1, 12);
    // market prior at 0.5 has zero log-odds, so zero contribution
    expect(rows[0]!.contribution).toBeCloseTo(0, 12);
    // sum of contributions = blended log-odds (matches blend's sigmoid input)
    const total = rows.reduce((s, r) => s + r.contribution, 0);
    expect(total).toBeCloseTo(0.143105, 4);
  });

  it("includes the base-rate signal when present", () => {
    const rows = signalBreakdown({ pMarket: 0.5, pLlm: 0.6, pBase: 0.4 }, W);
    expect(rows.map((r) => r.name)).toContain("base rate");
    expect(rows).toHaveLength(3);
  });
});
