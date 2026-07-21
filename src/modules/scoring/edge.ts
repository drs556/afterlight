import { feePerContract } from "./fees";

// Fee-adjusted cost, net edge, and automatic direction choice (docs/04 §6.2).

export type Direction = "yes" | "no";

export interface EdgeInputs {
  pModel: number; // [0,1]
  yesBid: number; // [0,1]
  yesAsk: number; // [0,1]
  exitFriction: number; // reserve for early-exit spread cost (config, default 0.01)
}

export interface EdgeResult {
  direction: Direction;
  netEdge: number;
  /** Fee-adjusted entry cost of the chosen direction, [0,1]. */
  entryCost: number;
  cAdjYes: number;
  cAdjNo: number;
  /** p(win) for the chosen direction — feeds Kelly sizing. */
  pWin: number;
}

/**
 * Effective entry cost buying YES at the ask, or NO at (1 − bid), each with its
 * per-contract fee and an exit-friction reserve. Net edge is the better of the
 * two directions; direction = argmax (docs/04 §6.2).
 */
export function computeEdge(inputs: EdgeInputs): EdgeResult {
  const { pModel, yesBid, yesAsk, exitFriction } = inputs;

  const cAdjYes = yesAsk + feePerContract(yesAsk) + exitFriction;
  const noPrice = 1 - yesBid;
  const cAdjNo = noPrice + feePerContract(noPrice) + exitFriction;

  const edgeYes = pModel - cAdjYes;
  const edgeNo = 1 - pModel - cAdjNo;

  if (edgeYes >= edgeNo) {
    return { direction: "yes", netEdge: edgeYes, entryCost: cAdjYes, cAdjYes, cAdjNo, pWin: pModel };
  }
  return { direction: "no", netEdge: edgeNo, entryCost: cAdjNo, cAdjYes, cAdjNo, pWin: 1 - pModel };
}

/**
 * Actionability threshold in probability points (docs/04 §3.4, §6.2): the base
 * 5pp, raised to 8pp for cheap-longshot entries (chosen-direction cost < 10¢).
 */
export function edgeThreshold(entryCost: number, baseMin: number, longshotMin: number): number {
  return entryCost < 0.1 ? longshotMin : baseMin;
}
