// News retrieval domain types and the client interface. The enrich job depends
// only on this interface, so Tavily / GDELT / fixtures are interchangeable
// (docs/03 §2, §6.5).

export interface NewsItem {
  url: string;
  source: string | null;
  headline: string;
  publishedAt: Date | null;
  snippet: string | null;
  raw: unknown;
}

export interface NewsSearchParams {
  query: string;
  /** Only return items published strictly before this instant (no lookahead — docs/03 §6.4). */
  before: Date;
  maxResults?: number;
}

export interface NewsClient {
  readonly name: string;
  search(params: NewsSearchParams): Promise<NewsItem[]>;
}
