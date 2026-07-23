# Afterlight Edge — Build Status

**Updated:** 2026-07-22 · Companion to `05_ROADMAP.md` (this tracks *actual* progress).

**Now live end-to-end with real data.** The full pipeline (ingest → enrich → score → display) runs in production on real Kalshi markets, real news (Tavily/GDELT), and real LLM assessments (`claude-sonnet-5`). As of first live run: **12,334 markets** ingested (Elections + Climate), **85 markets** enriched + scored, **3 actionable** opportunities surfaced. See "Post-MVP work (2026-07-22)" below.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| **M0** Foundation | ✅ Done | Scaffold, Drizzle schema (10 tables) + migration, Auth.js, seed, CI, design tokens |
| **M1** Ingestion | ✅ Done | `kalshi` client (HTTP + fixture), `ingest`/`settle` jobs, `pipeline_runs`, Runs page, Opportunities (market data), market detail + price chart |
| **M2** Enrichment | ✅ Done | `news` (Tavily+GDELT+fixture, dedup, relevance), `llm` (sonnet-5 + fixture, versioned prompt, zod, retry-once, cost), `enrich` job + budget guard; reasoning + cited news on detail. **Manual-only** |
| **M3** Scoring | ✅ Done | Pure `scoring` (fees, blend, edge, longshot guard, tiers, ranking, Kelly caps) ≥90% branch cov; `score` job; full Opportunities table + edge gauge + actionability rule; verdict + signal breakdown; Settings writes new config_versions |
| **M4** Calibration | ✅ Done | Pure `calibration` (Brier, log loss, 10-bin calibration curve, paper PnL, category/tier slices) 100% stmts / 98% branch; Track Record page (headline metrics, curve chart, empty state); 3 Playwright E2E flows (login, opportunities, market detail) all passing against Neon; `docs/RUNBOOK.md` |

**MVP complete + live.** See `05_ROADMAP.md` → Post-MVP backlog for what's still open.

## Post-MVP work (2026-07-22)

Went live and hardened the pipeline against real Kalshi data. Highlights:

- **Kalshi live client verified** + **three spec-drift bugs fixed** (real API had drifted from the spec the code was written to): (1) prices now come as dollar-strings `yes_bid_dollars` not integer-cents `yes_bid`; (2) nested combo/multivariate markets omit their own `title` (falls back to event title → subtitle → ticker); (3) `volume`/`open_interest` now arrive as fractional `*_fp` strings and are rounded for the bigint columns. Per-market parse is now fault-tolerant (one bad market skips, never aborts a page). See `docs/03 §1`.
- **LLM output coercion:** `claude-sonnet-5` intermittently returns numbers as strings (`"p_yes": "0.35"`); numeric fields now `z.coerce.number()` (booleans left strict). This was the cause of early enrich failures.
- **Enrich made resumable/timeout-safe:** wall-clock budget (`enrich_max_seconds`, default 240) stops before the serverless timeout; candidates are stalest-first so re-running continues. 60s per-call LLM timeout. Runs page shows the true un-assessed backlog + failure reasons. See `docs/03 §3`.
- **Query hardening (Neon 64MB cap):** Opportunities/score/enrich queries no longer load the large `raw` jsonb — select only needed columns. `getRankedOpportunities` is scores-first (deterministic, avoids a 12k-ticker IN-list).
- **Roles:** `admin` / `viewer` with server-side `requireAdmin` gating on Settings writes + job triggers (docs/01 §1). Create users with `npm run db:add-user`.
- **Scope:** config-driven categories — currently **Elections + Climate and Weather + Sports** (config version rows; `excluded_categories`; Sports added 2026-07-22 as an experiment — see `docs/00 §1` Post-MVP scope note). Enrich window is config-driven too (`max_days_to_close`, set to 540 for long-dated election primaries).
- **UI (Tier 1–3):** Opportunities filters (category / time-to-close / min-volume / only-actionable), search, responsive table→cards, per-column info tooltips, sticky header; loading skeletons + error boundary per route; `prefers-reduced-motion` on charts; column sort, staleness badge, keyboard nav (j/k/Enter); active-section nav highlight; fresh-on-navigation (`staleTimes.dynamic: 0`).

## Deployment

- **Live (real data):** `afterlight-mu.vercel.app` (Vercel Hobby). Deploys from `main`.
- **DB:** Neon Postgres (pooler URL), migrated + seeded. Schema migration `0001` added `scores.direction`.
- **Repo:** `github.com/drs556/afterlight`.

## Runtime modes (env-selected)

| Dependency | Live when set | Else |
|---|---|---|
| Kalshi | `KALSHI_API_KEY_ID` + `KALSHI_API_PRIVATE_KEY` | fixtures (bundled sample markets) |
| News | `TAVILY_API_KEY` (+ free GDELT) | fixtures |
| LLM | `ANTHROPIC_API_KEY` | fixtures |

**All three are now set on Vercel (Production) → the deployed app runs in full live mode.** Other env vars: `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`. Users: `javiergerardo7@gmail.com` (admin), `dvd2301@gmail.com` (viewer). **Local `.env` has only the Kalshi keys** — local script runs use fixtures for news/LLM.

## Known gaps / to verify

1. ~~**Kalshi live client unverified**~~ ✅ **Verified + ingested live 2026-07-22** (12,334 markets). Three spec-drift bugs fixed (above).
2. **Cron cadence** — Hobby = once/day (ingest 12:00, score 12:30, settle 13:00 UTC). Sub-daily needs Vercel Pro (snippet in README). `enrich` intentionally off-cron.
3. ~~**Costs** — `docs/COSTS.md` not yet created~~ ✅ **Created** (verified pricing). Enrich runs ~$0.25/run (≈12 assessments), budget-guarded at $10/day, manual-only.
4. **48h gapless snapshots (M1 accept)** — runtime property; needs Pro cron or manual runs to satisfy.
5. **Ingest write batching** — ingest writes markets one row at a time (~202s on Vercel for 12k markets; fine under the current function limit but no headroom to spare). "Small batch + reschedule" / batched inserts remain a good optimization — declined for now since it completes.
6. **Sticky failures (residual)** — if a market fails assessment for a non-transient reason it stays stalest-first and is retried each run. Moot while failures are ~0 after the coercion fix; add an attempt-cooldown if it recurs.

## Cost posture

- **Fixture mode / free jobs only:** ~$0.
- **Live so far:** a handful of enrich runs ≈ **$2–3 total** (85 assessments). Steady-state at full cadence ~$120–310/mo (dominated by Anthropic), per `03 §5` / `COSTS.md`.
- **Rotate** the Neon password, `AUTH_SECRET`, and the user passwords set during the build (they appeared in the build chat).
