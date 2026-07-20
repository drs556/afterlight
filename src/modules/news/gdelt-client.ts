import { z } from "zod";
import type { NewsClient, NewsItem, NewsSearchParams } from "./types";

const gdeltResponseSchema = z.object({
  articles: z
    .array(
      z.object({
        url: z.string(),
        title: z.string(),
        domain: z.string().optional(),
        seendate: z.string().optional(), // e.g. 20260715T120000Z
      }),
    )
    .optional()
    .default([]),
});

/** GDELT 2.0 free backstop (docs/03 §2.2). No API key; rate-limit friendly. */
export class GdeltNewsClient implements NewsClient {
  readonly name = "gdelt";

  async search({ query, before, maxResults = 10 }: NewsSearchParams): Promise<NewsItem[]> {
    const url =
      "https://api.gdeltproject.org/api/v2/doc/doc?" +
      new URLSearchParams({
        query,
        mode: "artlist",
        format: "json",
        maxrecords: String(maxResults),
        sort: "datedesc",
      });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GDELT search failed: ${res.status}`);

    const parsed = gdeltResponseSchema.parse(await res.json());
    return parsed.articles
      .map((a): NewsItem => ({
        url: a.url,
        source: a.domain ?? null,
        headline: a.title,
        publishedAt: a.seendate ? parseGdeltDate(a.seendate) : null,
        snippet: null,
        raw: a,
      }))
      .filter((item) => !item.publishedAt || item.publishedAt < before);
  }
}

function parseGdeltDate(s: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}
