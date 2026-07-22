"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OpportunityRow } from "@/lib/services/markets";
import { cents, timeToClose } from "@/lib/format";

const selectCls =
  "rounded border border-hairline bg-surface px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none";

export function MarketsTable({
  rows,
  total,
  lastIngestLabel,
}: {
  rows: OpportunityRow[];
  total: number;
  lastIngestLabel: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category) set.add(r.category);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (needle && !r.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, cat]);

  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Last ingest: <span className="text-text">{lastIngestLabel}</span> ·{" "}
        {total.toLocaleString()} markets · nothing scored yet
        {total > rows.length && <> · showing top {rows.length} by volume</>}
      </p>

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
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-hairline bg-surface px-3 py-6 text-center text-sm text-muted">
          No markets match — try a different search{total > rows.length ? " (only the top markets by volume are loaded)" : ""}.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border border-hairline md:block">
            <table className="w-full text-table">
              <thead className="sticky top-0 z-10 border-b border-hairline bg-bg text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Market</th>
                  <th className="px-3 py-2 text-right font-normal">YES mid</th>
                  <th className="px-3 py-2 text-right font-normal">Volume 24h</th>
                  <th className="px-3 py-2 text-right font-normal">Closes in</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.ticker} className="border-b border-hairline last:border-0 hover:bg-surface">
                    <td className="px-3 py-2">
                      <Link href={`/markets/${r.ticker}`} className="hover:text-accent">
                        {r.title}
                      </Link>
                      <div className="text-muted">{r.category ?? "—"}</div>
                    </td>
                    <td className="tnum px-3 py-2 text-right">{cents(r.yesMid)}</td>
                    <td className="tnum px-3 py-2 text-right">{r.volume?.toLocaleString() ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right">{timeToClose(r.closeTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <Link
                key={r.ticker}
                href={`/markets/${r.ticker}`}
                className="block rounded-md border border-hairline bg-surface p-3"
              >
                <div className="mb-2 text-sm">{r.title}</div>
                <div className="grid grid-cols-3 gap-x-4 text-table text-muted">
                  <span>
                    YES <span className="tnum text-text">{cents(r.yesMid)}</span>
                  </span>
                  <span>
                    Vol <span className="tnum text-text">{r.volume?.toLocaleString() ?? "—"}</span>
                  </span>
                  <span>
                    Closes <span className="tnum text-text">{timeToClose(r.closeTime)}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
