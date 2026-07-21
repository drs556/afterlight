# Afterlight Edge — Architecture & Engineering Standards (Spec 02)

**Version:** 1.0 · Depends on: `00_OVERVIEW.md`, `01_PRODUCT_SPEC.md`

---

## 1. Stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript (strict)** | One codebase for UI + API routes + server jobs; first-class on Vercel |
| Hosting | **Vercel** (Hobby → Pro) | GitHub Pages is static-only: no server, cron, DB, or secrets. Vercel gives serverless functions + Vercel Cron + env secrets with zero ops |
| Database | **Neon Postgres** (serverless) + **Drizzle ORM** | Relational fits markets/snapshots/predictions; Drizzle = typed schema + SQL migrations checked into the repo |
| Auth | **Auth.js (NextAuth)**, credentials provider, single seeded admin | Minimal, replaceable, session cookies (httpOnly, secure) |
| UI | **Tailwind CSS + shadcn/ui + Recharts** | Fast, consistent, accessible primitives; theme per `01_PRODUCT_SPEC.md §5` |
| Validation | **Zod** everywhere data crosses a boundary (API responses, LLM outputs, forms, env) | Fail loudly at the edges |
| Scheduling | **Vercel Cron** hitting internal job endpoints protected by a `CRON_SECRET` bearer token | No extra infra. If job duration exceeds serverless limits, escalate per §6 |
| LLM | **Anthropic API (claude-sonnet)** for enrichment | See `03_DATA_SOURCES.md` for cost model |
| Observability | Structured JSON logs; `pipeline_runs` table as first-class run ledger; Vercel log drains later | Runs page (`01 §3.4`) is built on this table |
| Tests | **Vitest** (unit) + **Playwright** (a few critical E2E flows) | See §8 |

**Language note:** MVP is TypeScript-only, including the scoring math — it keeps one runtime, one deploy, one type system. A separate Python research workspace (backtesting notebooks) may be added post-MVP; it must read from the same Postgres, never own its own data.

## 2. System diagram

```
             Vercel Cron (schedules)
                     │  (Bearer CRON_SECRET)
                     ▼
  ┌───────────── Next.js app (Vercel) ─────────────┐
  │  /api/jobs/ingest    → Kalshi API (read-only)  │
  │  /api/jobs/enrich    → News APIs + Anthropic   │
  │  /api/jobs/score     → pure functions (§5)     │
  │  /api/jobs/settle    → Kalshi resolutions      │
  │  UI routes (RSC)     → reads via services      │
  └───────────────┬────────────────────────────────┘
                  ▼
           Neon Postgres (single source of truth)
```

Rules: jobs are **idempotent** (safe to re-run), **resumable** (cursor/state in DB), and **isolated** (a news-API outage must not block ingestion). The UI never calls external APIs directly — it only reads our DB.

## 3. Repository layout (monorepo, single app)

```
afterlight-edge/
├── src/
│   ├── app/                    # Next.js routes (thin: parse → call service → render)
│   │   ├── (app)/opportunities/ …markets/[ticker]/ …track-record/ …runs/ …settings/
│   │   ├── login/
│   │   └── api/jobs/{ingest,enrich,score,settle}/route.ts
│   ├── modules/                # Business logic. NO framework imports here.
│   │   ├── kalshi/             # API client, DTOs, mappers
│   │   ├── news/               # search clients, dedup, relevance filter
│   │   ├── llm/                # prompts (versioned), zod output schemas, caller w/ retries
│   │   ├── scoring/            # PURE functions: blending, fees, kelly, ranking (04 spec)
│   │   ├── calibration/        # brier, log-loss, curves, paper PnL
│   │   └── runs/               # run ledger helpers
│   ├── db/                     # drizzle schema + migrations + seed
│   ├── components/             # UI components (dumb, typed props)
│   └── lib/                    # env (zod-validated), auth, logger, dates, money
├── tests/                      # mirrors src/modules
├── e2e/
├── drizzle/                    # generated migrations (committed)
├── .env.example                # every variable documented, no real values
└── docs/                       # these spec files live in the repo
```

**Dependency direction:** `app → modules → db/lib`. `modules/scoring` and `modules/calibration` must be pure (no I/O) so they are trivially unit-testable — this is where correctness matters most.

## 4. Data model (Drizzle/Postgres)

Core tables (columns indicative; agent finalizes types in schema):

- **users** (id, email, password_hash, role) — one row for now.
- **markets** (ticker PK, event_ticker, series_ticker, title, category, rules_summary, resolution_source, close_time, status, kalshi_url, raw jsonb, timestamps).
- **market_snapshots** (id, ticker FK, captured_at, yes_bid, yes_ask, yes_mid, volume, open_interest, spread, raw jsonb). Append-only. Index (ticker, captured_at).
- **news_items** (id, url unique, source, headline, published_at, snippet, raw jsonb).
- **market_news** (market_ticker, news_id, relevance_score, retrieved_at).
- **llm_assessments** (id, ticker, snapshot_id, prompt_version, model, p_estimate, p_low, p_high, rationale jsonb {thesis, evidence_for[], evidence_against[], change_triggers[]}, citations jsonb, tokens_in/out, cost_usd, created_at). Append-only.
- **scores** (id, ticker, snapshot_id, assessment_id, config_version, p_market, p_model, p_model_low, p_model_high, fee_adjusted_cost, net_edge, confidence_tier, kelly_full, kelly_used, size_capped_reason, ranking_score, actionable bool, created_at). **Append-only — this is the immutable prediction log.**
- **resolutions** (ticker, resolved_at, outcome, settlement_source).
- **config_versions** (id, weights jsonb, thresholds jsonb, created_at, note) — every settings change inserts a new row; scores reference it.
- **pipeline_runs** (id, job, status, started_at, finished_at, items_ok, items_failed, cost_usd, error text, meta jsonb).

Non-negotiables: snapshots/assessments/scores are never updated or deleted (calibration integrity). Money `numeric`, probabilities `double precision` in [0,1], all timestamps `timestamptz` UTC.

## 5. Jobs

| Job | Default cadence | What it does |
|---|---|---|
| `ingest` | every 30 min | Pull open Kalshi markets in included categories; upsert `markets`; append `market_snapshots`. Cursor-paginated; partial failure tolerated |
| `enrich` | **manual for MVP** (prioritized) | For top-K candidate markets (by liquidity, proximity to close, staleness): fetch news, dedupe, then one LLM assessment per market. **Budget-guarded**: hard daily cost cap from config; skip-and-log when exceeded. **Updated M2:** run on-demand via the Runs page "Run now" button rather than on a cron, since it is the only job that spends money (news + LLM APIs, ~$1–2/run). Re-add a Vercel cron entry to automate once cost is trusted. |
| `score` | after ingest & enrich | Recompute `scores` for markets having fresh snapshot (+ latest assessment); pure functions per `04_ALGORITHM_SPEC.md` |
| `settle` | hourly | Detect resolved markets; write `resolutions`; trigger calibration metric refresh |

Prioritization for `enrich` (cost control): score candidates by `volume × time_decay(close_time) × staleness`, take top K (config, default 40/run).

## 6. Known platform limits & escape hatches

- Vercel serverless max duration may be insufficient for large enrich batches → design jobs as **small batch + cursor + reschedule** (self-invoking until done) from day one.
- If cron granularity/duration becomes blocking: move jobs to a tiny worker (Railway/Fly.io) hitting the same DB — module structure (§3) makes this a deploy change, not a rewrite.
- Neon free-tier autosuspend cold starts: acceptable for MVP; note in runbook.

## 7. Security & secrets

- All secrets in Vercel env vars, validated at boot by `lib/env.ts` (zod). `.env.example` documents every variable.
- Job endpoints require `Authorization: Bearer ${CRON_SECRET}`; UI/API routes require session auth server-side.
- Kalshi credentials: **data access only**; the codebase must contain no order-placement code paths (MVP guardrail).
- Rate limiting on `/login`; password hashed with argon2/bcrypt; no PII beyond the admin email.
- Never log secrets, full LLM prompts with keys, or password hashes.

## 8. Engineering standards (hard requirements)

1. **TypeScript strict**, no `any` without an inline justification comment. ESLint + Prettier enforced in CI.
2. **Conventional Commits**; small PRs; `main` always deployable; CI (GitHub Actions) runs typecheck, lint, unit tests, and migration check on every push.
3. **Tests**: `modules/scoring` and `modules/calibration` ≥ 90% branch coverage with hand-computed fixture cases (fee math, Kelly caps, Brier). External APIs wrapped in clients with recorded-fixture tests. 3 Playwright flows: login, opportunities render with seeded data, market detail render.
4. **Zod at every boundary**: Kalshi responses, news responses, LLM JSON output (retry once on schema failure, then mark assessment failed — never guess).
5. **Errors**: typed Result/error objects in modules; routes map them to correct HTTP codes; every failure lands in `pipeline_runs` or the log with context.
6. **Docs-as-code**: these specs live in `/docs`; any deviation during implementation requires updating the spec in the same PR ("spec drift is a bug").
7. **Seed script** creates the admin user, default `config_versions` row, and category exclusions (crypto, sports) so a fresh clone reaches a working state with one command.
