import type { NewsItem } from "./types";

const STOPWORDS = new Set([
  "will", "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "be",
  "is", "are", "at", "by", "with", "above", "below", "than", "this", "that",
]);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Fraction of market keywords present in the item's headline+snippet, in [0,1]. */
export function relevanceScore(marketText: string, item: NewsItem): number {
  const marketKw = keywords(marketText);
  if (marketKw.size === 0) return 0;
  const itemKw = keywords(`${item.headline} ${item.snippet ?? ""}`);
  let hits = 0;
  for (const k of marketKw) if (itemKw.has(k)) hits++;
  return hits / marketKw.size;
}

export interface RelevanceResult {
  kept: { item: NewsItem; score: number }[];
  dropped: number;
  dropRate: number;
}

/**
 * Cheap lexical relevance filter before the LLM (docs/03 §6.3). Drops items
 * below threshold and reports the drop rate for per-run logging.
 */
export function filterRelevant(
  marketText: string,
  items: NewsItem[],
  threshold = 0.15,
): RelevanceResult {
  const scored = items.map((item) => ({ item, score: relevanceScore(marketText, item) }));
  const kept = scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);
  const dropped = scored.length - kept.length;
  return {
    kept,
    dropped,
    dropRate: scored.length === 0 ? 0 : dropped / scored.length,
  };
}
