# Afterlight Edge — Build Roadmap (Spec 05)

**Version:** 1.0 · Depends on: all prior specs. Milestones are sequential; each has acceptance criteria that must pass before the next begins. The coding agent should treat each milestone as a deliverable PR series.

---

## M0 — Foundation (repo, deploy, auth)

Scope: repo scaffold per `02 §3`, CI (typecheck/lint/test/migration check), Vercel deploy from `main`, Neon connected, Drizzle schema + migrations for all tables in `02 §4`, seed script (admin user, default config_version, category exclusions), Auth.js login, empty shell pages with the design system tokens from `01 §5` applied.

**Accept when:** fresh clone → one documented command → running app locally with fixtures; deployed URL requires login; CI green; `.env.example` complete.

## M1 — Ingestion (Kalshi read path)

Scope: `modules/kalshi` client (rate-limited, cursor pagination, zod-validated, fixture tests), `ingest` job endpoint + Vercel Cron, `settle` job, `pipeline_runs` ledger, Runs page (live), Opportunities page rendering **markets with market data only** (no model columns yet), market detail with price-history chart from our snapshots.

**Accept when:** 48h unattended operation produces gapless 30-min snapshots for included categories; a resolved market appears in `resolutions` within 1h; failures visible on Runs page.

## M2 — Enrichment (news + LLM)

Scope: `modules/news` (Tavily client + GDELT client behind one interface, dedup, relevance filter, drop-rate logging), `modules/llm` (versioned prompt template per `04 §4`, zod output schema, retry-once, cost tracking), `enrich` job with prioritization + **daily budget guard**, assessments visible on market detail (reasoning, citations).

**Accept when:** an enrich run over 40 markets completes within platform limits (batching/self-rescheduling proven), cost per run displayed on Runs page, budget guard demonstrably halts spend, zero assessments stored with schema violations.

## M3 — Scoring, ranking & sizing

Scope: `modules/scoring` pure functions — Kalshi fee schedule (fixture-tested against official examples), blending, net edge, longshot guard, confidence tiers, ranking score, Kelly sizing with caps (`04 §§3–8`); `score` job; full Opportunities table per `01 §3.1` including the actionability rule and edge-gauge signature element; Settings page writing new `config_versions`; verdict + signal-breakdown sections on market detail.

**Accept when:** unit fixtures reproduce hand-computed values for fees, blend, edge, Kelly caps; every score row references config_version + assessment + snapshot; toggling a weight in Settings produces new scores under a new config_version without touching old rows.

## M4 — Calibration & track record (MVP complete)

Scope: `modules/calibration` (Brier vs. market baseline, log loss, calibration bins, paper PnL with fees, slices), Track Record page per `01 §3.3` including empty-state progress toward 200 resolved predictions, E2E Playwright flows, runbook doc (`docs/RUNBOOK.md`: schedules, budget caps, failure playbook, cost verification per `03` caution note).

**Accept when:** with seeded synthetic resolutions, Track Record reproduces hand-computed Brier/baseline/PnL fixtures; real pipeline runs unattended end-to-end; success criteria table in `00 §5` items 1, 2, 5 fully met (3–4 are then a matter of accumulating live time).

## Post-MVP backlog (do not build now — recorded so it isn't re-litigated)

Ordered by expected value once the calibration loop has data:
1. Weight/Kelly re-fit workflow gated by the `04 §9` decision rule.
2. WebSocket price streaming; alerting (email/Telegram) on new High-confidence actionable rows.
3. Base-rate backfill breadth; favorite–longshot bias modeled statistically instead of the guard rule.
4. Additional sources (Reddit/X) — only if calibration shows the news signal is the bottleneck.
5. Multi-user support; then Polymarket ingestion; then (Phase 4 of the blueprint) cross-venue mapping.

## Operating agreement while building

- Spec drift is a bug: implementation deviations require editing the spec in the same PR.
- No milestone starts before the previous one's acceptance criteria pass.
- Weekly written status: what ran, what it cost, what broke, current Brier progress count.
