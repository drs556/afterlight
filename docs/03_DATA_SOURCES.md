# Afterlight Edge — Data Sources, APIs & Costs (Spec 03)

**Version:** 1.0 · Depends on: `00_OVERVIEW.md` · Feeds: `04_ALGORITHM_SPEC.md`

> **Pricing caution:** all prices below are planning ballparks and change frequently. Before committing to any paid plan, the implementer must verify current pricing and terms on each provider's site and record the verified numbers in `docs/COSTS.md` in the repo.

---

## 1. Kalshi (primary, required)

- **What:** official Kalshi Trade API (REST + WebSocket). Market discovery, order books, trades, series/event metadata, settlement data.
- **Access:** requires a verified Kalshi account; API keys generated from the account. Market data access comes with the account — no separate data fee expected.
- **Use in MVP:** REST polling only (WebSocket is a post-MVP optimization). Endpoints needed: list events/markets (filtered by category/status), market detail, order book, trades, and settlement/resolution status.
- **Constraints to engineer for:** rate limits (respect documented tier; client must implement backoff + request budget per run), pagination cursors, and the fact that category taxonomy is Kalshi's — our include/exclude config maps onto their categories and must be reviewed when they add new ones.
- **Legal note:** we consume data for internal decision support; no redistribution. Keep credentials data-scoped (no trading permissions) per `02 §7`.
- **Cost: $0** expected for API usage at MVP scale.

## 2. News & qualitative sources

Strategy: **one paid search API as the workhorse + one free bulk source as backstop**, unified behind `modules/news` with a common `NewsItem` shape, dedup by canonical URL/title similarity.

### 2.1 Primary: LLM-oriented search API (pick ONE at build time)

| Option | Model | Ballpark cost | Notes |
|---|---|---|---|
| **Tavily** | per-request search built for AI agents | ~US$0.005–0.01/search; entry paid tiers ~US$30/mo | Simplest integration, returns clean snippets |
| **Exa** | neural search, strong recency filters | usage-based, similar order of magnitude | Better semantic matching of odd market titles |
| NewsAPI.org | classic news index | free dev tier is delayed/limited; business tier expensive (hundreds US$/mo) | Only if the other two fail evaluation |

**Default decision: Tavily**, revisit after M2 (roadmap). Budget assumption: 40 markets/enrich run × ~2 searches × 4 runs/day ≈ **~320 searches/day ≈ US$1.5–3/day**.

### 2.2 Backstop (free): GDELT 2.0 API

Global news metadata, free, high volume, noisier. Used for volume/velocity features (how much coverage a topic is getting, spike detection) rather than for reading articles. Rate-limit friendly polling only.

### 2.3 Explicitly deferred (post-MVP)

X/Twitter API (expensive, ToS-sensitive), Reddit API, Telegram/Discord scraping. The blueprint lists them; the MVP does not need them to answer its core question, and scraping introduces legal/ToS risk we don't take on now. Add only after the calibration loop proves the pipeline works.

## 3. LLM (Anthropic API)

- **Model:** `claude-sonnet` class for enrichment (cost/quality balance). One assessment call per market per enrich cycle, JSON-schema-constrained output (see `04 §4`).
- **Cost model (planning):** assume ~6k input tokens (market rules + news snippets + prompt) and ~1k output tokens per assessment. At sonnet-class pricing this lands around **US$0.02–0.04 per assessment** → 40 markets × 4 runs/day ≈ **US$3–6/day ≈ US$90–180/mo** at full cadence. Verify against current pricing.
- **Hard budget guard:** `enrich` reads a daily USD cap from config (default **US$10/day**), tracks spend in `pipeline_runs.cost_usd`, and stops with a logged warning when exceeded. Cost per run is surfaced in the Runs screen.
- **Prompt versioning:** every prompt template has a `prompt_version` string stored with each assessment; changing a prompt bumps the version. Calibration must be comparable within a version.

## 4. Historical / base-rate data

- **Primary:** our own `market_snapshots` + `resolutions` accumulate history from day one — the system gets smarter by existing.
- **Series base rates:** many Kalshi event markets recur (weekly/monthly series). The `settle` job aggregates per-series resolution frequencies (e.g., "how often does this series resolve YES") to feed the base-rate signal (`04 §3.3`).
- **Bootstrap:** if Kalshi's API exposes historical settlement/candlestick data for past markets, `ingest` runs a one-time backfill for included categories to seed base rates before we have our own history. If not available, base-rate signal starts at zero weight and grows as data accrues (the blending design in `04 §5` handles this).

## 5. Monthly cost summary (planning)

| Item | MVP est. |
|---|---|
| Vercel | $0 → US$20/mo (Pro when needed) |
| Neon Postgres | $0 → ~US$19/mo when out of free tier |
| Kalshi API | $0 |
| Tavily (or Exa) | ~US$30–90/mo |
| GDELT | $0 |
| Anthropic API | ~US$90–180/mo at full cadence (capped by budget guard) |
| **Total** | **~US$120–310/mo** |

Per the blueprint, infrastructure costs are fronted by the CEO and reimbursed from the 10% infrastructure reserve once there is net profit — these numbers are the input to that conversation.

## 6. Data-quality rules (all sources)

1. Every external record stores its `raw` payload (jsonb) + retrieval timestamp — reprocessing must never require re-fetching.
2. News dedup before LLM: canonical-URL match, then title similarity (normalized Levenshtein/token overlap ≥ 0.85 collapses to one item, keep earliest).
3. Relevance filter before LLM: cheap lexical match between market title/rules keywords and headline+snippet; drop items below threshold and log the drop rate per run.
4. Clock discipline: only news published **before** the assessment timestamp may enter an assessment (no lookahead — this preserves backtest validity).
5. Every source client lives behind an interface with a fixture-based test double; the app must run end-to-end in dev with fixtures and zero external calls.
