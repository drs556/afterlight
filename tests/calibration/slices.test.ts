import { describe, it, expect } from "vitest";
import { sliceByCategory, sliceByConfidenceTier, type SliceRow } from "@/modules/calibration/slices";

function row(over: Partial<SliceRow> = {}): SliceRow {
  return {
    category: "Politics",
    confidenceTier: "High",
    pModel: 0.7,
    pMarket: 0.6,
    netEdge: 0.1,
    outcome: 1,
    ...over,
  };
}

describe("slices", () => {
  it("groups by category and computes per-group Brier", () => {
    const rows = [row({ category: "Politics" }), row({ category: "Economics", pModel: 0.4, outcome: 0 })];
    const slices = sliceByCategory(rows);
    expect(slices.map((s) => s.key).sort()).toEqual(["Economics", "Politics"]);
    const econ = slices.find((s) => s.key === "Economics")!;
    expect(econ.brierOurs).toBeCloseTo(0.16, 12); // (0.4-0)^2
  });

  it("buckets null category as Uncategorized", () => {
    const slices = sliceByCategory([row({ category: null })]);
    expect(slices[0]!.key).toBe("Uncategorized");
  });

  it("orders confidence tiers High, Medium, Low", () => {
    const rows = [
      row({ confidenceTier: "Low" }),
      row({ confidenceTier: "High" }),
      row({ confidenceTier: "Medium" }),
    ];
    const slices = sliceByConfidenceTier(rows);
    expect(slices.map((s) => s.key)).toEqual(["High", "Medium", "Low"]);
  });

  it("mean net edge is the average across the slice", () => {
    const slices = sliceByCategory([
      row({ netEdge: 0.1 }),
      row({ netEdge: 0.3 }),
    ]);
    expect(slices[0]!.meanNetEdge).toBeCloseTo(0.2, 12);
  });
});
