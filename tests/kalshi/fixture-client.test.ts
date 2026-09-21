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

describe("FixtureKalshiClient.getMarketsByTickers", () => {
  it("looks up settled markets by ticker — the path `settle` drives from our DB", async () => {
    const found = await client.getMarketsByTickers(["CPI-26JUN-ABOVE3"]);
    expect(found).toHaveLength(1);
    expect(found[0]?.result).toBe("no");
  });

  it("finds open markets too, so a still-unresolved candidate is visible", async () => {
    const found = await client.getMarketsByTickers(["USPREZ-24-DEM"]);
    expect(found).toHaveLength(1);
    expect(found[0]?.result).toBeNull();
  });

  it("omits unknown tickers instead of throwing", async () => {
    const found = await client.getMarketsByTickers(["NOPE-DOES-NOT-EXIST"]);
    expect(found).toEqual([]);
  });

  it("returns only what was asked for, across both fixture sources", async () => {
    const found = await client.getMarketsByTickers([
      "CPI-26JUN-ABOVE3",
      "USPREZ-24-DEM",
      "NOPE-DOES-NOT-EXIST",
    ]);
    expect(found.map((m) => m.ticker).sort()).toEqual(["CPI-26JUN-ABOVE3", "USPREZ-24-DEM"]);
  });

  it("handles an empty request without calling out", async () => {
    expect(await client.getMarketsByTickers([])).toEqual([]);
  });
});
