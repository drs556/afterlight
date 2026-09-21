import { describe, it, expect } from "vitest";
import { isRunStale, STALE_RUN_MS } from "@/modules/runs/staleness";

const at = (msAgo: number) => new Date(Date.parse("2026-09-21T12:00:00Z") - msAgo);
const now = new Date("2026-09-21T12:00:00Z");

describe("isRunStale", () => {
  it("treats a just-started run as live", () => {
    expect(isRunStale(at(0), now)).toBe(false);
  });

  it("treats a run still inside the longest route budget as live", () => {
    // maxDuration is 300s on ingest/enrich/settle; a run at 299s is healthy.
    expect(isRunStale(at(299_000), now)).toBe(false);
  });

  it("treats a run past the threshold as orphaned", () => {
    expect(isRunStale(at(STALE_RUN_MS + 1), now)).toBe(true);
  });

  it("is inclusive exactly at the threshold", () => {
    expect(isRunStale(at(STALE_RUN_MS), now)).toBe(true);
  });

  it("treats the run orphaned on 2026-07-23 as stale", () => {
    // The concrete case this rule exists for: it blocked ingest's "Run now"
    // for two months because the row stayed `running` forever.
    expect(isRunStale(new Date("2026-07-23T00:36:59Z"), now)).toBe(true);
  });
});

describe("STALE_RUN_MS", () => {
  it("exceeds the longest route maxDuration so a slow run is never killed early", () => {
    expect(STALE_RUN_MS).toBeGreaterThan(300 * 1000);
  });

  it("expires within an hour so an orphan cannot block Run now for long", () => {
    expect(STALE_RUN_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
