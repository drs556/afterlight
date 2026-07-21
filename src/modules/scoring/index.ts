import { blend, type Weights } from "./blend";
import { computeEdge, edgeThreshold, type Direction } from "./edge";
import { confidenceTier, oneSidedUncertainty, rankingScore, type ConfidenceTier } from "./confidence";
import { kelly } from "./kelly";

export * from "./fees";
export * from "./blend";
export * from "./edge";
export * from "./kelly";
export * from "./confidence";
export { logit, sigmoid, clampProb } from "./math";

export interface ScoreInputs {
  yesBid: number; // [0,1]
  yesAsk: number; // [0,1]
  pLlm: number;
  pLlmLow: number;
  pLlmHigh: number;
  pBase: number | null;
  weights: Weights;
  thresholds: {
    net_edge_min: number;
    net_edge_min_longshot: number;
    exit_friction: number;
  };
  newsCount: number;
  snapshotAgeHours: number;
}

export interface ScoreResult {
  pMarket: number;
  pModel: number;
  pModelLow: number;
  pModelHigh: number;
  direction: Direction;
  netEdge: number;
  entryCost: number;
  feeAdjustedCost: number;
  confidenceTier: ConfidenceTier;
  kellyFull: number;
  kellyUsed: number;
  sizeCappedReason: string | null;
  rankingScore: number;
  actionable: boolean;
}

/**
 * Full per-market score (docs/04 §§3–8), pure and I/O-free. The 8% event-cluster
 * Kelly cap is applied afterward across markets in a cluster (see the score job).
 */
export function scoreMarket(i: ScoreInputs): ScoreResult {
  const pMarket = (i.yesBid + i.yesAsk) / 2;
  const spread = i.yesAsk - i.yesBid;

  const { pModel, pModelLow, pModelHigh } = blend(
    { pMarket, pLlm: i.pLlm, pLlmLow: i.pLlmLow, pLlmHigh: i.pLlmHigh, pBase: i.pBase },
    i.weights,
  );

  const edge = computeEdge({
    pModel,
    yesBid: i.yesBid,
    yesAsk: i.yesAsk,
    exitFriction: i.thresholds.exit_friction,
  });

  const u = oneSidedUncertainty(pModel, pModelLow, pModelHigh);
  const tier = confidenceTier({
    u,
    newsCount: i.newsCount,
    snapshotAgeHours: i.snapshotAgeHours,
    spread,
  });

  const threshold = edgeThreshold(
    edge.entryCost,
    i.thresholds.net_edge_min,
    i.thresholds.net_edge_min_longshot,
  );
  const actionable = edge.netEdge >= threshold && tier !== "Low";

  const k = kelly(edge.pWin, edge.entryCost);

  return {
    pMarket,
    pModel,
    pModelLow,
    pModelHigh,
    direction: edge.direction,
    netEdge: edge.netEdge,
    entryCost: edge.entryCost,
    feeAdjustedCost: edge.entryCost,
    confidenceTier: tier,
    kellyFull: k.full,
    kellyUsed: k.used,
    sizeCappedReason: k.cappedReason,
    rankingScore: rankingScore(edge.netEdge, u),
    actionable,
  };
}
