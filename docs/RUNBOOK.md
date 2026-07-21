# Afterlight Edge — Runbook

Operational reference for the deployed app. See `docs/STATUS.md` for build progress and `CLAUDE.md` for engineering conventions.

## Schedules

| Job | Cron (Hobby, daily) | Cron (Pro, spec cadence) | Costs money? |
|---|---|---|---|
| `ingest` | 12:00 UTC | every 30 min | No (Kalshi data is free) |
| `score` | 12:30 UTC | :15 and :45 past the hour | No (pure compute) |
| `settle` | 13:00 UTC | hourly | No |
| `enrich` | **not scheduled — manual only** | (same) | **Yes** — the only paid job |

Vercel Hobby only fires cron jobs once per day; `vercel.json` ships the daily
schedule above so the free deploy succeeds. To restore the spec cadence on
Pro, edit `vercel.json`:

```json
{ "path": "/api/jobs/ingest", "schedule": "*/30 * * * *" },
{ "path": "/api/jobs/score",  "schedule": "15,45 * * * *" },
{ "path": "/api/jobs/settle", "schedule": "0 * * * *" }
```

Every job can also be triggered on demand from the **Runs** page ("Run
now" — session-authed) regardless of the cron cadence.

## Budget caps

- **LLM daily budget**: `thresholds.llm_daily_budget_usd` in the active
  config (Settings page), default **US$10/day**. The `enrich` job sums
  today's `pipeline_runs.cost_usd` for the `enrich` job before starting and
  stops (logging `budgetExceeded: true`) once the cap would be exceeded.
- **Per-assessment cost**: ~US$0.02–0.04 (Anthropic, claude-sonnet-5).
- **Per-search cost**: ~US$0.005–0.01 (Tavily).
- Lower the cap anytime in Settings — it takes effect on the next `enrich`
  run without a deploy.
- Verify current provider pricing before relying on these numbers; record
  the verified figures in `docs/COSTS.md` (create it before going fully
  live per `docs/03`'s pricing caution note).

## Failure playbook

| Symptom | Where to look | Likely cause / fix |
|---|---|---|
| Runs page shows a job `status: error` | Row's `error` column | Read the message; most job bodies catch per-item errors and only fail the whole run on something structural (DB down, config missing) |
| `enrich` returns `budgetExceeded: true` with 0 items | Runs page | Working as designed — daily cap reached. Raise the cap in Settings or wait for the next UTC day |
| Kalshi ingest fails immediately | Runs page `error` | If `KALSHI_API_KEY_ID`/`KALSHI_API_PRIVATE_KEY` are set, the live HTTP client is **unverified against the real API** — check the error text (auth/signing vs. rate limit vs. schema) and fix `modules/kalshi/http-client.ts` accordingly. Without those env vars, ingest always uses fixtures and should never fail this way |
| Opportunities page shows the market-data fallback (no model columns) | N/A, expected | Nothing has been **scored** yet. Run `enrich` then `score` (or wait for the daily cron) |
| Track Record shows the empty state | N/A, expected | No markets have **resolved** yet (`resolutions` table empty for scored tickers). Accrues automatically as `settle` runs after markets close |
| Login fails for the admin account | `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars | Re-run `npm run db:seed` locally against the same `DATABASE_URL`, or check the env vars match what was seeded |
| A data-quality drop rate looks high | `enrich` run's `meta` in `pipeline_runs` | `dropRate` in `retrieveNews` — high values mean the relevance filter is discarding most retrieved news; check the threshold in `modules/news/relevance.ts` against real query results |

## Data integrity checks

- `market_snapshots`, `llm_assessments`, and `scores` are **append-only** —
  never updated or deleted. If you ever see an `UPDATE`/`DELETE` against
  these tables in application code, that's a bug against the spec (`02 §4`).
- Every `scores` row stamps `config_version`, `assessment_id`, and
  `snapshot_id` — changing weights in Settings never mutates old scores,
  it only affects what new `score` runs produce.
- Category exclusions (crypto, sports) live in the active config's
  `thresholds.excluded_categories` and are enforced at `ingest` time.

## Cost verification (do before enabling live keys)

1. Check current Anthropic pricing for `claude-sonnet-5` at
   platform.claude.com/docs (pricing page).
2. Check current Tavily pricing at tavily.com.
3. Record both, with the date checked, in `docs/COSTS.md`.
4. Confirm `thresholds.llm_daily_budget_usd` in Settings reflects what
   you're comfortable spending per day before the first live `enrich` run.
