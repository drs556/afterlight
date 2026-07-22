# Afterlight Edge — Project Overview (Spec 00)

**Version:** 1.0 · **Status:** Approved for build · **Audience:** AI coding agent + founding team

---

## 1. What we are building

**Afterlight Edge** is an internal decision-support web application for trading **Kalshi event markets** (politics, economics, culture, media — explicitly **not** crypto price markets and **not** sports for the MVP).

The app continuously ingests Kalshi markets, enriches each one with historical price data and recent news, runs a probability-estimation algorithm, and presents a **ranked list of opportunities**. Markets at the top of the list are the ones where the algorithm has the **highest confidence that its estimated probability diverges profitably from the market price after fees**.

The app does **not** place trades. It recommends. A human (the admin user) decides and executes manually on Kalshi. Automated execution is out of scope for the MVP.

## 2. Why (thesis)

Per the Afterlight blueprint: event markets (elections, policy, culture) remain the least bot-saturated segment of prediction markets because pricing them requires interpreting unstructured information. Our edge hypothesis: a disciplined pipeline that combines (a) market history/microstructure, (b) news retrieval + LLM-based qualitative analysis, and (c) historical base rates can produce probability estimates that are better-calibrated than Kalshi's mid price often enough to be profitable **after Kalshi's fees**, which are material (~2¢/contract + spread; round-trip friction near 50/50 markets can reach 14–18%).

Everything in the MVP must serve one question: **"Is our estimated probability measurably better than the market's, out of sample?"** The app is simultaneously the recommendation tool and the instrument that collects the evidence to answer that question (prediction logging, Brier score, calibration curves, paper PnL).

## 3. MVP scope (in)

1. **Ingestion**: scheduled sync of open Kalshi event markets (metadata, prices, order book summary, volume) into our own database, with historical snapshots.
2. **Enrichment**: per-market news retrieval (search API + free sources) and LLM qualitative probability estimation with structured reasoning output.
3. **Scoring**: combine signals into `p_model`, compute fee-adjusted net edge, uncertainty, and a ranking score. Suggested position size via 15% fractional Kelly with hard caps (3% per position, 8% per underlying event cluster).
4. **App**: authenticated single-admin web UI —
   - **Opportunities** (home): ranked table of markets by score.
   - **Market detail**: model probability vs. market price, reasoning, cited news, price history chart, sizing suggestion.
   - **Track record**: Brier score, calibration curve, paper-portfolio PnL, per-category reliability.
   - **Settings**: signal weights, thresholds, category filters, run controls.
5. **Prediction log**: every scored snapshot is stored immutably so calibration can be computed after markets resolve.

## 4. Out of scope (MVP)

- Automated order placement / any write access to Kalshi.
- Crypto price markets, sports markets.
- Polymarket, cross-venue arbitrage.
- Multi-user accounts, roles, billing (single admin user only; the schema should not preclude adding users later).
- On-chain treasury, smart contracts, multisig — entirely separate from this app.
- Mobile native apps (responsive web is enough).

## 5. Success criteria for the MVP

| # | Criterion | Target |
|---|---|---|
| 1 | End-to-end pipeline runs unattended | Ingest → enrich → score → rank on a schedule with zero manual steps, with alerting on failure |
| 2 | Every recommendation is auditable | Each ranked market shows its inputs: news citations, sub-signal values, weights, fee model, timestamp |
| 3 | Calibration measurable out of sample | ≥ 200 logged predictions on resolved markets; Brier score and calibration curve computed automatically and compared against the "market price as forecast" baseline |
| 4 | The model must beat the baseline to matter | Primary metric: our Brier score < market-price Brier score on the same resolved markets. If it doesn't, the honest output of the MVP is "no edge yet" |
| 5 | Fee-aware | Net edge uses Kalshi's real fee schedule; no recommendation is marked actionable below a **5 percentage-point net-edge threshold** (per blueprint §4.3) |

## 6. Hosting decision (resolves the GitHub vs. Vercel question)

**GitHub Pages cannot host this app.** It serves static files only: no server, no scheduled jobs, no database, no secret storage — all of which this system requires. Decision:

- **Code + CI**: GitHub (private repo, GitHub Actions for lint/test).
- **App hosting**: **Vercel** (Next.js, serverless functions, Vercel Cron for scheduled jobs). Free Hobby tier is enough to start; expect to move to Pro (~US$20/mo) when cron frequency/execution limits bite.
- **Database**: **Neon** serverless Postgres (free tier to start).

Full rationale and alternatives in `02_ARCHITECTURE.md`.

## 7. Document map

| File | Contents |
|---|---|
| `00_OVERVIEW.md` | This file — scope, thesis, success criteria |
| `01_PRODUCT_SPEC.md` | Screens, flows, UI/UX standards, design direction |
| `02_ARCHITECTURE.md` | Stack, repo layout, data model, jobs, engineering standards |
| `03_DATA_SOURCES.md` | Kalshi API, news APIs, costs, rate limits, licensing cautions |
| `04_ALGORITHM_SPEC.md` | Signals, probability blending, edge & fee math, ranking, calibration, sizing |
| `05_ROADMAP.md` | Build milestones M0–M4 and acceptance criteria per milestone |
| `STATUS.md` | **Live build status** — what's actually done, deployment, runtime modes, known gaps |
| `RUNBOOK.md` | Operations — schedules, budget caps, failure playbook, cost verification |
| `COSTS.md` | Verified unit prices + per-run/monthly cost scenarios (companion to `03 §5`) |

## 8. Guiding principles for the coding agent

1. **Honest by construction.** The system must make it easy to discover that the model has no edge. Never hide the baseline comparison; never overwrite historical predictions.
2. **Everything logged, everything reproducible.** Every model run stores its inputs, prompt versions, weights, and outputs.
3. **Small and concrete over big and vague.** Prefer the simplest implementation that satisfies the spec; no speculative abstractions.
4. **Fees are part of the model, not a footnote.** No edge number is ever displayed without fee adjustment.
5. **Read-only toward Kalshi.** The app must never hold order-placement capability in the MVP; API credentials used should be scoped to data access.
