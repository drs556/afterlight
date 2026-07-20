import type { NewsClient, NewsItem, NewsSearchParams } from "./types";
import { fixtureNews } from "./fixtures/data";

/**
 * Fixture news client — zero external calls (docs/03 §6.5). Matches fixtures by
 * whether the query text overlaps a known ticker's items; falls back to all.
 */
export class FixtureNewsClient implements NewsClient {
  readonly name = "fixture";

  async search({ query, before, maxResults = 10 }: NewsSearchParams): Promise<NewsItem[]> {
    const q = query.toLowerCase();
    let pool = Object.entries(fixtureNews).find(([ticker]) =>
      q.includes(ticker.toLowerCase()),
    )?.[1];
    // Fall back to keyword hit across all fixtures.
    if (!pool) {
      pool = Object.values(fixtureNews)
        .flat()
        .filter((i) => q.split(/\s+/).some((w) => w.length > 3 && i.headline.toLowerCase().includes(w)));
    }

    return (pool ?? [])
      .map((i): NewsItem => ({
        url: i.url,
        source: i.source,
        headline: i.headline,
        publishedAt: new Date(i.publishedAt),
        snippet: i.snippet,
        raw: i,
      }))
      .filter((item) => !item.publishedAt || item.publishedAt < before)
      .slice(0, maxResults);
  }
}
