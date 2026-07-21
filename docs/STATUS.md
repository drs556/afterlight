# Afterlight Edge — Build Status

**Updated:** 2026-07-20 · Companion to `05_ROADMAP.md` (this tracks *actual* progress).

## Milestones

| Milestone | State | Notes |
|---|---|---|
| **M0** Foundation | ✅ Done | Scaffold, Drizzle schema (10 tables) + migration, Auth.js, seed, CI, design tokens |
| **M1** Ingestion | ✅ Done | `kalshi` client (HTTP + fixture), `ingest`/`settle` jobs, `pipeline_runs`, Runs page, Opportunities (market data), market detail + price chart |
| **M2** Enrichment | ✅ Done | `news` (Tavily+GDELT+fixture, dedup, relevance), `llm` (sonnet-5 + fixture, versioned prompt, zod, retry-once, cost), `enrich` job + budget guard; reasoning + cited news on detail. **Manual-only** |
| **M3** Scoring | ✅ Done | Pure `scoring` (fees, blend, edge, longshot guard, tiers, ranking, Kelly caps) ≥90% branch cov; `score` job; full Opportunities table + edge gauge + actionability rule; verdict + signal breakdown; Settings writes new config_versions |
| **M4** Calibration | ⏭️ Next | Brier vs market baseline, calibration curve, paper PnL, Track Record page, Playwright E2E, `docs/RUNBOOK.md` |

## Deployment

- **Live:** `afterlight-mu.vercel.app` (Vercel Hobby). Deploys from `main`.
- **DB:** Neon Postgres (pooler URL), migrated + seeded. No schema changes since M0 → no pending migrations.
- **Repo:** `github.com/drs556/afterlight`.

## Runtime modes (env-selected)

| Dependency | Live when set | Else |
|---|---|---|
| Kalshi | `KALSHI_API_KEY_ID` + `KALSHI_API_PRIVATE_KEY` | fixtures (bundled sample markets) |
| News | `TAVILY_API_KEY` (+ free GDELT) | fixtures |
| LLM | `ANTHROPIC_API_KEY` | fixtures |

Env vars set on Vercel today: `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`. Admin login: `javiergerardo7@gmail.com`.

## Known gaps / to verify

1. **Kalshi live client unverified** — RSA-PSS signing + pagination written to spec, never hit the real API. Smoke-test on first live ingest; fix as needed.
2. **Cron cadence** — Hobby = once/day (ingest 12:00, score 12:30, settle 13:00 UTC). Sub-daily needs Vercel Pro (snippet in README). `enrich` intentionally off-cron.
3. **Costs** — only enrich spends (Anthropic ~$0.02–0.04/assessment, Tavily ~$0.005–0.01/search), budget-guarded at $10/day. `docs/COSTS.md` not yet created (verify real pricing there before going live).
4. **48h gapless snapshots (M1 accept)** — runtime property; needs Pro cron or manual runs to satisfy.

## Cost posture

- **Fixture mode / free jobs only:** ~$0.
- **Full live:** ~$120–310/mo (dominated by Anthropic), per `03 §5`.
- Rotate the Neon password + `AUTH_SECRET` at some point (they appeared in the build chat).
