import { describe, it, expect } from "vitest";
import { filterRelevant, relevanceScore } from "@/modules/news/relevance";
import type { NewsItem } from "@/modules/news/types";

function item(headline: string, snippet = ""): NewsItem {
  return { url: `https://x/${headline}`, source: null, headline, publishedAt: null, snippet, raw: null };
}

describe("news relevance", () => {
  it("scores keyword overlap between market text and item", () => {
    const s = relevanceScore("Fed raise rates July", item("Fed signals it will hold rates in July"));
    expect(s).toBeGreaterThan(0);
  });

  it("drops off-topic items and reports the drop rate", () => {
    const res = filterRelevant("Fed raise rates July meeting", [
      item("Fed signals it will hold rates steady at July meeting"),
      item("Best summer pasta recipe"),
    ]);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toBe(1);
    expect(res.dropRate).toBeCloseTo(0.5, 12);
  });
});
