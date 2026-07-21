// Calibration curve: 10 bins of predicted probability vs realized frequency
// (docs/04 §9), computed identically for our p_model and the market's p_market.

export interface CalibrationBin {
  binLow: number; // inclusive lower bound, [0,1)
  binHigh: number; // exclusive upper bound (1.0 on the last bin, inclusive)
  n: number;
  meanPredicted: number; // NaN if n === 0
  realizedFrequency: number; // NaN if n === 0
}

const BIN_COUNT = 10;

/** Bin index in [0, BIN_COUNT-1] for a probability in [0,1]. */
function binIndex(p: number): number {
  const idx = Math.floor(p * BIN_COUNT);
  return Math.min(BIN_COUNT - 1, Math.max(0, idx));
}

/** Build a 10-bin calibration curve from (predicted, outcome) pairs. */
export function calibrationCurve(pairs: { p: number; outcome: 0 | 1 }[]): CalibrationBin[] {
  const buckets: { sumP: number; sumOutcome: number; n: number }[] = Array.from(
    { length: BIN_COUNT },
    () => ({ sumP: 0, sumOutcome: 0, n: 0 }),
  );

  for (const { p, outcome } of pairs) {
    const b = buckets[binIndex(p)]!;
    b.sumP += p;
    b.sumOutcome += outcome;
    b.n += 1;
  }

  return buckets.map((b, i) => ({
    binLow: i / BIN_COUNT,
    binHigh: (i + 1) / BIN_COUNT,
    n: b.n,
    meanPredicted: b.n === 0 ? NaN : b.sumP / b.n,
    realizedFrequency: b.n === 0 ? NaN : b.sumOutcome / b.n,
  }));
}
