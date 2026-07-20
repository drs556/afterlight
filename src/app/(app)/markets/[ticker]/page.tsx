import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PriceChart } from "@/components/price-chart";
import { getMarketDetail } from "@/lib/services/markets";
import { cents, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({ params }: { params: { ticker: string } }) {
  const detail = await getMarketDetail(decodeURIComponent(params.ticker));
  if (!detail) notFound();

  const { market, history, resolution } = detail;
  const latest = history[history.length - 1];
  const points = history.map((h) => ({ t: new Date(h.capturedAt).getTime(), mid: h.yesMid }));

  return (
    <>
      <PageHeader title={market.title} subtitle={market.ticker} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section className="rounded-md border border-hairline bg-surface p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm text-muted">YES mid price</h2>
              <span className="tnum text-lg">{cents(latest?.yesMid)}</span>
            </div>
            <PriceChart data={points} />
            <p className="mt-2 text-sm text-muted">
              {history.length} snapshots · last {relativeTime(latest?.capturedAt)}
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-hairline bg-surface p-4 text-sm">
            <h2 className="mb-3 text-muted">Market facts</h2>
            <dl className="space-y-2">
              <Fact label="Category" value={market.category ?? "—"} />
              <Fact label="Status" value={market.status ?? "—"} />
              <Fact
                label="Closes"
                value={market.closeTime ? new Date(market.closeTime).toLocaleString() : "—"}
              />
              {resolution && (
                <Fact label="Resolved" value={`${resolution.outcome?.toUpperCase()} `} />
              )}
            </dl>
            <a
              href={market.kalshiUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-accent hover:underline"
            >
              View on Kalshi →
            </a>
          </section>

          {market.rulesSummary && (
            <section className="rounded-md border border-hairline bg-surface p-4 text-sm">
              <h2 className="mb-2 text-muted">Rules</h2>
              <p className="whitespace-pre-wrap text-text">{market.rulesSummary}</p>
            </section>
          )}
        </aside>
      </div>

      <p className="mt-6 text-sm text-muted">
        Verdict, signal breakdown and reasoning appear once scoring (M3) and enrichment (M2) land.
      </p>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{value}</dd>
    </div>
  );
}
