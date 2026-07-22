"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RankedOpportunity } from "@/lib/services/markets";
import { EdgeGauge, bandLabel } from "@/components/edge-gauge";
import { InfoTip } from "@/components/info-tip";
import { cents, timeToClose, relativeTime, pct } from "@/lib/format";

const tierColor: Record<string, string> = {
  High: "text-edgePos",
  Medium: "text-accent",
  Low: "text-muted",
};

type Bucket = "all" | "7" | "30" | "90" | "90plus";
const bucketLabels: Record<Bucket, string> = {
  all: "Any time to close",
  "7": "≤ 7 days",
  "30": "8–30 days",
  "90": "31–90 days",
  "90plus": "> 90 days",
};

const volOptions: { value: number; label: string }[] = [
  { value: 0, label: "Any volume" },
  { value: 100, label: "≥ 100" },
  { value: 500, label: "≥ 500" },
  { value: 1000, label: "≥ 1k" },
  { value: 5000, label: "≥ 5k" },
];

function daysToClose(d: Date | null): number | null {
  if (!d) return null;
  return (new Date(d).getTime() - Date.now()) / 86_400_000;
}

const selectCls =
  "rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

export function OpportunitiesTable({
  rows,
  lastIngestLabel,
}: {
  rows: RankedOpportunity[];
  lastIngestLabel: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [minVol, setMinVol] = useState(0);
  const [onlyActionable, setOnlyActionable] = useState(true);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category) set.add(r.category);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActionable && !r.actionable) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      if (minVol > 0 && (r.volume ?? 0) < minVol) return false;
      if (bucket !== "all") {
        const d = daysToClose(r.closeTime);
        if (d === null) return false;
        if (bucket === "7" && !(d <= 7)) return false;
        if (bucket === "30" && !(d > 7 && d <= 30)) return false;
        if (bucket === "90" && !(d > 30 && d <= 90)) return false;
        if (bucket === "90plus" && !(d > 90)) return false;
      }
      return true;
    });
  }, [rows, q, cat, bucket, minVol, onlyActionable]);

  const actionableCount = rows.filter((r) => r.actionable).length;

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Last ingest: <span className="text-text">{lastIngestLabel}</span> · {rows.length} scored ·{" "}
        <span className="text-edgePos">{actionableCount} actionable</span> ·{" "}
        <span className="text-text">{filtered.length}</span> shown
      </p>

      {/* Filter bar (docs/01 §3.1) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets…"
          className="min-w-[12rem] flex-1 rounded border border-hairline bg-surface px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={selectCls}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as Bucket)}
          className={selectCls}
        >
          {(Object.keys(bucketLabels) as Bucket[]).map((b) => (
            <option key={b} value={b}>
              {bucketLabels[b]}
            </option>
          ))}
        </select>
        <select
          value={minVol}
          onChange={(e) => setMinVol(Number(e.target.value))}
          className={selectCls}
        >
          {volOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-hairline bg-surface px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={onlyActionable}
            onChange={(e) => setOnlyActionable(e.target.checked)}
            className="accent-accent"
          />
          Only actionable
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-hairline bg-surface px-3 py-6 text-center text-sm text-muted">
          No markets match these filters.{" "}
          {onlyActionable && (
            <>Nothing is above the actionable edge threshold — try turning off “Only actionable”.</>
          )}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border border-hairline md:block">
            <table className="w-full text-table">
              <thead className="sticky top-0 z-10 border-b border-hairline bg-bg text-left text-muted">
                <tr>
                  <th className="px-3 py-2 text-right font-normal">#</th>
                  <th className="px-3 py-2 font-normal">Market</th>
                  <th className="px-3 py-2 text-right font-normal">
                    Mkt
                    <InfoTip label="Mkt" text="Kalshi's YES mid-price — the market's own implied probability." />
                  </th>
                  <th className="px-3 py-2 text-right font-normal">
                    Model
                    <InfoTip
                      label="Model"
                      text="Our blended probability (market + LLM + base rate) with its ± uncertainty band."
                    />
                  </th>
                  <th className="px-3 py-2 text-right font-normal">
                    Net edge
                    <InfoTip
                      label="Net edge"
                      text="Model minus market, after Kalshi fees and spread. Actionable at ≥5pp (8pp for cheap longshots)."
                    />
                  </th>
                  <th className="px-3 py-2 font-normal">
                    Conf.
                    <InfoTip
                      label="Confidence"
                      text="High/Medium/Low from model uncertainty, news volume, snapshot age, and spread."
                    />
                  </th>
                  <th className="px-3 py-2 text-right font-normal">
                    Size
                    <InfoTip
                      label="Size"
                      text="Fractional-Kelly stake as % of bankroll, capped per-position and per event cluster. * = a cap applied."
                    />
                  </th>
                  <th className="px-3 py-2 text-right font-normal">Closes</th>
                  <th className="px-3 py-2 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
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

          {/* Mobile cards (docs/01 §4.6, §5) */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r, i) => (
              <Link
                key={r.ticker}
                href={`/markets/${r.ticker}`}
                className={`block rounded-md border border-hairline bg-surface p-3 ${
                  r.actionable ? "" : "opacity-45"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="text-sm">
                    <span className="mr-1 text-muted">{i + 1}.</span>
                    {r.title}
                  </span>
                  <EdgeGauge netEdge={r.netEdge} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-table text-muted">
                  <span>
                    Mkt <span className="tnum text-text">{cents(r.yesMid)}</span>
                  </span>
                  <span>
                    Model <span className="tnum text-text">{bandLabel(r.pModel, r.uncertainty)}</span>
                  </span>
                  <span>
                    Conf{" "}
                    <span className={tierColor[r.confidenceTier ?? "Low"] ?? "text-text"}>
                      {r.confidenceTier ?? "—"}
                    </span>
                  </span>
                  <span>
                    Size <span className="tnum text-text">{r.kellyUsed ? pct(r.kellyUsed) : "—"}</span>
                  </span>
                  <span>
                    Closes <span className="tnum text-text">{timeToClose(r.closeTime)}</span>
                  </span>
                  <span>{r.category ?? "—"}</span>
                </div>
                {!r.actionable && <div className="mt-2 text-xs text-muted">Below threshold</div>}
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-sm text-muted">
        Rows below the actionable net-edge threshold are dimmed and labeled — they are estimation
        noise, not trades. <span className="tnum">*</span> = a sizing cap applied.
      </p>
    </>
  );
}
