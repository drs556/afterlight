import { describe, it, expect } from "vitest";
import { FixtureKalshiClient } from "@/modules/kalshi/fixture-client";

const client = new FixtureKalshiClient();

describe("FixtureKalshiClient", () => {
  it("returns active markets across categories for status=open", async () => {
    const page = await client.listMarkets({ status: "open" });
    const tickers = page.markets.map((m) => m.ticker);
    expect(tickers).toContain("USPREZ-24-DEM");
    expect(tickers).toContain("FED-26JUL-HIKE");
    expect(tickers).toContain("BTC-26-100K"); // crypto included here; excluded later in ingest
    expect(page.cursor).toBeNull();
  });

  it("tags the crypto market so ingest can exclude it by category", async () => {
    const page = await client.listMarkets({ status: "open" });
    const btc = page.markets.find((m) => m.ticker === "BTC-26-100K");
    expect(btc?.category?.toLowerCase()).toBe("crypto");
  });

  it("returns settled markets with a yes/no result for status=settled", async () => {
    const page = await client.listMarkets({ status: "settled" });
    expect(page.markets).toHaveLength(1);
    expect(page.markets[0]?.ticker).toBe("CPI-26JUN-ABOVE3");
    expect(page.markets[0]?.result).toBe("no");
  });
});
