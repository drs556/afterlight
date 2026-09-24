import { describe, it, expect } from "vitest";
import { classifyForIngest } from "@/modules/kalshi/ingest-filter";

// runIngest lower-cases excluded_categories before building this set.
const opts = { excluded: new Set(["crypto", "financials"]), minVolume: 500 };

describe("classifyForIngest", () => {
  it("stores a liquid market in an included category", () => {
    expect(classifyForIngest({ category: "Politics", volume: 1200 }, opts)).toBe("store");
  });

  it("stores a market exactly at the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: 500 }, opts)).toBe("store");
  });

  it("drops a market below the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: 499 }, opts)).toBe("below_floor");
  });

  it("treats unknown volume as below the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: null }, opts)).toBe("below_floor");
  });

  it("matches excluded categories case-insensitively", () => {
    expect(classifyForIngest({ category: "Crypto", volume: 500_000 }, opts)).toBe("excluded");
    expect(classifyForIngest({ category: "FINANCIALS", volume: 900 }, opts)).toBe("excluded");
  });

  it("reports exclusion ahead of the floor, so the two skip counts don't overlap", () => {
    expect(classifyForIngest({ category: "Crypto", volume: 3 }, opts)).toBe("excluded");
  });

  it("never excludes an uncategorized market by category", () => {
    expect(classifyForIngest({ category: null, volume: 900 }, opts)).toBe("store");
  });
});
