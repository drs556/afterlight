// Pure math helpers for the scoring pipeline (docs/04 §2).
// No I/O — trivially unit-testable, per docs/02 §3.

/** Clamp a probability into [0.01, 0.99] before taking a logit. */
export function clampProb(p: number): number {
  return Math.min(0.99, Math.max(0.01, p));
}

/** logit(x) = ln(x / (1 - x)); input clamped to [0.01, 0.99]. */
export function logit(p: number): number {
  const x = clampProb(p);
  return Math.log(x / (1 - x));
}

/** Inverse logit. */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}
