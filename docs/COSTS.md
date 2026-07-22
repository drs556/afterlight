# Afterlight Edge — Verified Costs (Spec 03 companion)

**Verified:** 2026-07-22 · Fulfills the "record verified numbers in `docs/COSTS.md`" requirement in `03_DATA_SOURCES.md §Pricing caution`.

> These are the **verified** unit prices and derived run/monthly costs, replacing the planning ballparks in `03_DATA_SOURCES.md §5`. Re-verify on each provider's pricing page before any plan change and bump the "Verified" date above.

---

## 1. What actually costs money

Only **`enrich`** spends money, and it is **manual-only** (Runs page "Run now" — no cron). `ingest`, `score`, and `settle` are free. In fixture mode (no API keys set) everything is **$0**.

| Dependency | Billable? | Live when set | Rate (verified 2026-07-22) |
|---|---|---|---|
| Kalshi API | **No — $0** | `KALSHI_API_KEY_ID` + `KALSHI_API_PRIVATE_KEY` | Market data included with account. Confirmed live 2026-07-22. |
| GDELT 2.0 | **No — $0** | always on (free backstop) | Free, no key. |
| Tavily search | **Yes** | `TAVILY_API_KEY` | Basic search = **1 credit**; **$0.008/credit** PAYG, or bundled in plans below. |
| Anthropic (LLM) | **Yes** | `ANTHROPIC_API_KEY` | `claude-sonnet-5`: **$3 / $15** per M input/output tokens (standard). |

---

## 2. Anthropic (LLM assessments)

- **Model:** `claude-sonnet-5` (`src/modules/llm/cost.ts`).
- **Verified pricing:** **$3.00 / M input, $15.00 / M output** (standard). An **intro rate of $2 / $10** applies through **2026-08-31**; the cost guard deliberately uses the higher standard rate so it errs conservative.
- **Per assessment** (planning shape from `03 §3`: ~6k input + ~1k output tokens):

  | Rate | Input (6k) | Output (1k) | **Per assessment** |
  |---|---|---|---|
  | Standard ($3/$15) | $0.018 | $0.015 | **~$0.033** |
  | Intro ($2/$10, until 2026-08-31) | $0.012 | $0.010 | **~$0.022** |

- **Per enrich run** (`enrich_top_k = 40` markets, one assessment each): **~$1.32** standard (~$0.88 intro).
- **Actual cost is metered, not estimated:** each assessment records real `tokensIn`/`tokensOut` and `cost_usd` into `llm_assessments` + `pipeline_runs`. The estimates above are for planning only.

---

## 3. Tavily (news search)

- **Usage pattern:** one **basic** search (`search_depth: "basic"` in `tavily-client.ts`) per candidate market = **1 credit/market**. GDELT is queried alongside for free.
- **Per enrich run** (40 markets): **40 credits**.
- **Verified plans (2026-07-22):**

  | Plan | Price | Credits | Effective |
  |---|---|---|---|
  | Free | $0 | 1,000 / mo | ~25 enrich runs/mo free |
  | Pay-as-you-go | — | — | $0.008 / credit → **$0.32 / enrich run** |
  | Researcher | $30 / mo | 4,000 / mo | ~100 enrich runs/mo |
  | Growth | $500 / mo | 100,000 / mo | $0.005 / credit |

  Sources: [coldiq.com/blog/tavily-pricing](https://coldiq.com/blog/tavily-pricing), [costbench.com/software/web-scraping/tavily](https://costbench.com/software/web-scraping/tavily/).

---

## 4. The budget guard (why you can't overspend)

`runEnrich` reads `llm_daily_budget_usd` from config (**default $10/day**), sums today's enrich `cost_usd` from `pipeline_runs`, and **stops before starting any assessment that would cross the cap** (`src/modules/enrich/run.ts`). At ~$0.033/assessment, $10 covers ~300 assessments/day — well above the 40-market `enrich_top_k`. Since enrich is manual-only, spend happens only when you click "Run now".

---

## 5. Monthly cost scenarios

| Scenario | Anthropic | Tavily | Infra | **Total / mo** |
|---|---|---|---|---|
| **Fixture mode** (no keys) | $0 | $0 | $0 | **$0** |
| **Light** (1 enrich run/day, 40 markets) | ~$40 (metered; ~$26 at intro rate) | Free tier covers ~25 runs; else Researcher $30 | Vercel Hobby $0 + Neon free $0 | **~$40–70** |
| **Scaled** (sub-daily crons on Pro, higher `enrich_top_k`) | budget-capped at $10/day → **≤ $300** | Researcher $30 or Growth $500 | Vercel Pro ~$20 + Neon ~$19 | **~$80–850** (dominated by Anthropic, hard-capped by the guard) |

Infra is $0 today (Vercel Hobby + Neon free tier); the Pro/paid figures apply only when you outgrow the free tiers.

---

## 6. Re-verification checklist

Before committing to any paid plan or raising the budget guard:

1. Confirm `claude-sonnet-5` per-token rates at platform.claude.com (watch the 2026-08-31 intro-rate expiry).
2. Confirm Tavily credit price + plan credits at tavily.com/pricing.
3. Confirm Neon and Vercel tier limits if traffic has grown.
4. Update the rates in `src/modules/llm/cost.ts` **and** this file, and bump the "Verified" date.
