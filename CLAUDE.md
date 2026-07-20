# CLAUDE.md — Afterlight Edge

Decision-support web app for trading **Kalshi event markets** (politics, economics, culture/media — **not** crypto, **not** sports). It ingests markets, enriches them with news + LLM analysis, scores a fee-adjusted edge, and shows a ranked list of opportunities. **It recommends; it never trades.**

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

Next.js 14+ App Router · TypeScript strict · Vercel (+ Vercel Cron) · Neon Postgres + Drizzle ORM · Auth.js (credentials, single seeded admin) · Tailwind + shadcn/ui + Recharts · Zod at every boundary · Anthropic API (`claude-sonnet`) for enrichment · Vitest + Playwright.

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
