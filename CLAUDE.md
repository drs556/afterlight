# CLAUDE.md — Afterlight Edge

Decision-support web app for trading **Kalshi event markets** (MVP thesis: politics, economics, culture/media — **not** crypto, **not** sports). It ingests markets, enriches them with news + LLM analysis, scores a fee-adjusted edge, and shows a ranked list of opportunities. **It recommends; it never trades.** Category scope is config-driven (`excluded_categories`); post-MVP the operator expanded it to test **Climate** and **Sports** — efficient markets where little edge is expected (crypto stays excluded). See `docs/00 §1` Post-MVP scope note.

## Current status (see `docs/STATUS.md` for detail)

- **Built & merged to `main`:** M0–M4. **MVP complete and LIVE** on real data — see `docs/STATUS.md` for the full picture and `05_ROADMAP.md` for the post-MVP backlog.
- **Deployed & live:** `afterlight-mu.vercel.app` (Hobby). DB is Neon. **All three external keys (Kalshi, Tavily, Anthropic) are set on Vercel Production → the deployed app runs in full live mode.** First live run: 12,334 markets ingested (Elections + Climate), 85 scored, 3 actionable. **Local `.env` has only the Kalshi keys**, so local `npx tsx` runs use fixtures for news/LLM.
- **Fixture pattern still governs** every external dependency: real HTTP client + fixture client behind one interface + `getX()` selector picking by env presence. Keep this for any new dependency.
- **Kalshi live client verified** (was the one unverified piece). Fixing it surfaced **three spec-drift bugs** now documented in `docs/03 §1`: dollar-string prices (`yes_bid_dollars`), title-less combo markets, fractional `*_fp` volumes. Per-market parsing is fault-tolerant.
- **Roles:** `admin` / `viewer`. Mutations (Settings writes, "Run now" jobs) are gated server-side by `requireAdmin()` in `lib/authz.ts`. Add users with `npm run db:add-user` (`NEW_USER_ROLE` defaults to admin).
- **`enrich` is manual-only** (Runs page "Run now") — the only job that spends money, and it's **resumable**: a wall-clock budget (`enrich_max_seconds`) stops it before the serverless timeout; stalest-first ranking means re-running continues. `ingest`/`score`/`settle` run on cron (free). Vercel Hobby caps crons at **once/day** (`vercel.json` daily; restore sub-daily on Pro).
- **Neon 64MB response cap:** never `findMany` a table with a large `raw`/jsonb column across the whole market universe — select only needed columns. Hot-path queries already do this.

## Conventions established (follow these)

- **Jobs:** each has a pure-ish body (`runIngest`/`runEnrich`/`runScore`/`runSettle`), wrapped by `withRun()` (ledger in `pipeline_runs`), exposed at `/api/jobs/<name>` (guarded by `CRON_SECRET` bearer) AND a session-authed "Run now" server action. `modules/scoring` & `modules/calibration` stay **pure** (no I/O) — put their job orchestrators in `lib/services/*` so coverage isn't polluted.
- **Config:** `getActiveConfig()` returns the latest `config_versions` row; new fields go in the zod schema in `lib/services/config.ts` with defaults (so old rows still parse). Settings writes a **new** row, never mutates.
- **Append-only:** never update/delete `market_snapshots`, `llm_assessments`, `scores`.
- **Verify against Neon:** each milestone was smoke-tested with a throwaway `_x-smoke.ts` at repo root (`npx tsx`, then delete). Restore config to seed defaults after tests that insert config rows.
- **Spec drift recorded:** `04 §4` (temperature omitted — Sonnet rejects it) and `02 §5` (enrich manual) are documented deviations. If you deviate, update the spec in the same change.

## How we work: spec-driven development

The `docs/` folder is the source of truth. **Read the relevant spec before writing code, and match it exactly.**

| Doc | When to read it |
|---|---|
| `docs/00_OVERVIEW.md` | Scope, thesis, success criteria, guiding principles |
| `docs/01_PRODUCT_SPEC.md` | Screens, flows, UX rules, visual design |
| `docs/02_ARCHITECTURE.md` | Stack, repo layout, data model, jobs, eng standards |
| `docs/03_DATA_SOURCES.md` | Kalshi API, news APIs, LLM, costs, data-quality rules |
| `docs/04_ALGORITHM_SPEC.md` | Signals, blending, fees, edge, ranking, sizing, calibration |
| `docs/05_ROADMAP.md` | Milestones M0–M4 and acceptance criteria |

**Golden rule: spec drift is a bug.** If implementation must deviate from a spec, update the spec in the **same** change. Don't invent behavior the specs don't describe; if a spec is ambiguous or silent, ask rather than guess.

### Working a task
1. Identify which milestone (`05`) the work belongs to. Milestones are sequential — don't start one before the previous one's acceptance criteria pass.
2. Read the specs the task touches. Note the exact rules, defaults, and thresholds.
3. Implement the smallest thing that satisfies the spec — no speculative abstraction.
4. Verify against the milestone's **acceptance criteria** before calling it done.

## Stack (decided — don't substitute)

Next.js 14+ App Router · TypeScript strict · Vercel (+ Vercel Cron) · Neon Postgres + Drizzle ORM · Auth.js (credentials, seeded admin + `admin`/`viewer` roles — mutations gated by `requireAdmin` in `lib/authz.ts`) · Tailwind + shadcn/ui + Recharts · Zod at every boundary · Anthropic API (`claude-sonnet`) for enrichment · Vitest + Playwright.

## Repo layout

```
src/
  app/        # Next routes — thin: parse → call service → render
  modules/    # Business logic, NO framework imports
    kalshi/ news/ llm/ scoring/ calibration/ runs/
  db/         # Drizzle schema + migrations + seed
  components/ # dumb, typed props
  lib/        # env (zod), auth, logger, dates, money
tests/  e2e/  drizzle/  docs/
```
**Dependency direction:** `app → modules → db/lib`. `modules/scoring` and `modules/calibration` are **pure** (no I/O) so they unit-test trivially — that's where correctness matters most.

## Non-negotiables

- **Read-only toward Kalshi.** No order-placement code path may exist in the MVP.
- **Immutable prediction log.** `market_snapshots`, `llm_assessments`, `scores` are append-only — never updated or deleted (calibration integrity). Every `scores` row stamps its `config_version`, `assessment_id`, `snapshot_id`.
- **Fees are part of the model.** Never display an edge without fee adjustment. Nothing is actionable below **5 pp net edge** (8 pp for longshot buys per `04 §3.4`).
- **Honest by construction.** Always show the market-price baseline; never hide "no edge yet". Weights change only via the `04 §9` decision rule, never hand-tuned.
- **Zod at every boundary** — Kalshi, news, LLM output, forms, env. LLM JSON: retry once on schema failure, then mark the assessment failed. Never guess.
- **Jobs are idempotent, resumable, isolated.** A news-API outage must not block ingestion. Design for `small batch + cursor + reschedule`.
- **Every external record stores its `raw` payload + retrieval timestamp.** No lookahead: only news published before the assessment timestamp may enter it.
- **Never log** secrets, keys, or password hashes.

## Engineering standards

- TypeScript strict; no `any` without an inline justification comment.
- Conventional Commits; small PRs; `main` always deployable. CI runs typecheck, lint, unit tests, migration check.
- `modules/scoring` & `modules/calibration` ≥ 90% branch coverage with hand-computed fixtures (fee math, Kelly caps, Brier).
- The app must run end-to-end in dev with fixtures and zero external calls.
- All money `numeric`, probabilities `double precision` in [0,1], timestamps `timestamptz` UTC.

## Product rules that are easy to get wrong

- Numbers are the interface: probabilities in %, 1 decimal; edges in pp with explicit sign; tabular monospace numerals. Every model number links to its explanation.
- Below-threshold rows are shown but visually de-emphasized and labeled — never implied to be trades.
- Every data panel shows its age; stale/degraded data is flagged. The app stays usable read-only even when enrichment jobs fail.
- Build the "signal desk" design in `01 §5` exactly (dark low-glare palette, edge-gauge signature element) — no generic template.
