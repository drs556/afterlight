// Fractional Kelly sizing with caps (docs/04 §8). Display only — the app never
// trades. Full Kelly for a binary contract at adjusted cost c with win prob p:
//   f* = (p − c) / (1 − c)
// f_used = 0.15 × f*, then caps applied in order with the binding cap named.

export const KELLY_FRACTION = 0.15;
export const PER_POSITION_CAP = 0.03; // 3% of bankroll per position
export const CLUSTER_CAP = 0.08; // 8% aggregate per event cluster

export interface KellyResult {
  full: number; // f*
  used: number; // after fraction + per-position cap
  cappedReason: string | null;
}

/** Full and fractional Kelly with the 3% per-position cap (docs/04 §8). */
export function kelly(pWin: number, cost: number): KellyResult {
  // Guard the degenerate cost (a contract that can't lose costs ~1).
  const full = cost >= 1 ? 0 : (pWin - cost) / (1 - cost);

  if (full <= 0) {
    return { full, used: 0, cappedReason: null };
  }

  const fractional = KELLY_FRACTION * full;
  if (fractional > PER_POSITION_CAP) {
    return { full, used: PER_POSITION_CAP, cappedReason: "3% per-position cap" };
  }
  return { full, used: fractional, cappedReason: null };
}

/**
 * Apply the 8% event-cluster cap across a group of positions sharing an event
 * cluster (docs/04 §8). If their `used` sizes sum above the cap, scale them down
 * proportionally and mark the binding reason. Pure — operates on plain numbers.
 */
export function applyClusterCap<T extends { used: number; cappedReason: string | null }>(
  positions: T[],
): T[] {
  const total = positions.reduce((s, p) => s + p.used, 0);
  if (total <= CLUSTER_CAP || total === 0) return positions;

  const scale = CLUSTER_CAP / total;
  return positions.map((p) => ({
    ...p,
    used: p.used * scale,
    cappedReason: "8% event-cluster cap",
  }));
}
