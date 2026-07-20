# Afterlight Edge — Product Spec (Spec 01)

**Version:** 1.0 · Depends on: `00_OVERVIEW.md` · Feeds: `02_ARCHITECTURE.md`

---

## 1. Users and access

- **Single user for MVP: `admin`.** Authentication via email + password (credentials provider), session-based. No sign-up flow; the admin account is seeded via environment variables / a seed script.
- All routes except `/login` require an authenticated session. API routes must enforce auth server-side (never trust the client).
- Schema and auth layer must be written so that adding more users later is a migration, not a rewrite (users table from day one, even with one row).

## 2. Information architecture

```
/login
/(app)
  /opportunities        ← home: ranked recommendations
  /markets/[ticker]     ← market detail
  /track-record         ← calibration & paper PnL
  /runs                 ← pipeline run history & health
  /settings             ← weights, thresholds, filters
```

## 3. Screens

### 3.1 Opportunities (home)

**Job:** answer "where does the model disagree with Kalshi profitably, right now?" in under 10 seconds.

- **Ranked table**, sorted by `ranking_score` descending (definition in `04_ALGORITHM_SPEC.md §6`). Columns:
  1. Rank
  2. Market (title + category badge + time to close)
  3. Market price (YES mid, in cents)
  4. Model probability `p_model` (with ± uncertainty band)
  5. **Net edge** (percentage points, after fees; color-coded sign)
  6. Confidence tier (High / Medium / Low, derived from uncertainty + data freshness)
  7. Suggested size (% of bankroll from fractional Kelly, with the cap applied noted)
  8. Data freshness (relative time of last enrichment)
- **Actionability rule rendered visually:** rows with net edge < 5 pp are visible but visually de-emphasized and labeled "Below threshold" — the list must never imply those are trades. This is a hard product rule, not a style choice.
- Filters: category, time-to-resolution bucket, min volume, only-actionable toggle (default ON).
- Row click → market detail.
- Header shows: bankroll value (manually set in Settings), timestamp of last successful pipeline run, and a warning banner if the last run failed or data is older than the configured staleness limit.

### 3.2 Market detail

**Job:** let the admin audit *why* the model believes what it believes before risking money.

Sections, in order:
1. **Verdict card**: market price vs. `p_model`, net edge after fees, confidence tier, suggested Kelly size (showing the math: full Kelly `f*`, ×0.15 fraction, cap applied). If below threshold, the card states plainly: "Below the 5 pp actionable threshold — estimation noise, not signal."
2. **Signal breakdown**: table of each sub-signal (market prior, LLM/news estimate, base rate), its raw value, its weight, and its contribution in log-odds. No black boxes.
3. **Reasoning**: the LLM's structured rationale (thesis, key evidence for/against, what would change the estimate), with **linked news citations** (source, headline, published time).
4. **Price history chart**: YES mid price over time from our snapshots; overlay our historical `p_model` for this market so divergence is visible.
5. **Market facts**: rules summary, resolution source, close time, volume, open interest, spread, link out to the market on Kalshi.
6. **Prediction log for this market**: every stored snapshot of our estimate (immutable), so post-resolution review is possible.

### 3.3 Track record

**Job:** keep us honest. This page is the reason the MVP exists.

- **Headline metrics** (computed over resolved markets with logged predictions): our Brier score vs. **market-price baseline Brier score**, count of resolved predictions, log loss, hypothetical paper PnL if every actionable recommendation had been taken at the logged price with the suggested size (fees included).
- **Calibration curve**: predicted probability (binned) vs. realized frequency, ours and the market's on the same axes.
- **Breakdown table** by category and by confidence tier: n, Brier ours, Brier market, mean net edge realized.
- Empty state (before enough resolutions): show progress toward the 200-prediction target and explain what will appear. An empty screen is an invitation, not a dead end.

### 3.4 Runs

- List of pipeline runs (ingest / enrich / score) with status, duration, items processed, errors, and cost incurred (LLM tokens, search API calls) per run.
- A "Run now" button per job (server-triggered, idempotent, disabled while running).

### 3.5 Settings

- Bankroll amount (manual input; used only for sizing display).
- Signal weights and thresholds (see `04_ALGORITHM_SPEC.md §8` for which parameters are exposed). Every change is versioned — scores store which config version produced them.
- Category include/exclude list (crypto and sports excluded by default and the exclusion shipped as seed config).
- Staleness limits and cron cadence display (read-only view of schedule).

## 4. UX standards (hard requirements)

1. **Server-rendered first.** Data-heavy pages render on the server; no spinner-then-table waterfalls for the primary content. Use streaming/suspense for slow secondary panels.
2. **Numbers are the interface.** Probabilities always in %, one decimal. Edges in percentage points with explicit sign. Money in USD. Every number that came from a model links to its explanation.
3. **State is always visible**: last-updated timestamps on all data panels; degraded/stale data clearly flagged. Never show a number without its age.
4. **Empty, loading, and error states designed for every screen.** Errors say what happened and what to do; they never apologize and are never vague.
5. **Keyboard and accessibility floor**: visible focus states, semantic HTML, color is never the only carrier of meaning (edge sign also shown as +/−), respects `prefers-reduced-motion`, WCAG AA contrast.
6. **Responsive** down to 380 px (table collapses to cards on mobile).
7. **Copy voice**: plain verbs, sentence case, no filler. Buttons say exactly what they do ("Run enrichment", not "Submit"). Consistent vocabulary: it's always "market", "model probability", "net edge", "run" — one name per concept across the whole app.

## 5. Visual design direction

The subject is a quiet trading instrument, not a crypto dashboard. Deliberate direction — build exactly this, do not substitute a generic template:

- **Concept: "signal desk."** Calm, dense, print-influenced financial interface. The single signature element is the **edge column treatment**: net edge rendered as a typographic figure with a thin horizontal gauge beneath it (filled proportionally to edge, capped at 20 pp), the one place color saturates on the page.
- **Palette (dark, low-glare):** background `#0E1116`; surface `#161B22`; hairline borders `#262D37`; primary text `#E6E9EE`; muted text `#8A93A2`; positive edge `#3FB68B`; negative edge `#D26A5C`; single accent for interactive elements `#7AA2F7`. No gradients, no glassmorphism, no glow.
- **Typography:** display/UI: `Inter` (tight tracking for headings); **all numerals in a tabular monospace** (`IBM Plex Mono`) so columns of figures align — this is the personality of the app. Type scale: 13 px base for tables, 15 px body, restrained heading sizes.
- **Layout:** full-width data table with generous row height (44 px), hairline row dividers, sticky header; detail pages in a 2-column layout (content 2/3, facts rail 1/3) collapsing to single column on mobile.
- **Motion:** essentially none. Only 120 ms opacity/position transitions on hover and panel reveal; nothing animates numbers.

## 6. Non-functional product requirements

- Opportunities page interactive < 2 s on a warm load with 200 markets.
- All times displayed in the admin's local timezone with UTC on hover.
- The app must remain fully usable (read-only) even if enrichment jobs are failing — stale data with warnings beats a broken page.
