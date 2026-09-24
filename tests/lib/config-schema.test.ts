import { describe, it, expect } from "vitest";
import { applyThresholdsPatch, thresholdsSchema } from "@/lib/config-schema";

// Shape of config_versions row 11 in production (2026-07-24), which predates
// every ingest_*/enrich_* field added by the category-scope funnel.
const row11 = {
  max_spread: 0.08,
  min_volume: 500,
  bankroll_usd: 10000,
  enrich_top_k: 40,
  net_edge_min: 0.05,
  exit_friction: 0.01,
  max_days_to_close: 540,
  enrich_max_seconds: 240,
  excluded_categories: ["Crypto", "Politics"],
  llm_daily_budget_usd: 10,
  net_edge_min_longshot: 0.08,
};

describe("thresholdsSchema", () => {
  it("parses a pre-funnel row and fills the new fields with their defaults", () => {
    const t = thresholdsSchema.parse(row11);
    expect(t.ingest_min_volume).toBe(500);
    expect(t.enrich_categories).toEqual(["Politics", "Economics"]);
    expect(t.enrich_max_per_event).toBe(2);
    expect(t.enrich_concurrency).toBe(4);
    expect(t.max_days_to_close).toBe(540);
  });

  it("bounds enrich_concurrency to integers 1..8", () => {
    for (const bad of [0, 9, 2.5]) {
      expect(thresholdsSchema.safeParse({ ...row11, enrich_concurrency: bad }).success).toBe(false);
    }
    expect(thresholdsSchema.safeParse({ ...row11, enrich_concurrency: 8 }).success).toBe(true);
  });

  it("requires at least one market per event", () => {
    expect(thresholdsSchema.safeParse({ ...row11, enrich_max_per_event: 0 }).success).toBe(false);
  });
});

describe("applyThresholdsPatch", () => {
  const current = thresholdsSchema.parse(row11);

  it("carries forward every field the patch does not mention", () => {
    // The Settings form used to rewrite only its own fields, silently resetting
    // max_days_to_close from 540 to the default 90 on every save.
    const next = applyThresholdsPatch(current, { min_volume: 800 });
    expect(next.min_volume).toBe(800);
    expect(next.max_days_to_close).toBe(540);
    expect(next.excluded_categories).toEqual(["Crypto", "Politics"]);
  });

  it("replaces arrays wholesale rather than merging them", () => {
    const next = applyThresholdsPatch(current, { excluded_categories: ["Crypto"] });
    expect(next.excluded_categories).toEqual(["Crypto"]);
  });

  it("rejects unknown field names so a typo cannot silently no-op", () => {
    expect(() => applyThresholdsPatch(current, { enrich_categoreis: ["Politics"] })).toThrow(
      /enrich_categoreis/,
    );
  });

  it("validates the merged result", () => {
    expect(() => applyThresholdsPatch(current, { enrich_concurrency: 20 })).toThrow();
  });
});
