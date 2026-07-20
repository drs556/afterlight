// Fixture news keyed by market ticker. Includes near-duplicates (for dedup)
// and off-topic items (for the relevance filter) so both paths are exercised.

interface RawFixtureItem {
  url: string;
  source: string;
  headline: string;
  publishedAt: string;
  snippet: string;
}

export const fixtureNews: Record<string, RawFixtureItem[]> = {
  "USPREZ-24-DEM": [
    {
      url: "https://example.com/poll-democratic-nominee-lead",
      source: "example.com",
      headline: "Democratic nominee holds narrow polling lead in swing states",
      publishedAt: "2026-07-15T09:00:00Z",
      snippet: "New surveys show the Democratic presidential nominee ahead by two points nationally.",
    },
    {
      url: "https://www.example.com/poll-democratic-nominee-lead?utm=1",
      source: "example.com",
      headline: "Democratic nominee holds narrow polling lead in swing states",
      publishedAt: "2026-07-15T10:30:00Z",
      snippet: "Duplicate syndication of the same polling story.",
    },
    {
      url: "https://news.test/recipe-of-the-day",
      source: "news.test",
      headline: "The best summer pasta recipe",
      publishedAt: "2026-07-16T12:00:00Z",
      snippet: "Unrelated lifestyle content that should be filtered out by relevance.",
    },
  ],
  "FED-26JUL-HIKE": [
    {
      url: "https://example.com/fed-holds-rates-signal",
      source: "example.com",
      headline: "Fed signals it will hold rates steady at July meeting",
      publishedAt: "2026-07-14T14:00:00Z",
      snippet: "FOMC members lean toward no change to the target range in July, minutes suggest.",
    },
  ],
};
