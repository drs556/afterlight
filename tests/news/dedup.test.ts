import { describe, it, expect } from "vitest";
import { canonicalUrl, titleSimilarity, dedupeNews } from "@/modules/news/dedup";
import type { NewsItem } from "@/modules/news/types";

function item(url: string, headline: string, iso: string): NewsItem {
  return { url, source: null, headline, publishedAt: new Date(iso), snippet: null, raw: null };
}

describe("news dedup", () => {
  it("canonicalizes urls (drops scheme, www, query, trailing slash)", () => {
    expect(canonicalUrl("https://www.example.com/a/?x=1")).toBe("example.com/a");
    expect(canonicalUrl("http://example.com/a/")).toBe("example.com/a");
  });

  it("scores identical titles as 1 and disjoint as 0", () => {
    expect(titleSimilarity("Fed holds rates", "Fed holds rates")).toBeCloseTo(1, 12);
    expect(titleSimilarity("apple orange", "banana grape")).toBe(0);
  });

  it("collapses url duplicates keeping the earliest", () => {
    const out = dedupeNews([
      item("https://x.com/a?utm=1", "Story", "2026-07-15T10:00:00Z"),
      item("https://www.x.com/a", "Story", "2026-07-15T09:00:00Z"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });

  it("collapses near-duplicate titles above threshold", () => {
    const out = dedupeNews([
      item("https://a.com/1", "Democratic nominee holds narrow polling lead in swing states", "2026-07-15T10:00:00Z"),
      item("https://b.com/2", "Democratic nominee holds narrow polling lead in swing states", "2026-07-15T11:00:00Z"),
    ]);
    expect(out).toHaveLength(1);
  });
});
