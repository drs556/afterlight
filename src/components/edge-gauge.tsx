import { pct } from "@/lib/format";

// The signature "signal desk" element (docs/01 §5): net edge as a tabular
// figure with a thin gauge beneath, filled proportionally to |edge| capped at
// 20pp. The one place color saturates on the page.
export function EdgeGauge({ netEdge }: { netEdge: number | null }) {
  if (netEdge === null) {
    return <span className="tnum text-muted">—</span>;
  }
  const positive = netEdge >= 0;
  const color = positive ? "bg-edgePos" : "bg-edgeNeg";
  const text = positive ? "text-edgePos" : "text-edgeNeg";
  const fill = Math.min(1, Math.abs(netEdge) / 0.2); // cap gauge at 20pp
  const sign = positive ? "+" : "−";
  const points = (Math.abs(netEdge) * 100).toFixed(1);

  return (
    <div className="inline-flex flex-col items-end gap-1" title={`${sign}${points} pp net edge`}>
      <span className={`tnum text-sm ${text}`}>
        {sign}
        {points} pp
      </span>
      <div className="h-[3px] w-16 overflow-hidden rounded-full bg-hairline">
        <div className={`h-full ${color}`} style={{ width: `${(fill * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

// Re-export a tiny helper so pages don't import pct just for a band label.
export function bandLabel(pModel: number | null, u: number | null): string {
  if (pModel === null) return "—";
  if (u === null) return pct(pModel);
  return `${pct(pModel)} ±${(u * 100).toFixed(1)}`;
}
