import { meanBrier } from "./metrics";

// Slice metrics by category and confidence tier (docs/04 §9). Pure, no I/O.

export interface SliceRow {
  category: string | null;
  confidenceTier: string | null;
  pModel: number;
  pMarket: number;
  netEdge: number;
  outcome: 0 | 1;
}

export interface SliceSummary {
  key: string;
  n: number;
  brierOurs: number;
  brierMarket: number;
  meanNetEdge: number;
}

function summarize(key: string, rows: SliceRow[]): SliceSummary {
  return {
    key,
    n: rows.length,
    brierOurs: meanBrier(rows.map((r) => ({ p: r.pModel, outcome: r.outcome }))),
    brierMarket: meanBrier(rows.map((r) => ({ p: r.pMarket, outcome: r.outcome }))),
    meanNetEdge: rows.reduce((s, r) => s + r.netEdge, 0) / (rows.length || 1),
  };
}

function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r) ?? "Uncategorized";
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  return groups;
}

export function sliceByCategory(rows: SliceRow[]): SliceSummary[] {
  return [...groupBy(rows, (r) => r.category)]
    .map(([k, v]) => summarize(k, v))
    .sort((a, b) => b.n - a.n);
}

export function sliceByConfidenceTier(rows: SliceRow[]): SliceSummary[] {
  const order = ["High", "Medium", "Low"];
  return [...groupBy(rows, (r) => r.confidenceTier)]
    .map(([k, v]) => summarize(k, v))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
