import { describe, it, expect } from "vitest";
import { runPool } from "@/modules/enrich/pool";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A task that records completion order and the peak number in flight. */
function tracker() {
  let inFlight = 0;
  let peak = 0;
  const done: number[] = [];
  const task = async (n: number) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight--;
    done.push(n);
  };
  return { task, done, peak: () => peak };
}

describe("runPool", () => {
  it("runs every item without exceeding the concurrency limit", async () => {
    const t = tracker();
    const r = await runPool(range(10), 3, () => true, t.task);
    expect([...t.done].sort((a, b) => a - b)).toEqual(range(10));
    expect(t.peak()).toBe(3);
    expect(r).toEqual({ started: 10, stoppedEarly: false });
  });

  it("starts nothing more once shouldStart says no, and lets in-flight work finish", async () => {
    const t = tracker();
    let allowed = 2;
    const r = await runPool(range(10), 2, () => allowed-- > 0, t.task);
    expect(r).toEqual({ started: 2, stoppedEarly: true });
    expect([...t.done].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("never runs wider than the number of items", async () => {
    const t = tracker();
    await runPool(range(2), 8, () => true, t.task);
    expect(t.peak()).toBe(2);
  });

  it("floors fractional concurrency and treats anything below 1 as 1", async () => {
    const a = tracker();
    await runPool(range(6), 2.9, () => true, a.task);
    expect(a.peak()).toBe(2);
    const b = tracker();
    await runPool(range(4), 0, () => true, b.task);
    expect(b.peak()).toBe(1);
  });

  it("does nothing for an empty list and never consults the guard", async () => {
    let asked = 0;
    const r = await runPool(
      [],
      4,
      () => {
        asked++;
        return true;
      },
      async () => {},
    );
    expect(r).toEqual({ started: 0, stoppedEarly: false });
    expect(asked).toBe(0);
  });

  it("rejects with the first task error after in-flight tasks settle", async () => {
    const started: number[] = [];
    let settled = 0;
    const run = runPool(range(10), 2, () => true, async (n) => {
      started.push(n);
      await tick();
      settled++;
      if (n === 0) throw new Error("boom");
    });
    await expect(run).rejects.toThrow("boom");
    expect(started.length).toBeLessThanOrEqual(3);
    expect(settled).toBe(started.length);
  });
});
