# Afterlight Edge — Build Status

**Updated:** 2026-09-24 · Companion to `05_ROADMAP.md` (this tracks *actual* progress).

## 2026-09-24 — category scope funnel

Design: `docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md`. In scope: store Politics, Economics, Elections, Sports and Climate and Weather; analyse Politics + Economics only. Config row 12.

- **Ingest fixed.** It had been killed at the 300s ceiling on every run since crons returned (2026-09-22/23/24). It now stores only markets with 24h volume ≥ 500: **4,515 stored** (Sports 3,378 · Elections 383 · Economics 327 · Politics 241 · Climate 231), 98,252 below the floor, 27,165 in excluded categories — in **83.7s**.
- **Enrich pool:** 422 eligible Politics + Economics markets never assessed, after the volume, spread, freshness and time-to-close gates (the design's 591 counted volume only). At ~40/day that is an ~11-day first sweep.
- **Enrich throughput:** **38 assessments in one run** at concurrency 4 (was ~12 sequential), 259s, 0 failures, only Politics/Economics, ≤ 2 per event across 26 events. It stopped on the wall clock with 2 candidates left, as designed.
- **Cost came in lower than planned:** that run cost **$0.22 (~$0.006/assessment)**, a third of July's metered $0.019. One run is not a trend; `COSTS.md` keeps the conservative figure until more runs confirm. At this rate daily enrich is ~$7/month.
- **Score:** 115 markets scored, **7 actionable**.
- **Now on cron:** ingest 06:00, enrich 08:00, score 10:00, settle 11:00 UTC (Hobby fires 21–51 min late, hence the gaps).
- **Found and fixed during rollout — Next.js was caching database queries.** `neon-http` queries are `fetch` calls, which Next 14 caches inside route handlers. Repeated identical queries in one function instance were served from cache: jobs kept reading config row 11 after row 12 existed, back-to-back runs shared and overwrote one ledger row (two `settle` calls both reported run 41), and identical snapshot inserts never executed. Fixed with `cache: "no-store"` on the Neon client (`02 §5`). Verified: two `settle` calls now create runs 42 and 43. During the ~20 minutes before the fix, the ledger under-counts runs (runs 40 and 41 each absorbed several executions) and some duplicate-price snapshots were not written.
- **Also fixed:** Settings saves no longer reset `max_days_to_close` and other unshown fields; enrich candidate selection no longer loads snapshot history.

## ⚠️ 2026-09-21 — the pipeline had been dead for two months

Found while picking up post-MVP work. **No cron had ever run successfully.** The session middleware's `config.matcher` excluded `api/auth` but not `api/jobs`, so every Vercel Cron request to `/api/jobs/*` was redirected to `/login` before reaching its `CRON_SECRET` bearer guard. The redirect happens before `withRun()`, so a failing cron left **no trace in `pipeline_runs`** — indistinguishable from a cron that never fired. All 29 runs in the ledger were manual "Run now" clicks.

Consequences, and what was done:

| Symptom | Root cause | Fix |
|---|---|---|
| `settle` had **never run**; `resolutions` empty; calibration had zero data | middleware redirect + `runSettle` was unrunnable (below) | matcher + runtime check in `lib/route-access.ts`, pinned by tests |
| `runSettle` could not have completed regardless | it paged `?status=settled` across Kalshi's **entire** settled history, with a per-market `findFirst` loading the whole `raw` column | rewritten to be driven from our own table via `GET /markets?tickers=…` (`03 §1`) |
| ingest's "Run now" disabled since 2026-07-23 | a run killed mid-flight stayed `running` forever; `isJobRunning` trusted it | `isRunStale` (15 min) in `modules/runs/staleness.ts`; orphan row cleared |
| `maxDuration = 60` on every job, while real runs took 200–274s | declared value never matched reality; `enrich_max_seconds` (240) sat 4× above its own supposed ceiling | 300 on ingest/enrich/settle, invariant documented in `02 §5` |

**Result:** `settle` seeded **816 resolutions in 3.0s**, and the calibration loop produced its first real numbers — see below.

### First calibration signal (n=81, read it carefully)

| | Ours | Market |
|---|---|---|
| Brier | **0.0820** | 0.0956 |
| Log loss | **0.2589** | 0.2844 |

`beatsBaseline: true`, 40.5% of the way to the resolved-prediction target. **But the aggregate is misleading**, and the slices say so:

- **Climate and Weather** (n=55): 0.0954 vs 0.0971 — a tie. Mean net edge **−1.3 pp**.
- **Elections** (n=13): 0.0286 vs 0.0288 — a tie. Mean net edge **−1.9 pp**.
- **Sports** (n=11): 0.0931 vs 0.1847 — the entire apparent advantage, and 22 of the scored+resolved rows come from a single series (`KXNBATEAMANNOUNCE`).

So: on the two categories with real sample size the model **matches the market and finds no fee-adjusted edge** — exactly what `00 §1` predicts for efficient markets. The headline win rests on 11 Sports markets in one series. Paper PnL is empty (nothing was actionable). Nowhere near the `04 §9` bar for re-fitting weights.

### Resolved 2026-09-24

The leftover Sports-only config (row 11) is superseded by the scope-funnel row (12); crons are verified end to end; market data is fresh again. See the section above.

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
2. **Cron cadence** — Hobby = once/day per job, and it fires late (observed +21 to +51 min), so jobs sit 2h apart to keep order: ingest 06:00, enrich 08:00, score 10:00, settle 11:00 UTC. Sub-daily needs Vercel Pro (snippet in README).
3. ~~**Costs** — `docs/COSTS.md` not yet created~~ ✅ **Created** (verified pricing). Enrich runs ~$0.25/run (≈12 assessments), budget-guarded at $10/day, manual-only.
4. **48h gapless snapshots (M1 accept)** — runtime property; needs Pro cron or manual runs to satisfy.
5. **Ingest write batching** — ingest writes markets one row at a time (2 round trips each; ~202–219s for 12k markets). Now comfortably inside the corrected `maxDuration = 300`, so this stays a deferred optimization rather than a risk. Batched multi-row upserts would cut it by roughly an order of magnitude when the universe grows; note that `ON CONFLICT DO UPDATE` needs within-batch ticker dedup and a per-row fallback to keep today's fault tolerance.
6. **Sticky failures (residual)** — if a market fails assessment for a non-transient reason it stays stalest-first and is retried each run. Moot while failures are ~0 after the coercion fix; add an attempt-cooldown if it recurs.

## Cost posture

- **Fixture mode / free jobs only:** ~$0.
- **Live so far:** a handful of enrich runs ≈ **$2–3 total** (85 assessments). Steady-state at full cadence ~$120–310/mo (dominated by Anthropic), per `03 §5` / `COSTS.md`.
- **Rotate** the Neon password, `AUTH_SECRET`, and the user passwords set during the build (they appeared in the build chat).
