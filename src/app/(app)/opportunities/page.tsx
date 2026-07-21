import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EdgeGauge, bandLabel } from "@/components/edge-gauge";
import { getOpportunities, getRankedOpportunities } from "@/lib/services/markets";
import { getLastSuccessfulIngest } from "@/lib/services/runs";
import { cents, relativeTime, timeToClose, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

const tierColor: Record<string, string> = {
  High: "text-edgePos",
  Medium: "text-accent",
  Low: "text-muted",
};

export default async function OpportunitiesPage() {
  const [ranked, lastIngest] = await Promise.all([
    getRankedOpportunities(),
    getLastSuccessfulIngest(),
  ]);

  // Before any scores exist, fall back to the market-data view (M1).
  if (ranked.length === 0) {
    const rows = await getOpportunities();
    return (
      <>
        <PageHeader
          title="Opportunities"
          subtitle="Market data only — run enrich then score to populate model columns."
        />
        <p className="mb-4 text-sm text-muted">
          Last ingest: <span className="text-text">{relativeTime(lastIngest)}</span> · {rows.length}{" "}
          markets · nothing scored yet
        </p>
        <div className="overflow-x-auto rounded-md border border-hairline">
          <table className="w-full text-table">
            <thead className="border-b border-hairline text-left text-muted">
              <tr>
                <th className="px-3 py-2 font-normal">Market</th>
                <th className="px-3 py-2 text-right font-normal">YES mid</th>
                <th className="px-3 py-2 text-right font-normal">Volume 24h</th>
                <th className="px-3 py-2 text-right font-normal">Closes in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-hairline last:border-0 hover:bg-surface">
                  <td className="px-3 py-2">
                    <Link href={`/markets/${r.ticker}`} className="hover:text-accent">
                      {r.title}
                    </Link>
                  </td>
                  <td className="tnum px-3 py-2 text-right">{cents(r.yesMid)}</td>
                  <td className="tnum px-3 py-2 text-right">{r.volume?.toLocaleString() ?? "—"}</td>
                  <td className="tnum px-3 py-2 text-right">{timeToClose(r.closeTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const actionableCount = ranked.filter((r) => r.actionable).length;

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Where the model disagrees with Kalshi profitably, ranked by evidence-weighted edge."
      />
      <p className="mb-4 text-sm text-muted">
        Last ingest: <span className="text-text">{relativeTime(lastIngest)}</span> · {ranked.length}{" "}
        scored · <span className="text-edgePos">{actionableCount} actionable</span>
      </p>

      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full text-table">
          <thead className="border-b border-hairline text-left text-muted">
            <tr>
              <th className="px-3 py-2 text-right font-normal">#</th>
              <th className="px-3 py-2 font-normal">Market</th>
              <th className="px-3 py-2 text-right font-normal">Mkt</th>
              <th className="px-3 py-2 text-right font-normal">Model</th>
              <th className="px-3 py-2 text-right font-normal">Net edge</th>
              <th className="px-3 py-2 font-normal">Conf.</th>
              <th className="px-3 py-2 text-right font-normal">Size</th>
              <th className="px-3 py-2 text-right font-normal">Closes</th>
              <th className="px-3 py-2 text-right font-normal">Age</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              // Below-threshold rows stay visible but de-emphasized (docs/01 §3.1 — hard rule).
              <tr
                key={r.ticker}
                className={`border-b border-hairline last:border-0 hover:bg-surface ${
                  r.actionable ? "" : "opacity-45"
                }`}
              >
                <td className="tnum px-3 py-2 text-right text-muted">{i + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/markets/${r.ticker}`} className="hover:text-accent">
                    {r.title}
                  </Link>
                  <div className="text-muted">
                    {r.category ?? "—"}
                    {!r.actionable && <span className="ml-2">· Below threshold</span>}
                  </div>
                </td>
                <td className="tnum px-3 py-2 text-right">{cents(r.yesMid)}</td>
                <td className="tnum px-3 py-2 text-right">{bandLabel(r.pModel, r.uncertainty)}</td>
                <td className="px-3 py-2 text-right">
                  <EdgeGauge netEdge={r.netEdge} />
                </td>
                <td className={`px-3 py-2 ${tierColor[r.confidenceTier ?? "Low"] ?? ""}`}>
                  {r.confidenceTier ?? "—"}
                </td>
                <td className="tnum px-3 py-2 text-right" title={r.sizeCappedReason ?? undefined}>
                  {r.kellyUsed ? pct(r.kellyUsed) : "—"}
                  {r.sizeCappedReason ? <span className="text-muted"> *</span> : null}
                </td>
                <td className="tnum px-3 py-2 text-right">{timeToClose(r.closeTime)}</td>
                <td className="tnum px-3 py-2 text-right text-muted">{relativeTime(r.capturedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted">
        Rows below the actionable net-edge threshold are dimmed and labeled — they are estimation
        noise, not trades. <span className="tnum">*</span> = a sizing cap applied.
      </p>
    </>
  );
}
