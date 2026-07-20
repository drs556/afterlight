import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getOpportunities } from "@/lib/services/markets";
import { getLastSuccessfulIngest } from "@/lib/services/runs";
import { cents, relativeTime, timeToClose } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const [rows, lastIngest] = await Promise.all([getOpportunities(), getLastSuccessfulIngest()]);

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle="Market data from our snapshots. Model probability & net edge arrive in M3."
      />

      <p className="mb-4 text-sm text-muted">
        Last ingest: <span className="text-text">{relativeTime(lastIngest)}</span> · {rows.length}{" "}
        markets
      </p>

      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full text-table">
          <thead className="border-b border-hairline text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Market</th>
              <th className="px-3 py-2 font-normal">Category</th>
              <th className="px-3 py-2 text-right font-normal">YES mid</th>
              <th className="px-3 py-2 text-right font-normal">Spread</th>
              <th className="px-3 py-2 text-right font-normal">Volume 24h</th>
              <th className="px-3 py-2 text-right font-normal">Closes in</th>
              <th className="px-3 py-2 text-right font-normal">Data age</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No markets yet. Run the ingest job on the Runs page.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.ticker} className="border-b border-hairline last:border-0 hover:bg-surface">
                <td className="px-3 py-2">
                  <Link href={`/markets/${r.ticker}`} className="hover:text-accent">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">{r.category ?? "—"}</td>
                <td className="tnum px-3 py-2 text-right">{cents(r.yesMid)}</td>
                <td className="tnum px-3 py-2 text-right">{cents(r.spread)}</td>
                <td className="tnum px-3 py-2 text-right">{r.volume?.toLocaleString() ?? "—"}</td>
                <td className="tnum px-3 py-2 text-right">{timeToClose(r.closeTime)}</td>
                <td className="tnum px-3 py-2 text-right text-muted">{relativeTime(r.capturedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
