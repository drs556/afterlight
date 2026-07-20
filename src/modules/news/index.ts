import { TavilyNewsClient } from "./tavily-client";
import { GdeltNewsClient } from "./gdelt-client";
import { FixtureNewsClient } from "./fixture-client";
import { dedupeNews } from "./dedup";
import { filterRelevant } from "./relevance";
import type { NewsClient, NewsItem } from "./types";

export type { NewsItem, NewsClient } from "./types";

/**
 * Active news clients. Tavily (primary) + GDELT (backstop) when TAVILY_API_KEY
 * is set; otherwise the fixture client for zero-call dev/CI (docs/03 §6.5).
 */
export function getNewsClients(): NewsClient[] {
  const key = process.env.TAVILY_API_KEY;
  if (key) return [new TavilyNewsClient(key), new GdeltNewsClient()];
  return [new FixtureNewsClient()];
}

export function usingNewsFixtures(): boolean {
  return !process.env.TAVILY_API_KEY;
}

export interface RetrievedNews {
  items: { item: NewsItem; score: number }[];
  fetched: number;
  afterDedup: number;
  dropRate: number;
}

/**
 * Retrieve, dedupe and relevance-filter news for one market. `before` enforces
 * clock discipline — no item published after the assessment instant (docs/03 §6.4).
 */
export async function retrieveNews(opts: {
  clients: NewsClient[];
  query: string;
  marketText: string;
  before: Date;
  maxItems?: number;
}): Promise<RetrievedNews> {
  const { clients, query, marketText, before, maxItems = 12 } = opts;

  const gathered: NewsItem[] = [];
  for (const client of clients) {
    try {
      gathered.push(...(await client.search({ query, before })));
    } catch {
      // A source outage must not block enrichment (docs/02 §2).
    }
  }

  const fetched = gathered.length;
  const deduped = dedupeNews(gathered);
  const { kept, dropRate } = filterRelevant(marketText, deduped);

  return {
    items: kept.slice(0, maxItems),
    fetched,
    afterDedup: deduped.length,
    dropRate,
  };
}
