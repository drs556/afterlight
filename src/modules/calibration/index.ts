import { meanBrier, meanLogLoss } from "./metrics";
import { calibrationCurve, type CalibrationBin } from "./bins";
import { paperPnl, type PaperPnlInput, type PaperPnlResult } from "./pnl";
import { sliceByCategory, sliceByConfidenceTier, type SliceSummary } from "./slices";

export * from "./metrics";
export * from "./bins";
export * from "./pnl";
export * from "./slices";

export const RESOLVED_PREDICTIONS_TARGET = 200; // docs/00 §5 item 3

export interface ResolvedRow {
  ticker: string;
  category: string | null;
  confidenceTier: string | null;
  pModel: number;
  pMarket: number;
  netEdge: number;
  actionable: boolean;
  direction: "yes" | "no" | null;
  feeAdjustedCost: number | null;
  kellyUsed: number | null;
  outcome: 0 | 1;
}

export interface CalibrationReport {
  n: number;
  progressToTarget: number; // n / RESOLVED_PREDICTIONS_TARGET, capped at 1
  brierOurs: number;
  brierMarket: number;
  logLossOurs: number;
  logLossMarket: number;
  beatsBaseline: boolean; // ours < market (lower Brier is better)
  calibrationOurs: CalibrationBin[];
  calibrationMarket: CalibrationBin[];
  byCategory: SliceSummary[];
  byConfidenceTier: SliceSummary[];
  paperPnl: PaperPnlResult;
}

/**
 * Compute the full Track Record report (docs/04 §9, docs/01 §3.3) from
 * resolved, scored rows. Pure — no I/O, so it's trivially fixture-testable.
 */
export function computeCalibrationReport(rows: ResolvedRow[], bankrollUsd: number): CalibrationReport {
  const ours = rows.map((r) => ({ p: r.pModel, outcome: r.outcome }));
  const market = rows.map((r) => ({ p: r.pMarket, outcome: r.outcome }));

  const brierOurs = meanBrier(ours);
  const brierMarket = meanBrier(market);

  const pnlInputs: PaperPnlInput[] = rows.map((r) => ({
    ticker: r.ticker,
    direction: r.direction,
    feeAdjustedCost: r.feeAdjustedCost,
    kellyUsed: r.kellyUsed,
    actionable: r.actionable,
    outcome: r.outcome,
  }));

  return {
    n: rows.length,
    progressToTarget: Math.min(1, rows.length / RESOLVED_PREDICTIONS_TARGET),
    brierOurs,
    brierMarket,
    logLossOurs: meanLogLoss(ours),
    logLossMarket: meanLogLoss(market),
    beatsBaseline: rows.length > 0 && brierOurs < brierMarket,
    calibrationOurs: calibrationCurve(ours),
    calibrationMarket: calibrationCurve(market),
    byCategory: sliceByCategory(rows),
    byConfidenceTier: sliceByConfidenceTier(rows),
    paperPnl: paperPnl(pnlInputs, bankrollUsd),
  };
}
