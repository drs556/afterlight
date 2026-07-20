import type { NewsItem } from "./types";

/** Strip protocol, www, query string and trailing slash for canonical matching. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Token-overlap (Jaccard) similarity of two titles, in [0,1]. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Dedup by canonical URL, then by title similarity ≥ threshold (docs/03 §6.2).
 * Keeps the earliest-published item in each collapsed group.
 */
export function dedupeNews(items: NewsItem[], simThreshold = 0.85): NewsItem[] {
  const byUrl = new Map<string, NewsItem>();
  for (const item of items) {
    const key = canonicalUrl(item.url);
    const existing = byUrl.get(key);
    if (!existing || earlier(item, existing)) byUrl.set(key, item);
  }

  const kept: NewsItem[] = [];
  for (const item of byUrl.values()) {
    const dupIdx = kept.findIndex((k) => titleSimilarity(k.headline, item.headline) >= simThreshold);
    if (dupIdx === -1) {
      kept.push(item);
    } else if (earlier(item, kept[dupIdx]!)) {
      kept[dupIdx] = item;
    }
  }
  return kept;
}

function earlier(a: NewsItem, b: NewsItem): boolean {
  const ta = a.publishedAt?.getTime() ?? Infinity;
  const tb = b.publishedAt?.getTime() ?? Infinity;
  return ta < tb;
}
