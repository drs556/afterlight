import { PageHeader } from "@/components/page-header";
import { getRecentRuns } from "@/lib/services/runs";
import { usingFixtures } from "@/modules/kalshi";
import { relativeTime } from "@/lib/format";
import { runJobNow } from "./actions";
import { RunButton } from "./run-button";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  ok: "text-edgePos",
  partial: "text-accent",
  error: "text-edgeNeg",
  running: "text-muted",
};

function durationMs(start: Date, end: Date | null): string {
  if (!end) return "—";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return `${s}s`;
}

/** A human hint when enrich stopped early with work remaining (docs/02 §5). */
function stoppedEarlyHint(meta: unknown): string | null {
  const m = meta as
    | { stoppedForTime?: boolean; stoppedForBudget?: boolean; remaining?: number }
    | null;
  if (!m || (!m.stoppedForTime && !m.stoppedForBudget)) return null;
  const reason = m.stoppedForBudget ? "daily budget reached" : "time budget";
  const remaining = m.remaining ? ` · ${m.remaining} remaining — run again to continue` : "";
  return `Stopped early (${reason})${remaining}`;
}

export default async function RunsPage() {
  const runs = await getRecentRuns();

  return (
    <>
      <PageHeader title="Runs" subtitle="Pipeline run history and health." />

      {usingFixtures() && (
        <p className="mb-4 rounded border border-hairline bg-surface px-3 py-2 text-sm text-muted">
          Running in <span className="text-text">fixture mode</span> — no Kalshi API key set.
          Ingest and settle use bundled sample data.
        </p>
      )}

      <div className="mb-6 flex gap-3">
        {(["ingest", "enrich", "score", "settle"] as const).map((job) => (
          <form key={job} action={runJobNow.bind(null, job)}>
            <RunButton job={job} />
          </form>
        ))}
      </div>

      <p className="mb-6 text-sm text-muted">
        Ingest and settle run automatically on a schedule (free — Kalshi data only).{" "}
        <span className="text-text">Enrich is manual</span> because it spends on the news and LLM
        APIs — roughly $1–2 per run, capped by the daily budget guard.
      </p>

      <div className="overflow-x-auto rounded-md border border-hairline">
        <table className="w-full text-table">
          <thead className="border-b border-hairline text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Job</th>
              <th className="px-3 py-2 font-normal">Status</th>
              <th className="px-3 py-2 font-normal">Started</th>
              <th className="px-3 py-2 font-normal">Duration</th>
              <th className="px-3 py-2 text-right font-normal">OK</th>
              <th className="px-3 py-2 text-right font-normal">Failed</th>
              <th className="px-3 py-2 text-right font-normal">Cost</th>
              <th className="px-3 py-2 font-normal">Detail</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  No runs yet. Trigger one with “Run ingest” above.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">{r.job}</td>
                <td className={`px-3 py-2 ${statusColor[r.status] ?? ""}`}>{r.status}</td>
                <td className="px-3 py-2 text-muted">{relativeTime(r.startedAt)}</td>
                <td className="tnum px-3 py-2">{durationMs(r.startedAt, r.finishedAt)}</td>
                <td className="tnum px-3 py-2 text-right">{r.itemsOk ?? 0}</td>
                <td className="tnum px-3 py-2 text-right">{r.itemsFailed ?? 0}</td>
                <td className="tnum px-3 py-2 text-right">${Number(r.costUsd ?? 0).toFixed(2)}</td>
                <td className="px-3 py-2">
                  {r.error ? (
                    <span className="text-edgeNeg">{r.error}</span>
                  ) : (
                    <span className="text-muted">{stoppedEarlyHint(r.meta) ?? ""}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
