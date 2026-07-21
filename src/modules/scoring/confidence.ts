// Confidence tier and ranking score (docs/04 §6.3, §7).

export type ConfidenceTier = "High" | "Medium" | "Low";

export interface ConfidenceInputs {
  /** One-sided uncertainty u (docs/04 §6.3). */
  u: number;
  newsCount: number;
  snapshotAgeHours: number;
  spread: number; // [0,1]
}

/**
 * High: u ≤ 0.06 AND ≥3 news AND age ≤ 2h AND spread ≤ 4¢
 * Medium: u ≤ 0.12 AND age ≤ 6h
 * Low: otherwise (never actionable)
 */
export function confidenceTier(i: ConfidenceInputs): ConfidenceTier {
  if (i.u <= 0.06 && i.newsCount >= 3 && i.snapshotAgeHours <= 2 && i.spread <= 0.04) {
    return "High";
  }
  if (i.u <= 0.12 && i.snapshotAgeHours <= 6) {
    return "Medium";
  }
  return "Low";
}

/** One-sided uncertainty: the larger half-width of the model interval. */
export function oneSidedUncertainty(pModel: number, pLow: number, pHigh: number): number {
  return Math.max(pHigh - pModel, pModel - pLow);
}

/** Evidence-weighted edge, a t-statistic-like quantity (docs/04 §6.3). */
export function rankingScore(netEdge: number, u: number): number {
  return netEdge / (u + 0.02);
}
