"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// A snapshot older than this is flagged stale (docs/01 §4.3 — degraded data is
// visibly flagged). Daily ingest means a healthy snapshot is < 24h old.
const STALE_HOURS = 24;

type SortKey = "rank" | "mkt" | "model" | "edge" | "size" | "closes" | "age";
const defaultDir: Record<Exclude<SortKey, "rank">, "asc" | "desc"> = {
  mkt: "desc",
  model: "desc",
  edge: "desc",
  size: "desc",
  closes: "asc",
  age: "asc",
};

function daysToClose(d: Date | null): number | null {
  if (!d) return null;
  return (new Date(d).getTime() - Date.now()) / 86_400_000;
}

function isStale(d: Date | null): boolean {
  if (!d) return false;
  return (Date.now() - new Date(d).getTime()) / 3_600_000 > STALE_HOURS;
}

function sortValue(r: RankedOpportunity, key: SortKey): number {
  switch (key) {
    case "mkt":
      return r.yesMid ?? -Infinity;
    case "model":
      return r.pModel ?? -Infinity;
    case "edge":
      return r.netEdge ?? -Infinity;
    case "size":
      return r.kellyUsed ?? -Infinity;
    case "closes":
      return r.closeTime ? new Date(r.closeTime).getTime() : Infinity;
    case "age":
      return r.capturedAt ? new Date(r.capturedAt).getTime() : Infinity;
    default:
      return r.rankingScore ?? -Infinity;
  }
}

const selectCls =
  "rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  tip,
}: {
  label: string;
  col: Exclude<SortKey, "rank">;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: Exclude<SortKey, "rank">) => void;
  tip?: React.ReactNode;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-2 text-right font-normal"
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 rounded hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        {label}
        <span className="text-[9px] text-muted">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
      {tip}
    </th>
  );
}

export function OpportunitiesTable({
  rows,
  lastIngestLabel,
}: {
  rows: RankedOpportunity[];
  lastIngestLabel: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [minVol, setMinVol] = useState(0);
  const [onlyActionable, setOnlyActionable] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sel, setSel] = useState(-1);

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

  const sorted = useMemo(() => {
    if (sortKey === "rank") return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => (sortValue(a, sortKey) - sortValue(b, sortKey)) * dir);
  }, [filtered, sortKey, sortDir]);

  // Keep the keyboard selection in range as the list changes.
  useEffect(() => {
    setSel((s) => (s >= sorted.length ? sorted.length - 1 : s));
  }, [sorted.length]);

  // Keyboard nav (j/k/↑/↓ to move, Enter to open) — ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => Math.min(sorted.length - 1, s + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter" && sel >= 0 && sel < sorted.length) {
        router.push(`/markets/${sorted[sel]!.ticker}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted, sel, router]);

  function onSort(col: Exclude<SortKey, "rank">) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(defaultDir[col]);
    }
  }

  const actionableCount = rows.filter((r) => r.actionable).length;

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Last ingest: <span className="text-text">{lastIngestLabel}</span> · {rows.length} scored ·{" "}
        <span className="text-edgePos">{actionableCount} actionable</span> ·{" "}
        <span className="text-text">{sorted.length}</span> shown
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

      {sorted.length === 0 ? (
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
                  <SortHeader
                    label="Mkt"
                    col="mkt"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    tip={<InfoTip label="Mkt" text="Kalshi's YES mid-price — the market's own implied probability." />}
                  />
                  <SortHeader
                    label="Model"
                    col="model"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    tip={
                      <InfoTip
                        label="Model"
                        text="Our blended probability (market + LLM + base rate) with its ± uncertainty band."
                      />
                    }
                  />
                  <SortHeader
                    label="Net edge"
                    col="edge"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    tip={
                      <InfoTip
                        label="Net edge"
                        text="Model minus market, after Kalshi fees and spread. Actionable at ≥5pp (8pp for cheap longshots)."
                      />
                    }
                  />
                  <th className="px-3 py-2 font-normal">
                    Conf.
                    <InfoTip
                      label="Confidence"
                      text="High/Medium/Low from model uncertainty, news volume, snapshot age, and spread."
                    />
                  </th>
                  <SortHeader
                    label="Size"
                    col="size"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    tip={
                      <InfoTip
                        label="Size"
                        text="Fractional-Kelly stake as % of bankroll, capped per-position and per event cluster. * = a cap applied."
                      />
                    }
                  />
                  <SortHeader label="Closes" col="closes" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label="Age" col="age" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr
                    key={r.ticker}
                    onMouseEnter={() => setSel(i)}
                    className={`border-b border-hairline last:border-0 hover:bg-surface ${
                      r.actionable ? "" : "opacity-45"
                    } ${i === sel ? "bg-surface ring-1 ring-inset ring-accent/50" : ""}`}
                  >
                    <td className="tnum px-3 py-2 text-right text-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/markets/${r.ticker}`}
                        className="rounded hover:text-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      >
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
                    <td className="tnum px-3 py-2 text-right text-muted">
                      {relativeTime(r.capturedAt)}
                      {isStale(r.capturedAt) && (
                        <span
                          className="ml-1 rounded border border-edgeNeg/40 px-1 text-[10px] text-edgeNeg"
                          title={`No fresh snapshot in over ${STALE_HOURS}h`}
                        >
                          stale
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (docs/01 §4.6, §5) */}
          <div className="space-y-2 md:hidden">
            {sorted.map((r, i) => (
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
                  <span>
                    {r.category ?? "—"}
                    {isStale(r.capturedAt) && <span className="ml-1 text-edgeNeg">· stale</span>}
                  </span>
                </div>
                {!r.actionable && <div className="mt-2 text-xs text-muted">Below threshold</div>}
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-sm text-muted">
        Rows below the actionable net-edge threshold are dimmed and labeled — they are estimation
        noise, not trades. <span className="tnum">*</span> = a sizing cap applied. Click a column to
        sort; <span className="tnum">j</span>/<span className="tnum">k</span> or arrows to move,{" "}
        <span className="tnum">Enter</span> to open.
      </p>
    </>
  );
}
