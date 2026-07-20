# Afterlight Edge — Algorithm Spec (Spec 04)

**Version:** 1.0 · Depends on: `00_OVERVIEW.md`, `03_DATA_SOURCES.md` · Implemented in `modules/scoring` + `modules/llm` + `modules/calibration` (pure functions, per `02 §3`)

---

## 0. Design stance

The market price is a **strong prior**, not noise. Kalshi event markets are competitive; our default belief about any market is the market's own price. The algorithm's job is to detect the minority of markets where fresh information or systematic bias justifies deviating — and to say **how sure it is**. Consequences:

1. All blending happens in **log-odds space** and **shrinks toward the market price**.
2. The output is a distribution, not a point: `p_model` with an uncertainty interval.
3. Nothing is "actionable" below a **5 pp net-edge threshold after fees** (blueprint §4.3). Below that, model error > signal.
4. Every scored estimate is logged immutably before we know the outcome — the calibration loop (§9) is part of the algorithm, not an afterthought.

## 1. Universe selection (which markets get scored)

A market enters the candidate set iff all hold:
- Category ∈ included set (events: politics, economics/announcements, culture/media; **crypto & sports excluded**).
- Status open; time to close between **6 hours and 90 days** (too close = news-race territory we lose; too far = dead capital).
- Liquidity floor: 24h volume ≥ `min_volume` (config, default 500 contracts) AND spread ≤ `max_spread` (default 8¢). Illiquid markets can look like huge "edges" that are actually just wide spreads.
- Rules are self-contained (no market whose resolution source we can't identify from metadata; flagged for manual review instead).

## 2. Notation

For a market's YES contract: `bid`, `ask`, mid `m = (bid+ask)/2` in [0,1]. `logit(x) = ln(x/(1−x))`. All probabilities clamped to [0.01, 0.99] before logit.

## 3. Signals

### 3.1 Market prior `S_mkt`
`S_mkt = logit(m)` from the latest snapshot. Also computed: 24h momentum `Δm`, and spread (used in confidence, §7 — a widening spread means the market itself is uncertain).

### 3.2 LLM/news estimate `S_llm`
See §4. Yields `p_llm`, interval `[p_low, p_high]`, structured rationale, citations. `S_llm = logit(p_llm)`.

### 3.3 Base rate `S_base`
For recurring series: empirical YES frequency of the last `n` resolutions of the same series, with Laplace smoothing `(k+1)/(n+2)`. `S_base = logit(p_base)`, available only when `n ≥ 8`; otherwise the signal is absent (its weight is renormalized away, §5).

### 3.4 Favorite–longshot guard (bias correction, not a signal)
Prediction markets systematically overprice longshots and underprice near-certainties. Rather than modeling this in MVP, we encode it as an asymmetric caution rule: recommendations that **buy YES below 10¢ or NO above 90¢** require net edge ≥ **8 pp** (instead of 5) to be actionable. This prevents the pipeline's most likely failure mode: the LLM "discovering" cheap longshots.

## 4. LLM assessment contract

One call per market per enrich cycle. Input: market title, full rules summary, resolution source, close time, current price (**stated explicitly so the model must argue against the market, not in a vacuum**), deduped relevant news (max 12 items: source, headline, published time, snippet), and today's date.

Output (JSON, zod-validated, retry once on schema failure then fail the assessment):
```json
{
  "p_yes": 0.0,
  "p_low": 0.0,
  "p_high": 0.0,
  "thesis": "one-paragraph position",
  "evidence_for": ["..."],
  "evidence_against": ["..."],
  "change_triggers": ["what news would move this estimate"],
  "citation_ids": [1, 4],
  "self_check": {
    "is_resolution_criterion_clear": true,
    "does_estimate_rely_on_info_after_cutoff": false,
    "key_uncertainty": "..."
  }
}
```
Prompt rules (encode in the versioned template): reason about the **resolution criterion literally as written** (Kalshi resolves on rules text, not vibes); distinguish "will happen eventually" from "will happen before close"; state base rates when the event type is recurring; widen `[p_low, p_high]` when evidence is thin; never exceed the interval the evidence supports.

**Sampling (updated M2):** the original spec called for temperature 0–0.3, but the current `claude-sonnet` class rejects any `temperature` parameter (HTTP 400). The `temperature` field is therefore omitted, and extended thinking is disabled, so per-assessment cost stays within the ~US$0.02–0.04 estimate the daily budget guard (`03 §3`) depends on. Determinism/consistency is steered through the prompt instead. Implemented in `modules/llm` (`AnthropicLlmClient`).

## 5. Blending

Weights `w = (w_mkt, w_llm, w_base)` from active `config_versions`, defaults **(0.55, 0.30, 0.15)**; renormalize over present signals.

```
L = w_mkt·S_mkt + w_llm·S_llm + w_base·S_base
p_model = sigmoid(L)
```
Interval propagation (MVP-simple): run the same blend with `p_low`/`p_high` in place of `p_llm` to get `p_model_low`, `p_model_high`.

Deliberate humility: with default weights, even a maximally divergent LLM view moves the estimate a bounded distance from the market. Weights are re-fit **only** from our own resolved-prediction log (§9), never by hand-tuning to make the list "look better".

## 6. Fees, net edge, ranking

### 6.1 Fee-adjusted cost
Implement Kalshi's **official published fee schedule** as `fees(price, contracts)` in one pure function with fixture tests taken from Kalshi's own documentation/examples (do not hardcode an approximation; the blueprint's "~2¢ + spread, 14–18% round trip near 50/50" is the sanity check the tests should reproduce, not the formula). Effective entry cost for buying YES at ask:
```
c_adj = ask + fee_per_contract(ask) + exit_friction
```
where `exit_friction` (config, default 1¢) reserves for early-exit spread cost; symmetric for NO at `1 − bid`.

### 6.2 Net edge (direction chosen automatically)
```
edge_yes = p_model − c_adj_yes
edge_no  = (1 − p_model) − c_adj_no
net_edge = max(edge_yes, edge_no)   // direction = argmax
```
Actionable iff `net_edge ≥ 0.05` (or `0.08` under §3.4) **and** confidence tier ≠ Low.

### 6.3 Ranking score
Rank by evidence-weighted edge, a t-statistic-like quantity:
```
u = max(p_model_high − p_model, p_model − p_model_low)   // one-sided uncertainty
ranking_score = net_edge / (u + 0.02)                    // floor keeps it bounded
```
Ties broken by liquidity (higher volume first). Non-actionable rows keep their score but are de-emphasized (product rule, `01 §3.1`).

## 7. Confidence tier

- **High:** `u ≤ 0.06` AND ≥ 3 relevant news items AND snapshot age ≤ 2h AND spread ≤ 4¢
- **Medium:** `u ≤ 0.12` AND snapshot age ≤ 6h
- **Low:** otherwise (never actionable)

## 8. Position sizing (display only — the app never trades)

Full Kelly for a binary contract at adjusted cost `c` with estimated probability `p` (blueprint §4.3):
```
f* = (p − c) / (1 − c)
f_used = 0.15 × f*
```
Caps applied in order, with the binding cap named in the UI: (1) 3% of bankroll per position; (2) 8% aggregate across markets in the same **event cluster** (same event_ticker/series or same real-world driver — clustering by event_ticker in MVP). Bankroll is the manual Settings value.

## 9. Calibration loop (the point of the MVP)

On every `settle` run, for each newly resolved market join all its logged `scores` rows and compute, per config_version and prompt_version:
- **Brier:** mean of `(p_model − outcome)²`; **baseline Brier** with `p = m` (market mid at the same timestamp) on the identical set. Also log loss.
- **Calibration curve:** 10 bins of `p_model` vs. realized frequency (and same for market).
- **Paper PnL:** for every snapshot that was actionable, simulate entry at `ask` (or `1−bid` for NO) with `f_used` sizing, fees included, held to resolution.
- **Slice metrics:** by category, confidence tier, edge bucket.

**Decision rule (honest by construction):** the model earns weight increases (`w_llm` up, Kelly fraction up) only when its Brier beats the market baseline on ≥ 200 resolved predictions with a bootstrap 95% interval excluding zero difference. Until then, defaults stand. If after 200 the model *loses* to the baseline, the correct product output is that conclusion, prominently displayed on Track Record.

## 10. Failure modes engineered against

| Failure | Mitigation |
|---|---|
| LLM anchors on stale/absent news | freshness gates (§7), clock discipline (`03 §6.4`), `change_triggers` surfaced in UI |
| Cheap-longshot mirage | asymmetric threshold (§3.4) |
| Wide-spread "phantom edge" | liquidity floor (§1), `c_adj` uses ask not mid, exit friction |
| Overconfident point estimates | interval required from LLM; ranking divides by uncertainty |
| Self-deception via tuning | immutable scores log; config_version stamped on every score; weight changes gated by §9 decision rule |
| Correlated positions look independent | 8% event-cluster cap (§8) |
