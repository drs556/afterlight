import { PageHeader, Placeholder } from "@/components/page-header";
import { CalibrationChart } from "@/components/calibration-chart";
import { getTrackRecordReport } from "@/lib/services/track-record";
import { RESOLVED_PREDICTIONS_TARGET } from "@/modules/calibration";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrackRecordPage() {
  const report = await getTrackRecordReport();

  if (report.n === 0) {
    return (
      <>
        <PageHeader
          title="Track record"
          subtitle="Our Brier score vs. the market-price baseline. This page is why the MVP exists."
        />
        <Placeholder>
          No resolved predictions yet — 0 of {RESOLVED_PREDICTIONS_TARGET} toward the calibration
          target. Once markets we&rsquo;ve scored resolve (via the settle job), Brier score, a
          calibration curve, and paper PnL appear here automatically.
        </Placeholder>
      </>
    );
  }

  const wonFraction =
    report.paperPnl.wins + report.paperPnl.losses > 0
      ? report.paperPnl.wins / (report.paperPnl.wins + report.paperPnl.losses)
      : null;

  return (
    <>
      <PageHeader
        title="Track record"
        subtitle="Our Brier score vs. the market-price baseline. This page is why the MVP exists."
      />

      {report.n < RESOLVED_PREDICTIONS_TARGET && (
        <p className="mb-6 rounded border border-hairline bg-surface px-3 py-2 text-sm text-muted">
          {report.n} of {RESOLVED_PREDICTIONS_TARGET} resolved predictions (
          {(report.progressToTarget * 100).toFixed(0)}%) — metrics below are directional until the
          full sample accrues.
        </p>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Metric label="Brier — ours" value={report.brierOurs.toFixed(4)} />
        <Metric
          label="Brier — market"
          value={report.brierMarket.toFixed(4)}
          tone={report.beatsBaseline ? "text-edgePos" : "text-edgeNeg"}
        />
        <Metric label="Resolved predictions" value={String(report.n)} />
        <Metric
          label="Paper PnL"
          value={`${report.paperPnl.totalPnlUsd >= 0 ? "+" : ""}$${report.paperPnl.totalPnlUsd.toFixed(0)}`}
          tone={report.paperPnl.totalPnlUsd >= 0 ? "text-edgePos" : "text-edgeNeg"}
        />
      </div>

      <p className="mb-8 text-sm">
        {report.beatsBaseline ? (
          <span className="text-edgePos">
            Our Brier score beats the market-price baseline on this sample — there is measurable
            edge so far.
          </span>
        ) : (
          <span className="text-edgeNeg">
            Our Brier score does not beat the market-price baseline on this sample — honest
            output: no edge yet.
          </span>
        )}
        {wonFraction !== null && (
          <span className="text-muted">
            {" "}
            Paper trades: {report.paperPnl.wins}W–{report.paperPnl.losses}L ({pct(wonFraction)} win
            rate), ${report.paperPnl.totalStakedUsd.toFixed(0)} staked.
          </span>
        )}
      </p>

      <section className="mb-8 rounded-md border border-hairline bg-surface p-4">
        <h2 className="mb-3 text-sm text-muted">Calibration curve</h2>
        <CalibrationChart ours={report.calibrationOurs} market={report.calibrationMarket} />
        <p className="mt-2 text-sm text-muted">
          Predicted probability vs. realized frequency, binned. The dashed diagonal is perfect
          calibration.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SliceTable title="By category" columnLabel="Category" slices={report.byCategory} />
        <SliceTable title="By confidence tier" columnLabel="Tier" slices={report.byConfidenceTier} />
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`tnum text-xl ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function SliceTable({
  title,
  columnLabel,
  slices,
}: {
  title: string;
  columnLabel: string;
  slices: { key: string; n: number; brierOurs: number; brierMarket: number; meanNetEdge: number }[];
}) {
  return (
    <section className="rounded-md border border-hairline bg-surface p-4">
      <h2 className="mb-3 text-sm text-muted">{title}</h2>
      <table className="w-full text-table">
        <thead className="border-b border-hairline text-left text-muted">
          <tr>
            <th className="py-1 pr-2 font-normal">{columnLabel}</th>
            <th className="py-1 pr-2 text-right font-normal">n</th>
            <th className="py-1 pr-2 text-right font-normal">Brier ours</th>
            <th className="py-1 pr-2 text-right font-normal">Brier mkt</th>
            <th className="py-1 text-right font-normal">Mean edge</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key} className="border-b border-hairline last:border-0">
              <td className="py-1 pr-2">{s.key}</td>
              <td className="tnum py-1 pr-2 text-right">{s.n}</td>
              <td className="tnum py-1 pr-2 text-right">{s.brierOurs.toFixed(3)}</td>
              <td className="tnum py-1 pr-2 text-right">{s.brierMarket.toFixed(3)}</td>
              <td className="tnum py-1 text-right">{(s.meanNetEdge * 100).toFixed(1)}pp</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
