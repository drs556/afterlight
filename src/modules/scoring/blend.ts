import { logit, sigmoid } from "./math";

// Log-odds blending that shrinks toward the market price (docs/04 §5).
// Weights default (0.55, 0.30, 0.15); renormalized over the signals present.

export interface Weights {
  w_mkt: number;
  w_llm: number;
  w_base: number;
}

export interface BlendInputs {
  /** Market mid, [0,1]. */
  pMarket: number;
  /** LLM point estimate and interval, [0,1]. */
  pLlm: number;
  pLlmLow: number;
  pLlmHigh: number;
  /** Base rate, [0,1], or null when unavailable (n < 8 — the weight is dropped). */
  pBase: number | null;
}

/** Blend one set of signals in log-odds space, renormalizing present weights. */
function blendLogOdds(
  sMkt: number,
  sLlm: number,
  sBase: number | null,
  w: Weights,
): number {
  const parts: [number, number][] = [
    [w.w_mkt, sMkt],
    [w.w_llm, sLlm],
  ];
  if (sBase !== null) parts.push([w.w_base, sBase]);
  const wsum = parts.reduce((s, [wi]) => s + wi, 0);
  if (wsum === 0) return 0;
  return parts.reduce((s, [wi, xi]) => s + (wi / wsum) * xi, 0);
}

export interface BlendResult {
  pModel: number;
  pModelLow: number;
  pModelHigh: number;
}

/**
 * Produce p_model plus a propagated interval by re-running the blend with the
 * LLM low/high in place of the point estimate (docs/04 §5).
 */
export function blend(inputs: BlendInputs, weights: Weights): BlendResult {
  const sMkt = logit(inputs.pMarket);
  const sBase = inputs.pBase !== null ? logit(inputs.pBase) : null;

  const pModel = sigmoid(blendLogOdds(sMkt, logit(inputs.pLlm), sBase, weights));
  const pModelLow = sigmoid(blendLogOdds(sMkt, logit(inputs.pLlmLow), sBase, weights));
  const pModelHigh = sigmoid(blendLogOdds(sMkt, logit(inputs.pLlmHigh), sBase, weights));

  return { pModel, pModelLow, pModelHigh };
}

export interface SignalContribution {
  name: "market prior" | "LLM / news" | "base rate";
  rawProb: number;
  weight: number; // renormalized over present signals
  logOdds: number; // logit(rawProb)
  contribution: number; // (weight) × logOdds, summed = blended log-odds
}

/** Per-signal renormalized weight and log-odds contribution (docs/01 §3.2). No black boxes. */
export function signalBreakdown(
  inputs: { pMarket: number; pLlm: number; pBase: number | null },
  weights: Weights,
): SignalContribution[] {
  const present: { name: SignalContribution["name"]; raw: number; w: number }[] = [
    { name: "market prior", raw: inputs.pMarket, w: weights.w_mkt },
    { name: "LLM / news", raw: inputs.pLlm, w: weights.w_llm },
  ];
  if (inputs.pBase !== null) present.push({ name: "base rate", raw: inputs.pBase, w: weights.w_base });

  const wsum = present.reduce((s, p) => s + p.w, 0) || 1;
  return present.map((p) => {
    const weight = p.w / wsum;
    const logOdds = logit(p.raw);
    return { name: p.name, rawProb: p.raw, weight, logOdds, contribution: weight * logOdds };
  });
}
