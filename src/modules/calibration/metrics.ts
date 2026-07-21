// Brier score and log loss (docs/04 §9). Pure, no I/O.

/** Clamp a probability into (0,1) so log() never blows up. */
function clampProb(p: number): number {
  return Math.min(0.999999, Math.max(0.000001, p));
}

/** Brier score of a single prediction: (p − outcome)². outcome ∈ {0,1}. */
export function brierScore(p: number, outcome: 0 | 1): number {
  return (p - outcome) ** 2;
}

/** Mean Brier score over a set of (p, outcome) pairs. NaN if empty (caller decides display). */
export function meanBrier(pairs: { p: number; outcome: 0 | 1 }[]): number {
  if (pairs.length === 0) return NaN;
  return pairs.reduce((s, x) => s + brierScore(x.p, x.outcome), 0) / pairs.length;
}

/** Log loss of a single prediction: −[y·ln(p) + (1−y)·ln(1−p)]. */
export function logLoss(p: number, outcome: 0 | 1): number {
  const pc = clampProb(p);
  return -(outcome === 1 ? Math.log(pc) : Math.log(1 - pc));
}

/** Mean log loss over a set of (p, outcome) pairs. NaN if empty. */
export function meanLogLoss(pairs: { p: number; outcome: 0 | 1 }[]): number {
  if (pairs.length === 0) return NaN;
  return pairs.reduce((s, x) => s + logLoss(x.p, x.outcome), 0) / pairs.length;
}
