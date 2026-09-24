// Pure candidate selection for the paid enrich pass (docs/04 §1). No I/O, so
// the rule deciding where LLM money goes is unit-testable with built rows.

/** A market with its latest snapshot and last assessment time, as queried. */
export interface CandidateInput {
  ticker: string;
  eventTicker: string | null;
  category: string | null;
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  snapshotId: number;
  snapshotCapturedAt: Date;
  yesMid: number | null;
  spread: number | null;
  volume: number | null;
  lastAssessedAt: Date | null;
}

/** What one assessment needs. */
export interface Candidate {
  ticker: string;
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  yesMid: number | null;
  snapshotId: number;
}

export interface RankOptions {
  now: Date;
  topK: number;
  maxPerEvent: number;
  /** Case-insensitive allowlist; empty = any category. */
  categories: readonly string[];
  minVolume: number;
  maxSpread: number;
  maxDaysToClose: number;
}

/**
 * A snapshot older than this is not a live price. Ingest runs daily, so 36h
 * allows one late or failed run. Markets that fall below the ingest floor stop
 * being refreshed and age out here instead of being assessed on a stale price.
 */
export const MAX_SNAPSHOT_AGE_HOURS = 36;

/** Too close to close is a news race we lose (docs/04 §1). */
export const MIN_HOURS_TO_CLOSE = 6;

/** Staleness stand-in for never-assessed markets, so they rank first. */
const NEVER_ASSESSED_HOURS = 1e6;

const HOUR_MS = 3_600_000;

export function rankCandidates(
  rows: readonly CandidateInput[],
  opts: RankOptions,
): { candidates: Candidate[]; eligibleUnassessed: number } {
  const nowMs = opts.now.getTime();
  const allowed = new Set(opts.categories.map((c) => c.toLowerCase()));

  const eligible = rows.flatMap((r) => {
    if (allowed.size > 0 && !(r.category && allowed.has(r.category.toLowerCase()))) return [];
    if ((nowMs - r.snapshotCapturedAt.getTime()) / HOUR_MS > MAX_SNAPSHOT_AGE_HOURS) return [];

    const volume = r.volume ?? 0;
    if (volume < opts.minVolume) return [];
    // No two-sided book means no tradeable price: that is where phantom
    // edges come from (docs/04 §10), so an unknown spread fails the gate.
    if (r.spread === null || r.spread > opts.maxSpread) return [];

    const hoursToClose = r.closeTime ? (r.closeTime.getTime() - nowMs) / HOUR_MS : Infinity;
    if (hoursToClose < MIN_HOURS_TO_CLOSE || hoursToClose > opts.maxDaysToClose * 24) return [];

    const daysToClose = hoursToClose / 24;
    const stalenessHours = r.lastAssessedAt
      ? (nowMs - r.lastAssessedAt.getTime()) / HOUR_MS
      : NEVER_ASSESSED_HOURS;
    const score = volume * (1 / (1 + daysToClose)) * (1 + stalenessHours);
    return [{ row: r, score }];
  });

  const eligibleUnassessed = eligible.filter((e) => e.row.lastAssessedAt === null).length;

  eligible.sort(
    (a, b) =>
      b.score - a.score || (a.row.ticker < b.row.ticker ? -1 : a.row.ticker > b.row.ticker ? 1 : 0),
  );

  // One event is often one question at several strike points; cap it so a
  // single ladder cannot take the run's slots.
  const perEvent = new Map<string, number>();
  const candidates: Candidate[] = [];
  for (const { row } of eligible) {
    if (candidates.length >= opts.topK) break;
    const group = row.eventTicker ?? `market:${row.ticker}`;
    const used = perEvent.get(group) ?? 0;
    if (used >= opts.maxPerEvent) continue;
    perEvent.set(group, used + 1);
    candidates.push({
      ticker: row.ticker,
      title: row.title,
      rulesSummary: row.rulesSummary,
      resolutionSource: row.resolutionSource,
      closeTime: row.closeTime,
      yesMid: row.yesMid,
      snapshotId: row.snapshotId,
    });
  }

  return { candidates, eligibleUnassessed };
}
