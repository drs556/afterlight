import { z } from "zod";
import type { NewsClient, NewsItem, NewsSearchParams } from "./types";

const tavilyResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      content: z.string().optional(),
      published_date: z.string().optional(),
    }),
  ),
});

/**
 * Tavily search client (docs/03 §2.1, chosen default). Read-only HTTP.
 * Exercised only when TAVILY_API_KEY is set; fixtures cover dev/CI.
 */
export class TavilyNewsClient implements NewsClient {
  readonly name = "tavily";
  constructor(private readonly apiKey: string) {}

  async search({ query, before, maxResults = 10 }: NewsSearchParams): Promise<NewsItem[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        topic: "news",
        max_results: maxResults,
        search_depth: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Tavily search failed: ${res.status} ${await res.text()}`);

    const parsed = tavilyResponseSchema.parse(await res.json());
    return parsed.results
      .map((r): NewsItem => {
        const host = safeHost(r.url);
        return {
          url: r.url,
          source: host,
          headline: r.title,
          publishedAt: r.published_date ? new Date(r.published_date) : null,
          snippet: r.content ?? null,
          raw: r,
        };
      })
      .filter((item) => !item.publishedAt || item.publishedAt < before); // no lookahead
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
