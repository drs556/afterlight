// Pure staleness rules for the run ledger — no I/O, so they unit-test
// trivially (docs/02 §3).

/**
 * A run still marked `running` after this long was killed by the platform
 * before `withRun` could record an outcome: a serverless timeout leaves no
 * catch block to run, so the row is never closed. Past this age the row is
 * treated as stale rather than live.
 *
 * Comfortably above the longest route budget (maxDuration 300s) so a genuinely
 * slow run is never mistaken for a dead one.
 */
export const STALE_RUN_MS = 15 * 60 * 1000;

/**
 * True when a `running` row is old enough to be an orphan rather than a live
 * job. Without this an orphaned run disables "Run now" permanently — an ingest
 * run killed on 2026-07-23 blocked the button until it was cleared by hand.
 */
export function isRunStale(startedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - startedAt.getTime() >= STALE_RUN_MS;
}
