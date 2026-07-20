import { describe, it, expect } from "vitest";
import { assessmentOutputSchema } from "@/modules/llm/schema";
import { assessmentCostUsd } from "@/modules/llm/cost";
import { FixtureLlmClient } from "@/modules/llm/fixture-client";

describe("llm assessment", () => {
  it("cost model: $3/$15 per Mtok", () => {
    expect(assessmentCostUsd(1_000_000, 0)).toBeCloseTo(3, 9);
    expect(assessmentCostUsd(0, 1_000_000)).toBeCloseTo(15, 9);
  });

  it("fixture client returns schema-valid output anchored near the price", async () => {
    const client = new FixtureLlmClient();
    const a = await client.assess({
      title: "Will the Fed raise rates in July?",
      rulesSummary: "Resolves YES if the FOMC raises rates.",
      resolutionSource: null,
      closeTime: null,
      marketPriceYes: 0.13,
      today: "2026-07-20",
      news: [],
    });
    expect(assessmentOutputSchema.safeParse(a.output).success).toBe(true);
    expect(a.output.p_yes).toBeCloseTo(0.13, 6);
    expect(a.output.p_low).toBeLessThan(a.output.p_yes);
    expect(a.output.p_high).toBeGreaterThan(a.output.p_yes);
  });

  it("fixture narrows the band when 3+ news items are present", async () => {
    const client = new FixtureLlmClient();
    const withNews = await client.assess({
      title: "X", rulesSummary: null, resolutionSource: null, closeTime: null,
      marketPriceYes: 0.5, today: "2026-07-20",
      news: [1, 2, 3].map((id) => ({ id, source: null, headline: `h${id}`, publishedAt: null, snippet: null })),
    });
    const band = withNews.output.p_high - withNews.output.p_low;
    expect(band).toBeLessThanOrEqual(0.13);
  });
});
