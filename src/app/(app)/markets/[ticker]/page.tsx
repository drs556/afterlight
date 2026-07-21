import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PriceChart } from "@/components/price-chart";
import { getMarketDetail, type AssessmentRationale } from "@/lib/services/markets";
import { EdgeGauge } from "@/components/edge-gauge";
import { signalBreakdown } from "@/modules/scoring";
import { cents, pct, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({ params }: { params: { ticker: string } }) {
  const detail = await getMarketDetail(decodeURIComponent(params.ticker));
  if (!detail) notFound();

  const { market, history, resolution, assessment, news, score, scoreWeights } = detail;
  const latest = history[history.length - 1];
  const points = history.map((h) => ({ t: new Date(h.capturedAt).getTime(), mid: h.yesMid }));
  const rationale = (assessment?.rationale ?? null) as AssessmentRationale | null;

  const breakdown =
    score && scoreWeights && score.pMarket !== null && assessment?.pEstimate != null
      ? signalBreakdown(
          { pMarket: score.pMarket, pLlm: assessment.pEstimate, pBase: null },
          scoreWeights,
        )
      : null;

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

      {score && (
        <section className="mt-6 rounded-md border border-hairline bg-surface p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-sm text-muted">Verdict</h2>
            <EdgeGauge netEdge={score.netEdge} />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Market" value={cents(score.pMarket)} />
            <Stat label="Model" value={pct(score.pModel)} />
            <Stat label="Confidence" value={score.confidenceTier ?? "—"} />
            <Stat
              label="Suggested size"
              value={score.kellyUsed ? pct(score.kellyUsed) : "—"}
            />
          </div>

          <p className="mt-4 text-sm text-muted">
            Full Kelly f* = {score.kellyFull !== null ? pct(score.kellyFull) : "—"} × 0.15 fraction
            {score.sizeCappedReason ? ` → ${score.sizeCappedReason}` : ""} ={" "}
            <span className="text-text">{score.kellyUsed ? pct(score.kellyUsed) : "—"}</span> of
            bankroll.
          </p>

          {!score.actionable && (
            <p className="mt-2 text-sm text-edgeNeg">
              Below the actionable net-edge threshold — estimation noise, not signal.
            </p>
          )}

          {breakdown && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm text-muted">Signal breakdown (log-odds)</h3>
              <table className="w-full text-table">
                <thead className="border-b border-hairline text-left text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Signal</th>
                    <th className="py-1 pr-3 text-right font-normal">Raw</th>
                    <th className="py-1 pr-3 text-right font-normal">Weight</th>
                    <th className="py-1 pr-3 text-right font-normal">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((s) => (
                    <tr key={s.name} className="border-b border-hairline last:border-0">
                      <td className="py-1 pr-3">{s.name}</td>
                      <td className="tnum py-1 pr-3 text-right">{pct(s.rawProb)}</td>
                      <td className="tnum py-1 pr-3 text-right">{pct(s.weight)}</td>
                      <td className="tnum py-1 pr-3 text-right">{s.contribution.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {assessment && (
        <section className="mt-6 rounded-md border border-hairline bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm text-muted">Model reasoning</h2>
            <span className="tnum text-sm">
              p_model {pct(assessment.pEstimate)}{" "}
              <span className="text-muted">
                [{pct(assessment.pLow)}–{pct(assessment.pHigh)}]
              </span>
            </span>
          </div>

          {rationale?.thesis && <p className="mb-4 text-sm text-text">{rationale.thesis}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <EvidenceList title="Evidence for" items={rationale?.evidence_for} tone="text-edgePos" />
            <EvidenceList title="Evidence against" items={rationale?.evidence_against} tone="text-edgeNeg" />
          </div>

          {rationale?.change_triggers && rationale.change_triggers.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm text-muted">What would change this</h3>
              <ul className="list-inside list-disc text-sm text-text">
                {rationale.change_triggers.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-sm text-muted">
            {assessment.model} · {assessment.promptVersion} · {relativeTime(assessment.createdAt)}
          </p>
        </section>
      )}

      {news.length > 0 && (
        <section className="mt-6 rounded-md border border-hairline bg-surface p-4">
          <h2 className="mb-3 text-sm text-muted">Cited news</h2>
          <ul className="space-y-2 text-sm">
            {news.map((n) => (
              <li key={n.id}>
                <a href={n.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                  {n.headline}
                </a>
                <span className="text-muted">
                  {" "}
                  — {n.source ?? "?"}
                  {n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleDateString()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!assessment && (
        <p className="mt-6 text-sm text-muted">
          No enrichment yet — run the enrich job. Verdict and signal breakdown arrive with scoring (M3).
        </p>
      )}
    </>
  );
}

function EvidenceList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[] | undefined;
  tone: string;
}) {
  return (
    <div>
      <h3 className={`mb-1 text-sm ${tone}`}>{title}</h3>
      {items && items.length > 0 ? (
        <ul className="list-inside list-disc text-sm text-text">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">—</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="tnum text-lg">{value}</div>
    </div>
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
