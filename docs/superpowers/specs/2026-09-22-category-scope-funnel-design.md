# Category scope as a three-layer funnel

**Date:** 2026-09-22 · **Status:** revised after measuring enrich throughput — pending re-approval
**Touches:** `02 §5` (jobs), `03 §1` (Kalshi), `04` (candidate selection), `lib/services/config.ts`

## Problem

The operator wants four themes in scope — politics, economics, sports, climate (plus
elections, which is Kalshi's own bucket for electoral politics). The active config
(version 11) is a leftover Sports-only experiment, and the 2026-09-22 ingest run hit
the 300s function ceiling and was killed mid-flight, leaving run 32 orphaned.

The naive reading is "the universe is too big to load". The measurements say otherwise.

## Measured facts (2026-09-22, live API)

Walking `/events?status=open&with_nested_markets=true` took **23.1s for 61 pages** and
returned **113,274 active markets**. By category, with the count that clears the
existing `min_volume: 500` floor on 24h volume:

| Category | Markets | Vol 24h ≥ 500 | Events |
|---|---|---|---|
| Sports | 56,688 | 2,786 | 5,573 |
| Elections | 21,610 | 414 | 3,405 |
| Economics | 4,995 | 361 | 563 |
| Politics | 2,491 | 230 | 668 |
| Climate and Weather | 1,263 | 226 | 201 |
| **In-scope total** | **87,047** | **4,017** | **10,410** |

Whole-venue total across all categories: 5,577 markets clear the floor, out of 113,274.

Three conclusions follow:

1. **~95% of the universe has no 24h volume.** Illiquid markets cannot be traded at the
   quoted price and their spread eats any modelled edge, so storing them buys nothing.
   The filter that removes them is numeric, free, and needs no understanding of the text.
2. **The API walk is not the bottleneck** (23s). The per-market DB writes are: the
   2026-07-22 run wrote 12,330 markets in 218.7s, ≈16.9ms each across two round trips.
3. **Markets cluster into events.** Climate has 1,263 markets over 201 events, Economics
   4,995 over 563. These are one question repeated at different strike points ("high
   temperature in LA above 74°F / 75°F / 76°F"). Spending one LLM call per market wastes
   most of the budget re-answering the same question.

### Enrich throughput (last 12 full-length runs, `pipeline_runs`)

- **Every run stopped on the wall clock, never on budget** (`stoppedForTime: true` on all
  12). Average **11.8 assessments per run**. `enrich_top_k: 40` has never been reached.
- **21.6s per assessment**, processed strictly one after another.
- **$0.019 per assessment, all-in and metered** — below the $0.033 planning figure in
  `COSTS.md`, which the ledger now supersedes.

4. **Enrich is bound by time, not money.** On the free plan (one cron per day) the current
   code yields ~12 assessments/day — a 591-market sweep would take ~49 days, so each market
   would be re-examined only every seven weeks. Spend runs at ~$7/month against a ceiling
   the operator put at "a few tens of dollars": the money is there, the architecture cannot
   use it. Those 21.6s are almost entirely waiting on two network calls (news search, LLM),
   so running assessments concurrently is close to free throughput.

## Decision: a three-layer funnel

Each layer is materially cheaper than the next, so the expensive layer only ever sees a
small, deliberately chosen set.

**Layer 1 — ingest wide, store narrow.** Walk every open market (23s), persist only those
clearing a configurable 24h-volume floor. At 500 that is ~4,017 markets: ≈68s of writes,
≈91s total, comfortably inside `maxDuration = 300`. **This alone fixes the current
timeout** — no write batching required.

**Layer 2 — select for analysis.** Of the stored universe, only Politics and Economics are
eligible for the paid pass: **591 liquid markets**. Rank with the existing
`volume × time_decay(close) × staleness` formula, then cap markets per event so one event's
nine strike points cannot consume nine of the day's forty slots.

*Elections is deliberately excluded from analysis*, although it is stored. Kalshi files
electoral races separately from "Politics", and Elections is one of the two categories where
the first calibration data shows the model tying the market with negative mean net edge
(n=13 — too small to be conclusive). Adding it is a one-line config change that would lift
the pool to 1,005 and stretch the sweep to ~25 days.

**Layer 3 — analyse, narrowly, concurrently.** Four assessments in flight at once lifts a
single 240s run from ~12 to ~44, so the daily cron reaches the intended 40 on the free plan.
The existing daily USD cap is unchanged.

### Why storage scope and analysis scope must be separate knobs

`excluded_categories` currently governs ingest only; `selectCandidates` reads **every**
active market regardless of category. Storing sports while not analysing it therefore
needs a second, independent setting. Conflating them would either stop sports appearing
in the UI or hand it the entire enrich budget on volume alone.

## Changes

1. **`ingest_min_volume`** — new zod field in `lib/services/config.ts`, default 500.
   `runIngest` skips markets below it (counted in `meta`, not as failures).
2. **`enrich_categories`** — new zod field, an allowlist, default `["Politics", "Economics"]`.
   `selectCandidates` filters to it. Empty array means "no category filter", so the field
   is opt-in and old config rows keep parsing.
3. **New config row** with `excluded_categories` set to everything except the five in
   scope, crypto included in the exclusions. Written as a new row, never a mutation.
4. **Fix the snapshot query in `selectCandidates`** *(scaling bug, found while designing
   this)*. It currently selects every snapshot for every active ticker — `inArray` over
   the full ticker list, ordered by `captured_at desc` — and reduces to the latest per
   ticker in JavaScript. That is 68,687 rows today and grows by the size of the stored
   universe on every ingest. Replace with a single `DISTINCT ON (ticker) … ORDER BY
   ticker, captured_at DESC`. Without this, daily ingest breaks candidate selection within
   weeks — the same Neon response-cap failure mode as the queries already hardened.
5. **`enrich_max_per_event`** — new zod field, default 2, applied during ranking.
6. **Concurrent assessments** — new zod field `enrich_concurrency`, default 4. `runEnrich`
   runs a small worker pool instead of a sequential loop. Both guards move to *dispatch*
   time: no new task starts once the wall-clock budget or the daily USD cap is reached;
   tasks already in flight finish. Consequences, stated so they are deliberate:
   - **Time invariant holds unchanged.** In-flight tasks run in parallel, so the worst case
     is still `enrich_max_seconds + 60s LLM timeout = 300s`, not four times that.
   - **Budget can overshoot by at most `concurrency − 1` assessments** (≈$0.06 at 4). The
     cap is a daily guard, not an exact limit; this is acceptable and documented.
   - **Writes need no coordination.** Each task appends its own `llm_assessments`,
     `news` and `market_news` rows; nothing is read-modify-written.
   - **Rate limits.** Four concurrent requests is modest for both Anthropic and Tavily.
     A 429 surfaces as a per-market failure (already counted), not a run abort.

## Structure

Extract the ranking and capping into a **pure** `modules/enrich/select.ts`:

```
rankCandidates(rows: CandidateInput[], opts: { topK, maxPerEvent, categories }): Candidate[]
```

`run.ts` keeps the I/O (queries, LLM, news) and calls this for the decision. The rule that
decides where money goes then unit-tests with hand-built fixtures and no database, matching
how `modules/scoring` is treated. `CandidateInput` carries `eventTicker`, already stored on
`markets`.

The worker pool is likewise a small generic helper (`runPool(items, concurrency, shouldStart,
task)`), testable with fake tasks and a fake clock — independent of news or the LLM.

## Cost

At the metered $0.019 per assessment, 40/day is ≈$0.76/day ≈ **$23/month**, well inside the
operator's ceiling. 591 liquid Politics + Economics markets at 40/day is a full sweep in
~15 days, after which staleness drives re-assessment. The existing $10/day cap remains the
backstop.

**The free Vercel plan is sufficient — but only with change 6.** Without concurrency the
daily cron delivers ~12 assessments, not 40. With it: politics and economics resolve over
weeks or months, so a daily refresh is proportionate. A same-day market (weather, most
sports) would need sub-daily crons — those are stored and displayed but not analysed, so the
plan limit is not binding. Revisit only if same-day markets enter the analysis scope.

## Out of scope (recorded so it is not re-litigated)

- **Write batching.** Unnecessary once the volume floor lands. Held in reserve if ingest
  time creeps up; note `ON CONFLICT DO UPDATE` would then need within-batch ticker dedup
  and a per-row fallback to preserve today's fault tolerance.
- **Vector search / embeddings.** A real use exists — matching news to markets, and
  detecting that N markets are one question — but it is not the current bottleneck and the
  numeric filter is cheaper and more predictable. Defer.
- **MCP.** A protocol for exposing tools to assistants; it does not move this bottleneck.
- **Re-fitting model weights.** Gated on the `04 §9` decision rule. At n=81, with the
  apparent edge resting on 11 Sports markets in a single series, nowhere near the bar.

## Tuning levers, once running

- Sports is 2,786 of the ~4,017 stored markets (69%) for a category that is barely analysed,
  costing write time rather than money. If ingest time creeps toward the ceiling, the clean
  move is a higher floor for Sports specifically rather than dropping it.
- `ingest_min_volume` widens or narrows the stored universe in one config write; the
  measured cost of 500 is ~4,017 markets.

## Acceptance

- Ingest completes inside 300s and ends `ok`, not orphaned at `running`.
- Stored markets span all five categories; none below the volume floor.
- Enrich candidates are drawn only from Politics and Economics, at most 2 per event.
- `selectCandidates` issues no query whose row count scales with total snapshot history.
- `rankCandidates` is pure and unit-tested with hand-computed fixtures.
- A single enrich run completes ≥ 35 assessments inside the wall-clock budget, still ending
  within 300s, with daily spend never exceeding the cap by more than `concurrency − 1`
  assessments.
