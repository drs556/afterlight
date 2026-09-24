# Category Scope Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store liquid markets across Politics, Economics, Elections, Sports and Climate; analyse only Politics + Economics, at most two per event, four at a time — so ingest finishes inside 300s and enrich reaches ~40 assessments/day on the free Vercel plan.

**Architecture:** Three layers, each cheaper than the next. Ingest walks every open market but persists only those above a 24h-volume floor (pure `classifyForIngest`). Enrich candidates come from a pure `rankCandidates` fed by bounded queries (latest snapshot via `DISTINCT ON`, never snapshot history). Assessments run through a small pure worker pool whose guards act only when a task *starts*. New config fields ship with defaults; every config writer carries unedited fields forward.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Drizzle ORM 0.33 on `neon-http` · Zod · Vitest 2 · Vercel Hobby cron.

**Design spec:** `docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md` (read it first — it holds the measurements every number below comes from).

## Global Constraints

- Stack is fixed (CLAUDE.md "Stack"). TypeScript strict; no `any` without an inline justification comment.
- Pure modules (`src/modules/enrich/select.ts`, `src/modules/enrich/pool.ts`, `src/modules/kalshi/ingest-filter.ts`, `src/lib/config-schema.ts`) import **nothing** that touches the DB or env — tests import them without `DATABASE_URL`. Importing `@/db` from a test fails with `Invalid environment configuration`.
- `market_snapshots`, `llm_assessments`, `scores` are append-only: never UPDATE or DELETE them.
- Config is append-only: write a **new** `config_versions` row; never mutate one.
- **Never run `runEnrich` locally.** Local `.env` points at the production Neon DB while news/LLM fall back to fixtures (no `ANTHROPIC_API_KEY` locally), so a local run writes fake assessments into the immutable calibration log. Local smoke checks may only *read*.
- Spec drift is a bug: each task updates the docs its behaviour touches, in the same commit.
- Exact values: `ingest_min_volume` = 500 · `enrich_categories` = `["Politics","Economics"]` · `enrich_max_per_event` = 2 · `enrich_concurrency` = 4 (integer 1–8) · `MAX_SNAPSHOT_AGE_HOURS` = 36 · `MIN_HOURS_TO_CLOSE` = 6 · `maxDuration` = 300 on ingest/enrich/settle · `enrich_max_seconds` = 240.
- Shell is Git Bash on Windows. Run tests with `npx vitest run <path>`. Throwaway scripts are `_x-smoke.ts` at the repo root, run with `npx tsx _x-smoke.ts`, then deleted.
- Commit messages use Conventional Commits and end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/config-schema.ts` (new) | Zod schemas for thresholds/weights + `applyThresholdsPatch`. Pure. |
| `src/lib/services/config.ts` | `getActiveConfig()` only; imports schemas from above. |
| `src/app/(app)/settings/actions.ts` | Settings save — now carries unedited fields forward. |
| `src/db/config-patch.ts` (new) | CLI: append a config row from a committed JSON patch. |
| `config/patches/2026-09-24-category-scope-funnel.json` (new) | The scope change itself, as an audited file. |
| `src/modules/kalshi/ingest-filter.ts` (new) | `classifyForIngest` — which markets ingest stores. Pure. |
| `src/modules/kalshi/ingest.ts` | Walk + store, using the filter. |
| `src/modules/enrich/select.ts` (new) | `rankCandidates` — where enrich money goes. Pure. |
| `src/modules/enrich/pool.ts` (new) | `runPool` — bounded concurrency with start-time guards. Pure. |
| `src/modules/enrich/run.ts` | I/O: bounded candidate queries, per-market assessment, pooled run. |
| `vercel.json` | Daily schedules, 2h apart, enrich added. |

---

### Task 1: Config schema module and carry-forward config writers

**Files:**
- Create: `src/lib/config-schema.ts`
- Modify: `src/lib/services/config.ts` (whole file)
- Modify: `src/app/(app)/settings/actions.ts` (the `saveSettings` insert, ~lines 48–66)
- Create: `src/db/config-patch.ts`
- Create: `config/patches/2026-09-24-category-scope-funnel.json`
- Modify: `package.json` (add one script)
- Modify: `CLAUDE.md` (the `- **Config:**` bullet)
- Test: `tests/lib/config-schema.test.ts`

**Interfaces:**
- Produces: `thresholdsSchema`, `weightsSchema`, `type Thresholds`, `type Weights`, `applyThresholdsPatch(current: Thresholds, patch: Record<string, unknown>): Thresholds` from `@/lib/config-schema`. `Thresholds` gains `ingest_min_volume: number`, `enrich_categories: string[]`, `enrich_max_per_event: number`, `enrich_concurrency: number`. `ActiveConfig` keeps its shape (`{ id, weights, thresholds }`).

**Why the Settings change is in scope:** `saveSettings` writes only the form's fields plus `excluded_categories`. Every save therefore resets `max_days_to_close` (540 in production) to the default 90 and `enrich_max_seconds` to 240, and would silently erase every field this plan adds.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/config-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyThresholdsPatch, thresholdsSchema } from "@/lib/config-schema";

// Shape of config_versions row 11 in production (2026-07-24), which predates
// every ingest_*/enrich_* field added by the category-scope funnel.
const row11 = {
  max_spread: 0.08,
  min_volume: 500,
  bankroll_usd: 10000,
  enrich_top_k: 40,
  net_edge_min: 0.05,
  exit_friction: 0.01,
  max_days_to_close: 540,
  enrich_max_seconds: 240,
  excluded_categories: ["Crypto", "Politics"],
  llm_daily_budget_usd: 10,
  net_edge_min_longshot: 0.08,
};

describe("thresholdsSchema", () => {
  it("parses a pre-funnel row and fills the new fields with their defaults", () => {
    const t = thresholdsSchema.parse(row11);
    expect(t.ingest_min_volume).toBe(500);
    expect(t.enrich_categories).toEqual(["Politics", "Economics"]);
    expect(t.enrich_max_per_event).toBe(2);
    expect(t.enrich_concurrency).toBe(4);
    expect(t.max_days_to_close).toBe(540);
  });

  it("bounds enrich_concurrency to integers 1..8", () => {
    for (const bad of [0, 9, 2.5]) {
      expect(thresholdsSchema.safeParse({ ...row11, enrich_concurrency: bad }).success).toBe(false);
    }
    expect(thresholdsSchema.safeParse({ ...row11, enrich_concurrency: 8 }).success).toBe(true);
  });

  it("requires at least one market per event", () => {
    expect(thresholdsSchema.safeParse({ ...row11, enrich_max_per_event: 0 }).success).toBe(false);
  });
});

describe("applyThresholdsPatch", () => {
  const current = thresholdsSchema.parse(row11);

  it("carries forward every field the patch does not mention", () => {
    // The Settings form used to rewrite only its own fields, silently resetting
    // max_days_to_close from 540 to the default 90 on every save.
    const next = applyThresholdsPatch(current, { min_volume: 800 });
    expect(next.min_volume).toBe(800);
    expect(next.max_days_to_close).toBe(540);
    expect(next.excluded_categories).toEqual(["Crypto", "Politics"]);
  });

  it("replaces arrays wholesale rather than merging them", () => {
    const next = applyThresholdsPatch(current, { excluded_categories: ["Crypto"] });
    expect(next.excluded_categories).toEqual(["Crypto"]);
  });

  it("rejects unknown field names so a typo cannot silently no-op", () => {
    expect(() => applyThresholdsPatch(current, { enrich_categoreis: ["Politics"] })).toThrow(
      /enrich_categoreis/,
    );
  });

  it("validates the merged result", () => {
    expect(() => applyThresholdsPatch(current, { enrich_concurrency: 20 })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/config-schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/config-schema'`.

- [ ] **Step 3: Create the schema module**

Create `src/lib/config-schema.ts`. The first eleven fields are moved verbatim from `src/lib/services/config.ts`; the last four are new:

```ts
import { z } from "zod";

// Config schemas (docs/02 §4). Pure — no DB or env imports — so tests and
// scripts can use them without a database. New fields MUST carry a default so
// older config_versions rows keep parsing (CLAUDE.md "Config").

export const thresholdsSchema = z.object({
  net_edge_min: z.number().default(0.05),
  net_edge_min_longshot: z.number().default(0.08),
  min_volume: z.number().default(500),
  max_spread: z.number().default(0.08),
  exit_friction: z.number().default(0.01),
  excluded_categories: z.array(z.string()).default([]),
  // Enrich-eligibility upper bound on time-to-close (docs/04 §1). Long-dated
  // markets (e.g. elections) may warrant a wider window than short-term ones.
  max_days_to_close: z.number().default(90),
  // Enrichment controls (docs/02 §5, docs/03 §3).
  llm_daily_budget_usd: z.number().default(10),
  enrich_top_k: z.number().default(40),
  // Wall-clock budget per enrich invocation (docs/02 §5 — small batch +
  // reschedule). Enrich stops cleanly before this so it never hits the Vercel
  // function timeout; re-running continues with the still-stale markets.
  // Invariant: this + the 60s per-call LLM timeout must be <= the route's
  // maxDuration (300s in app/api/jobs/enrich/route.ts). Raising it past 240
  // requires raising maxDuration too.
  enrich_max_seconds: z.number().default(240),
  // Bankroll for sizing display only — the app never trades (docs/01 §3.5).
  bankroll_usd: z.number().default(10000),
  // Storage floor for ingest (docs/02 §5): markets whose 24h volume is below
  // this are walked but not stored. ~95% of Kalshi's open universe has none.
  ingest_min_volume: z.number().min(0).default(500),
  // Allowlist of categories eligible for the paid enrich pass (docs/04 §1),
  // case-insensitive; empty = no category filter. Separate from
  // excluded_categories, which scopes what ingest *stores*.
  enrich_categories: z.array(z.string()).default(["Politics", "Economics"]),
  // Markets per Kalshi event per enrich run, so one event's strike ladder
  // cannot consume the run's slots (docs/04 §1).
  enrich_max_per_event: z.number().int().min(1).default(2),
  // Assessments in flight at once (docs/03 §3). Each is ~22s of mostly
  // network wait, so concurrency is near-free throughput.
  enrich_concurrency: z.number().int().min(1).max(8).default(4),
});

export const weightsSchema = z.object({
  w_mkt: z.number(),
  w_llm: z.number(),
  w_base: z.number(),
});

export type Thresholds = z.infer<typeof thresholdsSchema>;
export type Weights = z.infer<typeof weightsSchema>;

/**
 * Next thresholds for a new config row: `current` with `patch` applied.
 * Every field the patch doesn't name is carried forward; arrays are replaced,
 * not merged. Unknown names throw (a typo must not silently no-op), and the
 * result is re-validated.
 */
export function applyThresholdsPatch(
  current: Thresholds,
  patch: Record<string, unknown>,
): Thresholds {
  const known = new Set(Object.keys(thresholdsSchema.shape));
  const unknown = Object.keys(patch).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown threshold field(s): ${unknown.join(", ")}`);
  }
  return thresholdsSchema.parse({ ...current, ...patch });
}
```

- [ ] **Step 4: Point the config service at it**

Replace the whole of `src/lib/services/config.ts` with:

```ts
import { db } from "@/db";
import { thresholdsSchema, weightsSchema, type Thresholds, type Weights } from "@/lib/config-schema";

export interface ActiveConfig {
  id: number;
  weights: Weights;
  thresholds: Thresholds;
}

/** Latest config_versions row (the active config). Throws if unseeded. */
export async function getActiveConfig(): Promise<ActiveConfig> {
  const row = await db.query.configVersions.findFirst({
    orderBy: (c, { desc }) => desc(c.createdAt),
  });
  if (!row) throw new Error("No config_version found — run the seed script");
  return {
    id: row.id,
    weights: weightsSchema.parse(row.weights),
    thresholds: thresholdsSchema.parse(row.thresholds),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/config-schema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Make Settings carry fields forward**

In `src/app/(app)/settings/actions.ts`, add to the imports:

```ts
import { applyThresholdsPatch } from "@/lib/config-schema";
```

Then replace the block from `const current = await getActiveConfig();` through the closing `});` of the `db.insert(schema.configVersions)` call with:

```ts
  const current = await getActiveConfig();
  const { w_mkt, w_llm, w_base, ...formThresholds } = parsed;

  await db.insert(schema.configVersions).values({
    weights: { w_mkt, w_llm, w_base },
    // Carry every field the form doesn't edit (max_days_to_close, enrich_*,
    // ingest_*, excluded_categories, …) forward. Writing only the form's
    // fields silently reset them to their defaults on every save.
    thresholds: applyThresholdsPatch(current.thresholds, formThresholds),
    note: "settings update",
  });
```

Leave the two `revalidatePath` calls after it unchanged.

- [ ] **Step 7: Add the config-patch CLI**

Create `src/db/config-patch.ts`:

```ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { applyThresholdsPatch, thresholdsSchema, weightsSchema } from "../lib/config-schema";

/**
 * Append a config_versions row that changes only the named thresholds and
 * carries everything else forward (config is append-only — CLAUDE.md):
 *
 *   npm run db:config-patch -- config/patches/<file>.json
 *
 * The file is { "note": string, "thresholds": { ...fields } }. Patch files are
 * committed, so git holds the audit trail of every scope change. Unknown field
 * names are rejected. Prints the resulting diff.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const path = process.argv[2];
  if (!path) throw new Error("usage: npm run db:config-patch -- <patch.json>");

  const file = JSON.parse(readFileSync(path, "utf8")) as { note?: unknown; thresholds?: unknown };
  if (typeof file.note !== "string" || file.note.trim() === "") {
    throw new Error('patch needs a non-empty "note"');
  }
  if (!file.thresholds || typeof file.thresholds !== "object" || Array.isArray(file.thresholds)) {
    throw new Error('patch needs a "thresholds" object');
  }

  const db = drizzle(neon(url), { schema });
  const current = await db.query.configVersions.findFirst({
    orderBy: (c, { desc }) => desc(c.createdAt),
  });
  if (!current) throw new Error("No config_version found — run the seed script");

  const before = thresholdsSchema.parse(current.thresholds);
  const after = applyThresholdsPatch(before, file.thresholds as Record<string, unknown>);

  const [row] = await db
    .insert(schema.configVersions)
    .values({ weights: weightsSchema.parse(current.weights), thresholds: after, note: file.note })
    .returning({ id: schema.configVersions.id });

  console.log(`config_versions ${current.id} -> ${row!.id}: ${file.note}`);
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) console.log(`  ${key}: ${a} -> ${b}`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
```

Register it:

Run: `npm pkg set "scripts.db:config-patch=tsx src/db/config-patch.ts"`
Expected: no output; `package.json` now lists `"db:config-patch": "tsx src/db/config-patch.ts"`.

- [ ] **Step 8: Add the scope patch file (applied in Task 8, not now)**

Create `config/patches/2026-09-24-category-scope-funnel.json`. `excluded_categories` lists every open-market category measured on 2026-09-22 except the five in scope; crypto stays excluded. The new fields are written explicitly so the row is self-describing:

```json
{
  "note": "category scope funnel (docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md): store Politics, Economics, Elections, Sports, Climate and Weather above a 500 24h-volume floor; enrich Politics + Economics only",
  "thresholds": {
    "excluded_categories": [
      "Financials",
      "Entertainment",
      "Crypto",
      "Commodities",
      "Science and Technology",
      "Mentions",
      "Companies",
      "Social",
      "World",
      "Health",
      "AI",
      "Transportation",
      "Business"
    ],
    "ingest_min_volume": 500,
    "enrich_categories": ["Politics", "Economics"],
    "enrich_max_per_event": 2,
    "enrich_concurrency": 4
  }
}
```

Do **not** run the script yet: the deployed code still has no ingest floor, so widening scope now would make the daily ingest time out harder.

- [ ] **Step 9: Update CLAUDE.md**

Run:

```bash
python3 - <<'EOF'
import pathlib
p = pathlib.Path("CLAUDE.md")
lines = p.read_text(encoding="utf-8").split("\n")
i = next(i for i, l in enumerate(lines) if l.startswith("- **Config:**"))
lines[i] += (" Every writer carries unedited fields forward via `applyThresholdsPatch`"
             " (`lib/config-schema.ts`): the Settings form, and `npm run db:config-patch --"
             " config/patches/<file>.json`, whose committed patch files are the audit trail"
             " of scope changes.")
p.write_text("\n".join(lines), encoding="utf-8")
EOF
grep -c "applyThresholdsPatch" CLAUDE.md
```

Expected: `1`.

- [ ] **Step 10: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all tests pass (110 existing + 7 new = 117), typecheck silent, `✔ No ESLint warnings or errors`.

```bash
git add src/lib/config-schema.ts src/lib/services/config.ts "src/app/(app)/settings/actions.ts" src/db/config-patch.ts config/patches/2026-09-24-category-scope-funnel.json package.json tests/lib/config-schema.test.ts CLAUDE.md
git commit -F - <<'EOF'
feat(config): add funnel fields and carry unedited fields forward

Adds ingest_min_volume, enrich_categories, enrich_max_per_event and
enrich_concurrency, each with a default so existing rows keep parsing.

Fixes Settings silently resetting fields it doesn't show: saveSettings wrote
only the form's fields, so every save reset max_days_to_close from 540 to
90. Both config writers now go through applyThresholdsPatch, which carries
everything else forward and rejects unknown field names.

Adds db:config-patch, which appends a row from a committed JSON patch, and
the category-scope patch itself (applied at rollout).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Ingest stores only liquid markets

**Files:**
- Create: `src/modules/kalshi/ingest-filter.ts`
- Modify: `src/modules/kalshi/ingest.ts:7-40` (`runIngest` and its doc comment)
- Modify: `docs/02_ARCHITECTURE.md` (the `` | `ingest` | `` row of the §5 jobs table)
- Modify: `CLAUDE.md` (insert a bullet after `- **Neon 64MB response cap:**`)
- Test: `tests/kalshi/ingest-filter.test.ts`

**Interfaces:**
- Consumes: `Thresholds.ingest_min_volume`, `Thresholds.excluded_categories` (Task 1).
- Produces: `type IngestDecision = "store" | "excluded" | "below_floor"`; `classifyForIngest(m: Pick<NormalizedMarket, "category" | "volume">, opts: { excluded: ReadonlySet<string>; minVolume: number }): IngestDecision`. `runIngest` meta becomes `{ skippedExcluded, skippedBelowFloor, minVolume }` — Task 8 reads `skippedBelowFloor` to detect the new deploy.

- [ ] **Step 1: Write the failing test**

Create `tests/kalshi/ingest-filter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyForIngest } from "@/modules/kalshi/ingest-filter";

// runIngest lower-cases excluded_categories before building this set.
const opts = { excluded: new Set(["crypto", "financials"]), minVolume: 500 };

describe("classifyForIngest", () => {
  it("stores a liquid market in an included category", () => {
    expect(classifyForIngest({ category: "Politics", volume: 1200 }, opts)).toBe("store");
  });

  it("stores a market exactly at the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: 500 }, opts)).toBe("store");
  });

  it("drops a market below the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: 499 }, opts)).toBe("below_floor");
  });

  it("treats unknown volume as below the floor", () => {
    expect(classifyForIngest({ category: "Politics", volume: null }, opts)).toBe("below_floor");
  });

  it("matches excluded categories case-insensitively", () => {
    expect(classifyForIngest({ category: "Crypto", volume: 500_000 }, opts)).toBe("excluded");
    expect(classifyForIngest({ category: "FINANCIALS", volume: 900 }, opts)).toBe("excluded");
  });

  it("reports exclusion ahead of the floor, so the two skip counts don't overlap", () => {
    expect(classifyForIngest({ category: "Crypto", volume: 3 }, opts)).toBe("excluded");
  });

  it("never excludes an uncategorized market by category", () => {
    expect(classifyForIngest({ category: null, volume: 900 }, opts)).toBe("store");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/kalshi/ingest-filter.test.ts`
Expected: FAIL — `Cannot find module '@/modules/kalshi/ingest-filter'`.

- [ ] **Step 3: Implement the filter**

Create `src/modules/kalshi/ingest-filter.ts`:

```ts
import type { NormalizedMarket } from "./types";

export type IngestDecision = "store" | "excluded" | "below_floor";

/**
 * Which open markets ingest persists (docs/02 §5). Pure.
 *
 * Excluded categories are dropped first; everything else must clear the 24h
 * volume floor. Measured 2026-09-22: 113,274 open markets, ~95% with no 24h
 * volume. Those can't be traded at the quoted price, so storing them only
 * costs write time — and ingest runs against a 300s function ceiling.
 * Unknown volume counts as below the floor.
 */
export function classifyForIngest(
  m: Pick<NormalizedMarket, "category" | "volume">,
  opts: { excluded: ReadonlySet<string>; minVolume: number },
): IngestDecision {
  if (m.category && opts.excluded.has(m.category.toLowerCase())) return "excluded";
  if (m.volume === null || m.volume < opts.minVolume) return "below_floor";
  return "store";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/kalshi/ingest-filter.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Use it in runIngest**

In `src/modules/kalshi/ingest.ts`, add the import:

```ts
import { classifyForIngest } from "./ingest-filter";
```

Replace the doc comment and body of `runIngest` (lines 7–40) with:

```ts
/**
 * Walk every open Kalshi market; store only those in stored categories whose
 * 24h volume clears `ingest_min_volume` — upsert `markets`, append
 * `market_snapshots` (docs/02 §5). Cursor-paginated, partial failure
 * tolerated: a single bad market increments itemsFailed rather than aborting.
 */
export async function runIngest(): Promise<RunResult> {
  const client = getKalshiClient();
  const { thresholds } = await getActiveConfig();
  const opts = {
    excluded: new Set(thresholds.excluded_categories.map((c) => c.toLowerCase())),
    minVolume: thresholds.ingest_min_volume,
  };

  let itemsOk = 0;
  let itemsFailed = 0;
  let skippedExcluded = 0;
  let skippedBelowFloor = 0;
  let cursor: string | undefined;

  do {
    const page = await client.listMarkets({ status: "open", cursor });
    for (const m of page.markets) {
      const decision = classifyForIngest(m, opts);
      if (decision === "excluded") {
        skippedExcluded++;
        continue;
      }
      if (decision === "below_floor") {
        skippedBelowFloor++;
        continue;
      }
      try {
        await upsertMarketWithSnapshot(m);
        itemsOk++;
      } catch {
        itemsFailed++;
      }
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return {
    itemsOk,
    itemsFailed,
    meta: { skippedExcluded, skippedBelowFloor, minVolume: opts.minVolume },
  };
}
```

Leave `upsertMarketWithSnapshot` unchanged. Dev mode is unaffected: every fixture open market has 24h volume ≥ 5,000.

- [ ] **Step 6: Update the spec and CLAUDE.md**

Run:

```bash
python3 - <<'EOF'
import pathlib
p = pathlib.Path("docs/02_ARCHITECTURE.md")
lines = p.read_text(encoding="utf-8").split("\n")
i = next(i for i, l in enumerate(lines) if l.startswith("| `ingest` |"))
lines[i] = ("| `ingest` | daily (Hobby) | Walk every open Kalshi market; **store only** those in a stored"
            " category (not in `excluded_categories`) whose 24h volume ≥ `ingest_min_volume`"
            " (config, default 500): upsert `markets`, append `market_snapshots`. ~95% of the open"
            " universe has no 24h volume and is walked but not stored (measured 2026-09-22: 113,274"
            " open, ~4,017 stored across the five in-scope categories). Cursor-paginated; partial"
            " failure tolerated |")
p.write_text("\n".join(lines), encoding="utf-8")

p = pathlib.Path("CLAUDE.md")
lines = p.read_text(encoding="utf-8").split("\n")
i = next(i for i, l in enumerate(lines) if l.startswith("- **Neon 64MB response cap:**"))
lines.insert(i + 1, "- **Ingest stores only liquid markets** (`ingest_min_volume`, default 500 on 24h"
             " volume): it walks ~113k open markets (~23s) and stores ~4k. **Storage scope**"
             " (`excluded_categories`) and **analysis scope** (`enrich_categories`) are separate"
             " knobs — a category can be stored and shown without being analysed.")
p.write_text("\n".join(lines), encoding="utf-8")
EOF
grep -c "ingest_min_volume" docs/02_ARCHITECTURE.md CLAUDE.md
```

Expected: `docs/02_ARCHITECTURE.md:1` and `CLAUDE.md:1`.

- [ ] **Step 7: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 124 tests pass; typecheck silent; lint clean.

```bash
git add src/modules/kalshi/ingest-filter.ts src/modules/kalshi/ingest.ts tests/kalshi/ingest-filter.test.ts docs/02_ARCHITECTURE.md CLAUDE.md
git commit -F - <<'EOF'
feat(ingest): store only markets above a 24h-volume floor

Ingest has been killed at the 300s ceiling on every run since crons came
back (2026-09-22, 23, 24). Of 113,274 open Kalshi markets only ~4,017 in
the five in-scope categories have 24h volume >= 500; the rest can't be
traded at the quoted price and cost only write time.

Ingest still walks every market (~23s) but stores only those clearing
ingest_min_volume, so the writes shrink by ~20x. The decision lives in a
pure classifyForIngest with its own tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Pure candidate ranking

**Files:**
- Create: `src/modules/enrich/select.ts`
- Test: `tests/enrich/select.test.ts`

**Interfaces:**
- Produces (all from `@/modules/enrich/select`):

```ts
interface CandidateInput {
  ticker: string; eventTicker: string | null; category: string | null;
  title: string; rulesSummary: string | null; resolutionSource: string | null;
  closeTime: Date | null; snapshotId: number; snapshotCapturedAt: Date;
  yesMid: number | null; spread: number | null; volume: number | null;
  lastAssessedAt: Date | null;
}
interface Candidate {
  ticker: string; title: string; rulesSummary: string | null;
  resolutionSource: string | null; closeTime: Date | null;
  yesMid: number | null; snapshotId: number;
}
interface RankOptions {
  now: Date; topK: number; maxPerEvent: number; categories: readonly string[];
  minVolume: number; maxSpread: number; maxDaysToClose: number;
}
const MAX_SNAPSHOT_AGE_HOURS = 36;
const MIN_HOURS_TO_CLOSE = 6;
function rankCandidates(rows: readonly CandidateInput[], opts: RankOptions):
  { candidates: Candidate[]; eligibleUnassessed: number };
```

Rules, all from `docs/04 §1` except where marked new: category ∈ allowlist (case-insensitive; empty = any) · **new:** latest snapshot ≤ 36h old · 24h volume ≥ `minVolume` (null counts as 0) · spread ≤ `maxSpread` (**already in the spec, never applied in code:** null spread fails) · 6h ≤ time to close ≤ `maxDaysToClose` days (null close fails) · score = `volume × 1/(1 + daysToClose) × (1 + stalenessHours)`, never-assessed staleness = 1e6 · sort by score desc, ties by ticker asc · **new:** at most `maxPerEvent` per `eventTicker` (null event = its own group) · stop at `topK`. `eligibleUnassessed` counts every eligible never-assessed row, including ones the cap or topK cut.

- [ ] **Step 1: Write the failing test**

Create `tests/enrich/select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_SNAPSHOT_AGE_HOURS,
  rankCandidates,
  type CandidateInput,
  type RankOptions,
} from "@/modules/enrich/select";

const NOW = new Date("2026-09-24T12:00:00Z");
const H = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H);

let seq = 0;
/** An eligible Politics market, 10 days from close, never assessed. */
function row(over: Partial<CandidateInput> = {}): CandidateInput {
  seq++;
  return {
    ticker: `T-${seq}`,
    eventTicker: `EV-${seq}`,
    category: "Politics",
    title: `Market ${seq}`,
    rulesSummary: null,
    resolutionSource: null,
    closeTime: at(240),
    snapshotId: seq,
    snapshotCapturedAt: at(-1),
    yesMid: 0.5,
    spread: 0.02,
    volume: 1000,
    lastAssessedAt: null,
    ...over,
  };
}

const opts: RankOptions = {
  now: NOW,
  topK: 40,
  maxPerEvent: 2,
  categories: ["Politics", "Economics"],
  minVolume: 500,
  maxSpread: 0.08,
  maxDaysToClose: 540,
};

const tickers = (rows: CandidateInput[], o: Partial<RankOptions> = {}) =>
  rankCandidates(rows, { ...opts, ...o }).candidates.map((c) => c.ticker);

describe("rankCandidates — eligibility (docs/04 §1)", () => {
  it("keeps only allowlisted categories, case-insensitively", () => {
    const rows = [
      row({ ticker: "POL", category: "Politics" }),
      row({ ticker: "ECO", category: "economics" }),
      row({ ticker: "SPO", category: "Sports" }),
      row({ ticker: "NUL", category: null }),
    ];
    expect(tickers(rows).sort()).toEqual(["ECO", "POL"]);
  });

  it("treats an empty allowlist as no category filter", () => {
    const rows = [row({ ticker: "SPO", category: "Sports" }), row({ ticker: "NUL", category: null })];
    expect(tickers(rows, { categories: [] }).sort()).toEqual(["NUL", "SPO"]);
  });

  it("drops snapshots older than MAX_SNAPSHOT_AGE_HOURS and keeps the boundary", () => {
    const rows = [
      row({ ticker: "EDGE", snapshotCapturedAt: at(-MAX_SNAPSHOT_AGE_HOURS) }),
      row({ ticker: "OLD", snapshotCapturedAt: at(-MAX_SNAPSHOT_AGE_HOURS - 0.01) }),
    ];
    expect(tickers(rows)).toEqual(["EDGE"]);
  });

  it("applies the liquidity floor inclusively and treats unknown volume as zero", () => {
    const rows = [
      row({ ticker: "AT", volume: 500 }),
      row({ ticker: "BELOW", volume: 499 }),
      row({ ticker: "NULL", volume: null }),
    ];
    expect(tickers(rows)).toEqual(["AT"]);
  });

  it("applies the spread ceiling inclusively and rejects an unknown spread", () => {
    const rows = [
      row({ ticker: "AT", spread: 0.08 }),
      row({ ticker: "WIDE", spread: 0.09 }),
      row({ ticker: "NOBOOK", spread: null }),
    ];
    expect(tickers(rows)).toEqual(["AT"]);
  });

  it("requires 6h..maxDaysToClose until close, and a known close time", () => {
    const rows = [
      row({ ticker: "SIX", closeTime: at(6) }),
      row({ ticker: "SOON", closeTime: at(5.9) }),
      row({ ticker: "FAR", closeTime: at(541 * 24) }),
      row({ ticker: "NOCLOSE", closeTime: null }),
    ];
    expect(tickers(rows)).toEqual(["SIX"]);
  });
});

describe("rankCandidates — ordering", () => {
  it("orders by volume × 1/(1+daysToClose) × (1+stalenessHours)", () => {
    // NEW:  1000 × 1/11 × (1 + 1e6) ≈ 90,909,182  (never assessed ranks first)
    // NEAR: 2000 × 1/2  × (1 + 24)  =     25,000  (closes in 1 day)
    // BIG:  5000 × 1/11 × (1 + 24)  ≈     11,364
    const rows = [
      row({ ticker: "BIG", volume: 5000, lastAssessedAt: at(-24) }),
      row({ ticker: "NEAR", volume: 2000, closeTime: at(24), lastAssessedAt: at(-24) }),
      row({ ticker: "NEW", volume: 1000 }),
    ];
    expect(tickers(rows)).toEqual(["NEW", "NEAR", "BIG"]);
  });

  it("breaks score ties by ticker so runs are deterministic", () => {
    const rows = [row({ ticker: "B" }), row({ ticker: "A" }), row({ ticker: "C" })];
    expect(tickers(rows)).toEqual(["A", "B", "C"]);
  });

  it("stops at topK", () => {
    const rows = [row({ ticker: "A" }), row({ ticker: "B" }), row({ ticker: "C" })];
    expect(tickers(rows, { topK: 2 })).toEqual(["A", "B"]);
  });
});

describe("rankCandidates — per-event cap", () => {
  it("takes at most maxPerEvent markets from one event, in rank order", () => {
    const ladder = [5000, 4000, 3000, 2000, 1000].map((volume, i) =>
      row({ ticker: `LAD-${i}`, eventTicker: "EV-LADDER", volume }),
    );
    const other = row({ ticker: "OTHER", eventTicker: "EV-OTHER", volume: 600 });
    expect(tickers([...ladder, other])).toEqual(["LAD-0", "LAD-1", "OTHER"]);
  });

  it("does not let capped markets consume topK slots", () => {
    const ladder = [5000, 4000, 3000].map((volume, i) =>
      row({ ticker: `LAD-${i}`, eventTicker: "EV-L", volume }),
    );
    const rest = [
      row({ ticker: "X", eventTicker: "EV-X", volume: 700 }),
      row({ ticker: "Y", eventTicker: "EV-Y", volume: 600 }),
    ];
    expect(tickers([...ladder, ...rest], { topK: 3, maxPerEvent: 1 })).toEqual(["LAD-0", "X", "Y"]);
  });

  it("treats a market with no event as its own group", () => {
    const rows = [row({ ticker: "A", eventTicker: null }), row({ ticker: "B", eventTicker: null })];
    expect(tickers(rows, { maxPerEvent: 1 })).toEqual(["A", "B"]);
  });
});

describe("rankCandidates — backlog count and payload", () => {
  it("counts eligible never-assessed markets, including ones the cap cut", () => {
    const rows = [
      row({ ticker: "A", eventTicker: "E" }),
      row({ ticker: "B", eventTicker: "E" }),
      row({ ticker: "C", eventTicker: "E" }), // cut by the cap, still backlog
      row({ ticker: "DONE", lastAssessedAt: at(-2) }), // assessed: not backlog
      row({ ticker: "SPORT", category: "Sports" }), // ineligible: not backlog
    ];
    const r = rankCandidates(rows, opts);
    expect(r.candidates.map((c) => c.ticker)).toEqual(["A", "B", "DONE"]);
    expect(r.eligibleUnassessed).toBe(3);
  });

  it("carries the snapshot id and price through for the assessment", () => {
    const [c] = rankCandidates([row({ ticker: "A", snapshotId: 77, yesMid: 0.31 })], opts).candidates;
    expect(c).toMatchObject({ ticker: "A", snapshotId: 77, yesMid: 0.31 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/enrich/select.test.ts`
Expected: FAIL — `Cannot find module '@/modules/enrich/select'`.

- [ ] **Step 3: Implement rankCandidates**

Create `src/modules/enrich/select.ts`:

```ts
// Pure candidate selection for the paid enrich pass (docs/04 §1). No I/O, so
// the rule deciding where LLM money goes is unit-testable with built rows.

/** A market with its latest snapshot and last assessment time, as queried. */
export interface CandidateInput {
  ticker: string;
  eventTicker: string | null;
  category: string | null;
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  snapshotId: number;
  snapshotCapturedAt: Date;
  yesMid: number | null;
  spread: number | null;
  volume: number | null;
  lastAssessedAt: Date | null;
}

/** What one assessment needs. */
export interface Candidate {
  ticker: string;
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  yesMid: number | null;
  snapshotId: number;
}

export interface RankOptions {
  now: Date;
  topK: number;
  maxPerEvent: number;
  /** Case-insensitive allowlist; empty = any category. */
  categories: readonly string[];
  minVolume: number;
  maxSpread: number;
  maxDaysToClose: number;
}

/**
 * A snapshot older than this is not a live price. Ingest runs daily, so 36h
 * allows one late or failed run. Markets that fall below the ingest floor stop
 * being refreshed and age out here instead of being assessed on a stale price.
 */
export const MAX_SNAPSHOT_AGE_HOURS = 36;

/** Too close to close is a news race we lose (docs/04 §1). */
export const MIN_HOURS_TO_CLOSE = 6;

/** Staleness stand-in for never-assessed markets, so they rank first. */
const NEVER_ASSESSED_HOURS = 1e6;

const HOUR_MS = 3_600_000;

export function rankCandidates(
  rows: readonly CandidateInput[],
  opts: RankOptions,
): { candidates: Candidate[]; eligibleUnassessed: number } {
  const nowMs = opts.now.getTime();
  const allowed = new Set(opts.categories.map((c) => c.toLowerCase()));

  const eligible = rows.flatMap((r) => {
    if (allowed.size > 0 && !(r.category && allowed.has(r.category.toLowerCase()))) return [];
    if ((nowMs - r.snapshotCapturedAt.getTime()) / HOUR_MS > MAX_SNAPSHOT_AGE_HOURS) return [];

    const volume = r.volume ?? 0;
    if (volume < opts.minVolume) return [];
    // No two-sided book means no tradeable price: that is where phantom
    // edges come from (docs/04 §10), so an unknown spread fails the gate.
    if (r.spread === null || r.spread > opts.maxSpread) return [];

    const hoursToClose = r.closeTime ? (r.closeTime.getTime() - nowMs) / HOUR_MS : Infinity;
    if (hoursToClose < MIN_HOURS_TO_CLOSE || hoursToClose > opts.maxDaysToClose * 24) return [];

    const daysToClose = hoursToClose / 24;
    const stalenessHours = r.lastAssessedAt
      ? (nowMs - r.lastAssessedAt.getTime()) / HOUR_MS
      : NEVER_ASSESSED_HOURS;
    const score = volume * (1 / (1 + daysToClose)) * (1 + stalenessHours);
    return [{ row: r, score }];
  });

  const eligibleUnassessed = eligible.filter((e) => e.row.lastAssessedAt === null).length;

  eligible.sort(
    (a, b) =>
      b.score - a.score || (a.row.ticker < b.row.ticker ? -1 : a.row.ticker > b.row.ticker ? 1 : 0),
  );

  // One event is often one question at several strike points; cap it so a
  // single ladder cannot take the run's slots.
  const perEvent = new Map<string, number>();
  const candidates: Candidate[] = [];
  for (const { row } of eligible) {
    if (candidates.length >= opts.topK) break;
    const group = row.eventTicker ?? `market:${row.ticker}`;
    const used = perEvent.get(group) ?? 0;
    if (used >= opts.maxPerEvent) continue;
    perEvent.set(group, used + 1);
    candidates.push({
      ticker: row.ticker,
      title: row.title,
      rulesSummary: row.rulesSummary,
      resolutionSource: row.resolutionSource,
      closeTime: row.closeTime,
      yesMid: row.yesMid,
      snapshotId: row.snapshotId,
    });
  }

  return { candidates, eligibleUnassessed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/enrich/select.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/enrich/select.ts tests/enrich/select.test.ts
git commit -F - <<'EOF'
feat(enrich): pure candidate ranking with category, freshness and event caps

rankCandidates decides where enrich money goes, with no I/O: the
enrich_categories allowlist, a 36h snapshot-freshness gate, the liquidity
and spread floors of docs/04 §1 (spread was in the spec but never applied),
the existing volume x time-decay x staleness score, and at most
maxPerEvent markets per Kalshi event. Wired into runEnrich in the next
commit.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Bounded candidate queries in runEnrich

**Files:**
- Modify: `src/modules/enrich/run.ts` — imports (line 1), the `selectCandidates` call (lines 28–32), and replace lines 147–247 (`interface Candidate` + `selectCandidates`)
- Modify: `docs/04_ALGORITHM_SPEC.md` §1

**Interfaces:**
- Consumes: `rankCandidates`, `MAX_SNAPSHOT_AGE_HOURS`, `type Candidate`, `type CandidateInput` (Task 3); `type Thresholds` (Task 1).
- Produces: `export async function selectCandidates(t: Thresholds, now?: Date): Promise<{ candidates: Candidate[]; eligibleUnassessed: number }>` — exported for read-only smoke checks. Task 6 keeps calling it as `selectCandidates(thresholds)`.

**The bug this fixes:** the current `selectCandidates` loads every snapshot ever taken for every active ticker (`inArray` over all tickers, ordered by `captured_at desc`) and keeps the first per ticker in JS. That is 68,687 rows today and grows by the size of the stored universe on every ingest — the Neon 64MB failure mode.

- [ ] **Step 1: Swap the imports and the call site**

In `src/modules/enrich/run.ts`, replace line 1:

```ts
import { desc, eq, inArray } from "drizzle-orm";
```

with:

```ts
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Thresholds } from "@/lib/config-schema";
import {
  MAX_SNAPSHOT_AGE_HOURS,
  rankCandidates,
  type Candidate,
  type CandidateInput,
} from "./select";
```

Replace the call (lines 28–32):

```ts
  const { candidates, eligibleUnassessed } = await selectCandidates(
    thresholds.min_volume,
    thresholds.enrich_top_k,
    thresholds.max_days_to_close,
  );
```

with:

```ts
  const { candidates, eligibleUnassessed } = await selectCandidates(thresholds);
```

- [ ] **Step 2: Replace the local Candidate type and selectCandidates**

Delete from `interface Candidate {` (line 147) through the closing `}` of `selectCandidates` (line 247), and put in its place:

```ts
/**
 * Load what rankCandidates needs, in queries bounded by the currently-ingested
 * market set — never by snapshot or assessment history (docs/04 §1). Selects
 * only needed columns, never `raw` (Neon 64MB response cap). Performs no
 * writes; exported for read-only smoke checks.
 */
export async function selectCandidates(
  t: Thresholds,
  now: Date = new Date(),
): Promise<{ candidates: Candidate[]; eligibleUnassessed: number }> {
  const freshSince = new Date(now.getTime() - MAX_SNAPSHOT_AGE_HOURS * 3_600_000);
  const categories = t.enrich_categories.map((c) => c.toLowerCase());

  const markets = await db
    .select({
      ticker: schema.markets.ticker,
      eventTicker: schema.markets.eventTicker,
      category: schema.markets.category,
      title: schema.markets.title,
      rulesSummary: schema.markets.rulesSummary,
      resolutionSource: schema.markets.resolutionSource,
      closeTime: schema.markets.closeTime,
    })
    .from(schema.markets)
    .where(
      and(
        eq(schema.markets.status, "active"),
        // Ingest bumps updated_at on every market it stores, so this keeps the
        // set to what recent ingests refreshed; markets that fell below the
        // floor stop being refreshed and drop out here.
        gte(schema.markets.updatedAt, freshSince),
        categories.length > 0
          ? inArray(sql`lower(${schema.markets.category})`, categories)
          : undefined,
      ),
    );
  if (markets.length === 0) return { candidates: [], eligibleUnassessed: 0 };
  const tickers = markets.map((m) => m.ticker);

  // Latest snapshot per ticker via DISTINCT ON over the (ticker, captured_at)
  // index. The previous version loaded every snapshot ever taken for these
  // tickers and reduced in JS — a row count that grew with every ingest.
  const snaps = await db
    .selectDistinctOn([schema.marketSnapshots.ticker], {
      id: schema.marketSnapshots.id,
      ticker: schema.marketSnapshots.ticker,
      capturedAt: schema.marketSnapshots.capturedAt,
      yesMid: schema.marketSnapshots.yesMid,
      spread: schema.marketSnapshots.spread,
      volume: schema.marketSnapshots.volume,
    })
    .from(schema.marketSnapshots)
    .where(inArray(schema.marketSnapshots.ticker, tickers))
    .orderBy(schema.marketSnapshots.ticker, desc(schema.marketSnapshots.capturedAt));
  const snapByTicker = new Map(snaps.map((s) => [s.ticker, s]));

  // One row per ticker, however many times it has been assessed.
  const assessed = await db
    .select({
      ticker: schema.llmAssessments.ticker,
      lastAt: sql<string | null>`max(${schema.llmAssessments.createdAt})`,
    })
    .from(schema.llmAssessments)
    .where(inArray(schema.llmAssessments.ticker, tickers))
    .groupBy(schema.llmAssessments.ticker);
  const lastAssessedAt = new Map(
    assessed.map((a) => [a.ticker, a.lastAt ? new Date(a.lastAt) : null]),
  );

  const rows: CandidateInput[] = markets.flatMap((m) => {
    const s = snapByTicker.get(m.ticker);
    if (!s) return [];
    return [
      {
        ...m,
        snapshotId: s.id,
        snapshotCapturedAt: s.capturedAt,
        yesMid: s.yesMid,
        spread: s.spread,
        volume: s.volume,
        lastAssessedAt: lastAssessedAt.get(m.ticker) ?? null,
      },
    ];
  });

  return rankCandidates(rows, {
    now,
    topK: t.enrich_top_k,
    maxPerEvent: t.enrich_max_per_event,
    categories: t.enrich_categories,
    minVolume: t.min_volume,
    maxSpread: t.max_spread,
    maxDaysToClose: t.max_days_to_close,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no output. If `selectDistinctOn` or `sql<string | null>` fails to typecheck, stop and report the exact error — do not fall back to loading snapshot history.

- [ ] **Step 4: Read-only smoke against Neon**

This only reads. Do **not** call `runEnrich` (see Global Constraints).

Create `_x-smoke.ts`:

```ts
import "dotenv/config";
import { getActiveConfig } from "@/lib/services/config";
import { selectCandidates } from "@/modules/enrich/run";

async function main() {
  const { id, thresholds } = await getActiveConfig();
  console.log(`config ${id}, enrich_categories=${JSON.stringify(thresholds.enrich_categories)}`);
  for (const categories of [thresholds.enrich_categories, []]) {
    const t0 = Date.now();
    const r = await selectCandidates({ ...thresholds, enrich_categories: categories });
    console.log(
      `categories=${JSON.stringify(categories)}: ${Date.now() - t0}ms, ` +
        `${r.candidates.length} candidates, ${r.eligibleUnassessed} eligible unassessed; ` +
        `first: ${r.candidates.slice(0, 5).map((c) => c.ticker).join(", ")}`,
    );
  }
}
main().then(() => process.exit(0));
```

Run: `npx tsx _x-smoke.ts; rm -f _x-smoke.ts`
Expected: both lines print in well under 10 000 ms with no error. Before rollout, production has no fresh Politics/Economics markets, so the first line shows `0 candidates`; the second (no category filter) shows whatever the last partial ingest refreshed, capped at 40. A thrown `NeonDbError` or a multi-second first line is a failure — report it.

- [ ] **Step 5: Update docs/04 §1**

Run:

```bash
python3 - <<'EOF'
import pathlib
p = pathlib.Path("docs/04_ALGORITHM_SPEC.md")
s = p.read_text(encoding="utf-8")

old_cat = ("- Category ∈ included set (events: politics, economics/announcements, culture/media;"
           " **crypto & sports excluded**).")
assert old_cat in s, "category line not found"
s = s.replace(old_cat,
    "- Category ∈ the enrich allowlist `enrich_categories` (config, default **Politics, Economics**;"
    " case-insensitive; empty = any). Distinct from `excluded_categories`, which scopes what ingest"
    " *stores* (`02 §5`): a category can be stored and displayed without being analysed — Elections,"
    " Sports and Climate as of 2026-09-24. Crypto is excluded from storage.")

old_spread = 'Illiquid markets can look like huge "edges" that are actually just wide spreads.'
assert old_spread in s, "spread line not found"
s = s.replace(old_spread, old_spread + " A market with no two-sided book (unknown spread) fails this gate.")

i = s.index("- Rules are self-contained")
end = s.index("\n", i)
s = s[:end + 1] + (
    "- Fresh price: the latest snapshot is at most **36 hours** old (`MAX_SNAPSHOT_AGE_HOURS`)."
    " Markets that fall below the ingest floor stop being refreshed; without this gate they would be"
    " assessed against a stale price.\n"
    "- At most `enrich_max_per_event` markets (config, default **2**) per Kalshi event per run, taken"
    " in rank order — an event's strike ladder is one question asked several ways and must not"
    " consume the run's slots.\n"
    "- Implemented as the pure `rankCandidates` (`modules/enrich/select.ts`); `selectCandidates` in"
    " `modules/enrich/run.ts` only loads its inputs, reading the latest snapshot per market with"
    " `DISTINCT ON`, never snapshot history.\n"
) + s[end + 1:]
p.write_text(s, encoding="utf-8")
EOF
grep -c "enrich_categories\|MAX_SNAPSHOT_AGE_HOURS\|enrich_max_per_event" docs/04_ALGORITHM_SPEC.md
```

Expected: `3`.

- [ ] **Step 6: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 138 tests pass; typecheck silent; lint clean.

```bash
git add src/modules/enrich/run.ts docs/04_ALGORITHM_SPEC.md
git commit -F - <<'EOF'
fix(enrich): select candidates with bounded queries via rankCandidates

selectCandidates loaded every snapshot ever taken for every active ticker
and reduced to the latest in JS: 68,687 rows today, growing by the whole
stored universe on each ingest, which would hit the Neon response cap
within weeks of daily ingest.

It now reads only recently-ingested markets in the enrich allowlist, the
latest snapshot per ticker via DISTINCT ON, and max(created_at) per
ticker for staleness, then hands the rows to the pure rankCandidates.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Bounded-concurrency pool

**Files:**
- Create: `src/modules/enrich/pool.ts`
- Test: `tests/enrich/pool.test.ts`

**Interfaces:**
- Produces: `runPool<T>(items: readonly T[], concurrency: number, shouldStart: () => boolean, task: (item: T) => Promise<void>): Promise<{ started: number; stoppedEarly: boolean }>`.

Semantics: at most `max(1, floor(concurrency))` tasks in flight, never more than `items.length`. `shouldStart()` is called immediately before each item starts; the first `false` stops all new starts (`stoppedEarly: true`) while in-flight tasks finish. If a task rejects, nothing new starts, in-flight tasks settle, then the pool rejects with the first error. `shouldStart` is never called for an empty list.

- [ ] **Step 1: Write the failing test**

Create `tests/enrich/pool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runPool } from "@/modules/enrich/pool";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 2));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A task that records completion order and the peak number in flight. */
function tracker() {
  let inFlight = 0;
  let peak = 0;
  const done: number[] = [];
  const task = async (n: number) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight--;
    done.push(n);
  };
  return { task, done, peak: () => peak };
}

describe("runPool", () => {
  it("runs every item without exceeding the concurrency limit", async () => {
    const t = tracker();
    const r = await runPool(range(10), 3, () => true, t.task);
    expect([...t.done].sort((a, b) => a - b)).toEqual(range(10));
    expect(t.peak()).toBe(3);
    expect(r).toEqual({ started: 10, stoppedEarly: false });
  });

  it("starts nothing more once shouldStart says no, and lets in-flight work finish", async () => {
    const t = tracker();
    let allowed = 2;
    const r = await runPool(range(10), 2, () => allowed-- > 0, t.task);
    expect(r).toEqual({ started: 2, stoppedEarly: true });
    expect([...t.done].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("never runs wider than the number of items", async () => {
    const t = tracker();
    await runPool(range(2), 8, () => true, t.task);
    expect(t.peak()).toBe(2);
  });

  it("floors fractional concurrency and treats anything below 1 as 1", async () => {
    const a = tracker();
    await runPool(range(6), 2.9, () => true, a.task);
    expect(a.peak()).toBe(2);
    const b = tracker();
    await runPool(range(4), 0, () => true, b.task);
    expect(b.peak()).toBe(1);
  });

  it("does nothing for an empty list and never consults the guard", async () => {
    let asked = 0;
    const r = await runPool(
      [],
      4,
      () => {
        asked++;
        return true;
      },
      async () => {},
    );
    expect(r).toEqual({ started: 0, stoppedEarly: false });
    expect(asked).toBe(0);
  });

  it("rejects with the first task error after in-flight tasks settle", async () => {
    const started: number[] = [];
    let settled = 0;
    const run = runPool(range(10), 2, () => true, async (n) => {
      started.push(n);
      await tick();
      settled++;
      if (n === 0) throw new Error("boom");
    });
    await expect(run).rejects.toThrow("boom");
    expect(started.length).toBeLessThanOrEqual(3);
    expect(settled).toBe(started.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/enrich/pool.test.ts`
Expected: FAIL — `Cannot find module '@/modules/enrich/pool'`.

- [ ] **Step 3: Implement runPool**

Create `src/modules/enrich/pool.ts`:

```ts
/**
 * Run `task` over `items` with at most `concurrency` in flight (docs/03 §3).
 * Pure: no I/O of its own.
 *
 * `shouldStart` is consulted immediately before each item starts. The first
 * `false` stops all new starts; tasks already in flight still finish. This is
 * where enrich's wall-clock and budget guards live, so they bound what
 * *starts* and never interrupt a running assessment.
 *
 * `task` should handle its own failures. If one rejects anyway, nothing new
 * starts, in-flight tasks settle, and the pool rejects with the first error.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  shouldStart: () => boolean,
  task: (item: T) => Promise<void>,
): Promise<{ started: number; stoppedEarly: boolean }> {
  // Held in an object so TypeScript doesn't narrow these across the awaits.
  const state = {
    next: 0,
    started: 0,
    stoppedEarly: false,
    failure: null as { error: unknown } | null,
  };

  const worker = async (): Promise<void> => {
    while (!state.stoppedEarly && state.failure === null && state.next < items.length) {
      if (!shouldStart()) {
        state.stoppedEarly = true;
        return;
      }
      const item = items[state.next++] as T;
      state.started++;
      try {
        await task(item);
      } catch (error) {
        if (state.failure === null) state.failure = { error };
        return;
      }
    }
  };

  const width = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  await Promise.all(Array.from({ length: width }, () => worker()));

  if (state.failure !== null) throw state.failure.error;
  return { started: state.started, stoppedEarly: state.stoppedEarly };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/enrich/pool.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/enrich/pool.ts tests/enrich/pool.test.ts
git commit -F - <<'EOF'
feat(enrich): bounded-concurrency pool with start-time guards

runPool keeps at most N tasks in flight and consults a guard immediately
before each start; once it says no, nothing new starts and in-flight work
finishes. Enrich's wall-clock and budget guards move into that guard in
the next commit, so concurrency never stretches the time worst case.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Run assessments concurrently

**Files:**
- Modify: `src/modules/enrich/run.ts` — imports; replace `runEnrich` (with its doc comment) by `runEnrich` + a new `assessCandidate`
- Modify: `docs/03_DATA_SOURCES.md` (insert after the `- **Time budget (resumable):**` bullet)
- Modify: `docs/02_ARCHITECTURE.md` (append to the `**Function budgets.**` paragraph)
- Modify: `CLAUDE.md` (append to the `- **Verify against Neon:**` bullet)

**Interfaces:**
- Consumes: `runPool` (Task 5); `selectCandidates(thresholds)` and `type Candidate` (Task 4); `Thresholds.enrich_concurrency` (Task 1).
- Produces: `runEnrich(): Promise<RunResult>` — same signature; `meta` gains `concurrency` and `candidates`. Task 8 reads `itemsOk`, `costUsd`, `meta.stoppedForTime`, `meta.concurrency`.

**Why:** every one of the last 12 full enrich runs stopped on the wall clock at ~11.8 assessments (21.6s each, sequential) and never on budget. The 21.6s is almost all network wait, so four in flight lifts a 240s run to ~40.

- [ ] **Step 1: Add the import**

In `src/modules/enrich/run.ts`, after the `./select` import added in Task 4, add:

```ts
import { runPool } from "./pool";
```

- [ ] **Step 2: Replace runEnrich**

Replace the whole `runEnrich` function, including its doc comment, with the following. The per-market body moves unchanged into `assessCandidate`:

```ts
/**
 * Enrichment job (docs/02 §5, docs/03 §3, docs/04 §4): pick candidates with
 * rankCandidates, then for each retrieve+dedupe+filter news and run one LLM
 * assessment, storing news, market_news and llm_assessments (append-only).
 *
 * Runs `enrich_concurrency` assessments at a time. The wall-clock and daily
 * budget guards are checked when an assessment is about to START: in-flight
 * work always finishes, so the time worst case stays enrich_max_seconds + one
 * 60s LLM timeout at any concurrency, and the budget can be overshot by at
 * most concurrency − 1 assessments.
 */
export async function runEnrich(): Promise<RunResult> {
  const { thresholds } = await getActiveConfig();
  const newsClients = getNewsClients();
  const llm = getLlmClient();

  const spentToday = await enrichSpendTodayUsd();
  const budget = thresholds.llm_daily_budget_usd;
  if (spentToday >= budget) {
    return { itemsOk: 0, itemsFailed: 0, meta: { budgetExceeded: true, spentToday } };
  }

  const { candidates, eligibleUnassessed } = await selectCandidates(thresholds);

  let itemsOk = 0;
  let itemsFailed = 0;
  let runCost = 0;
  let stoppedForBudget = false;
  let stoppedForTime = false;
  const errorSamples: string[] = [];

  const startedAt = Date.now();
  const maxMs = thresholds.enrich_max_seconds * 1000;

  await runPool(
    candidates,
    thresholds.enrich_concurrency,
    () => {
      if (spentToday + runCost >= budget) {
        stoppedForBudget = true;
        return false;
      }
      if (Date.now() - startedAt >= maxMs) {
        stoppedForTime = true;
        return false;
      }
      return true;
    },
    async (c) => {
      try {
        runCost += await assessCandidate(c, newsClients, llm);
        itemsOk++;
      } catch (err) {
        // A failed assessment (schema/API/timeout) is logged as a failure, never
        // guessed. Capture the reason so the Runs page can show why (docs/02 §5).
        itemsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`enrich: assessment failed for ${c.ticker}: ${msg}`);
        const short = `${c.ticker}: ${msg.slice(0, 160)}`;
        if (errorSamples.length < 5 && !errorSamples.includes(short)) errorSamples.push(short);
      }
    },
  );

  // True backlog: eligible markets with no assessment, less the ones this run
  // just assessed. When this hits 0, every eligible market has an assessment;
  // further runs only refresh the stalest.
  const remaining = Math.max(0, eligibleUnassessed - itemsOk);
  return {
    itemsOk,
    itemsFailed,
    costUsd: runCost,
    meta: {
      stoppedForBudget,
      stoppedForTime,
      spentBeforeRun: spentToday,
      assessedThisRun: itemsOk,
      candidates: candidates.length,
      concurrency: thresholds.enrich_concurrency,
      remaining,
      errorSamples,
    },
  };
}

/**
 * One market: retrieve news published before now, store it and its market
 * links, run the LLM assessment, store it. Returns the assessment's cost.
 * Throws on any failure; the caller counts it.
 */
async function assessCandidate(
  c: Candidate,
  newsClients: ReturnType<typeof getNewsClients>,
  llm: ReturnType<typeof getLlmClient>,
): Promise<number> {
  const now = new Date();
  const retrieved = await retrieveNews({
    clients: newsClients,
    query: `${c.title} ${c.ticker}`,
    marketText: `${c.title} ${c.rulesSummary ?? ""}`,
    before: now,
  });

  // Persist news items and their market links; build prompt-facing ids.
  const promptNews = [];
  for (let i = 0; i < retrieved.items.length; i++) {
    const { item, score } = retrieved.items[i]!;
    const newsId = await upsertNewsItem(item);
    await db.insert(schema.marketNews).values({
      marketTicker: c.ticker,
      newsId,
      relevanceScore: score,
    });
    promptNews.push({
      id: i + 1, // stable 1-based id the model cites
      source: item.source,
      headline: item.headline,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      snippet: item.snippet,
    });
  }

  const assessment = await llm.assess({
    title: c.title,
    rulesSummary: c.rulesSummary,
    resolutionSource: c.resolutionSource,
    closeTime: c.closeTime?.toISOString() ?? null,
    marketPriceYes: c.yesMid,
    today: now.toISOString().slice(0, 10),
    news: promptNews,
  });

  await db.insert(schema.llmAssessments).values({
    ticker: c.ticker,
    snapshotId: c.snapshotId,
    promptVersion: assessment.promptVersion,
    model: assessment.model,
    pEstimate: assessment.output.p_yes,
    pLow: assessment.output.p_low,
    pHigh: assessment.output.p_high,
    rationale: {
      thesis: assessment.output.thesis,
      evidence_for: assessment.output.evidence_for,
      evidence_against: assessment.output.evidence_against,
      change_triggers: assessment.output.change_triggers,
      self_check: assessment.output.self_check,
    },
    citations: assessment.output.citation_ids,
    tokensIn: assessment.tokensIn,
    tokensOut: assessment.tokensOut,
    costUsd: String(assessment.costUsd),
  });

  return assessment.costUsd;
}
```

`upsertNewsItem` and `enrichSpendTodayUsd` stay as they are. Concurrent `upsertNewsItem` calls on the same URL are safe: it is `INSERT … ON CONFLICT (url) DO UPDATE`.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: typecheck silent; 144 tests pass. `runEnrich` has no unit test (it is I/O); it is verified live in Task 8. Do **not** run it locally.

- [ ] **Step 4: Update the specs and CLAUDE.md**

Run:

```bash
python3 - <<'EOF'
import pathlib

p = pathlib.Path("docs/03_DATA_SOURCES.md")
lines = p.read_text(encoding="utf-8").split("\n")
i = next(i for i, l in enumerate(lines) if l.startswith("- **Time budget (resumable):**"))
lines.insert(i + 1,
    "- **Concurrency (2026-09-24):** each assessment takes ~22s, almost all of it waiting on news"
    " search and the LLM, and every sequential run in the ledger stopped on the wall clock at ~12"
    " assessments — never on budget. `enrich` now keeps `enrich_concurrency` (config, default 4,"
    " max 8) assessments in flight via `modules/enrich/pool.ts`, lifting a 240s run to ~40. Both"
    " guards are checked only when an assessment *starts*, so in-flight work finishes: the time"
    " worst case is unchanged, and the daily cap can be overshot by at most `concurrency − 1`"
    " assessments (~$0.06 at 4).")
p.write_text("\n".join(lines), encoding="utf-8")

p = pathlib.Path("docs/02_ARCHITECTURE.md")
s = p.read_text(encoding="utf-8")
anchor = "Raising the budget means raising `maxDuration` too."
assert anchor in s, "function budgets anchor not found"
s = s.replace(anchor, anchor + " Enrich runs `enrich_concurrency` assessments in parallel; because"
              " both guards act only when an assessment starts, parallelism does not change that"
              " worst case.")
p.write_text(s, encoding="utf-8")

p = pathlib.Path("CLAUDE.md")
lines = p.read_text(encoding="utf-8").split("\n")
i = next(i for i, l in enumerate(lines) if l.startswith("- **Verify against Neon:**"))
lines[i] += (" **Never run `runEnrich` locally:** local `.env` points at production Neon while"
             " news/LLM fall back to fixtures, so it would write fake assessments into the"
             " immutable calibration log. Local smoke checks only read.")
p.write_text("\n".join(lines), encoding="utf-8")
EOF
grep -c "enrich_concurrency" docs/03_DATA_SOURCES.md docs/02_ARCHITECTURE.md; grep -c "Never run \`runEnrich\` locally" CLAUDE.md
```

Expected: `docs/03_DATA_SOURCES.md:1`, `docs/02_ARCHITECTURE.md:1`, then `1`.

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: `✔ No ESLint warnings or errors`.

```bash
git add src/modules/enrich/run.ts docs/03_DATA_SOURCES.md docs/02_ARCHITECTURE.md CLAUDE.md
git commit -F - <<'EOF'
feat(enrich): run assessments concurrently

Every one of the last 12 full enrich runs stopped on the wall clock at
~12 assessments (21.6s each, sequential) and never on budget, so
enrich_top_k=40 was unreachable. The time is almost all network wait.

runEnrich now drives the per-market work through runPool with
enrich_concurrency (default 4) in flight. Both guards run at start time,
so the 300s worst case is unchanged and the daily cap can be overshot by
at most concurrency - 1 assessments.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Put enrich on the daily cron, jobs 2h apart

**Files:**
- Modify: `vercel.json`
- Modify: `docs/02_ARCHITECTURE.md` (the `` | `enrich` | `` row of the §5 jobs table)
- Modify: `docs/RUNBOOK.md` (the four job rows under `## Schedules`, and the sentence after the table)
- Modify: `README.md:53`
- Modify: `docs/COSTS.md` (the sentence starting `At ~$0.033/assessment` on line 57)
- Modify: `docs/STATUS.md` (known gap `2. **Cron cadence**`)
- Modify: `CLAUDE.md` (the ``- **`enrich` is manual-only**`` bullet)

**Why the times move:** Vercel Hobby fires crons late. Ledger, 2026-09-22 to 24: `0 12` fired 12:21, `30 12` fired 13:15, `0 13` fired 13:51 — 21 to 51 minutes late. Enrich must run after ingest and before score; 2h gaps keep that order. This task **reverses a documented decision** (enrich manual-only, `02 §5`): it was manual until cost was trusted, and cost is now metered at $0.019/assessment under a $10/day cap. It turns on ~$0.76/day of automatic spend once deployed.

- [ ] **Step 1: Rewrite vercel.json**

Replace the whole of `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/jobs/ingest", "schedule": "0 6 * * *" },
    { "path": "/api/jobs/enrich", "schedule": "0 8 * * *" },
    { "path": "/api/jobs/score", "schedule": "0 10 * * *" },
    { "path": "/api/jobs/settle", "schedule": "0 11 * * *" }
  ]
}
```

- [ ] **Step 2: Update every place the schedule or enrich's manual status is written down**

Run:

```bash
python3 - <<'EOF'
import pathlib, re

def edit(path, fn):
    p = pathlib.Path(path)
    p.write_text(fn(p.read_text(encoding="utf-8")), encoding="utf-8")

def enrich_row(s):
    lines = s.split("\n")
    i = next(i for i, l in enumerate(lines) if l.startswith("| `enrich` |"))
    lines[i] = ("| `enrich` | daily (Hobby), 2h after ingest | For up to `enrich_top_k` candidates chosen"
                " by the pure `rankCandidates` (`04 §1`): fetch news, dedupe, then one LLM assessment per"
                " market, `enrich_concurrency` (default 4) at a time. **Budget-guarded**: hard daily cost"
                " cap from config; guards are checked when an assessment starts. **Updated 2026-09-24:**"
                " back on cron. It was manual-only while cost was unproven; metered cost is $0.019 per"
                " assessment and the $10/day cap is the backstop. |")
    return "\n".join(lines)
edit("docs/02_ARCHITECTURE.md", enrich_row)

def runbook(s):
    old = "\n".join([
        "| `ingest` | 12:00 UTC | every 30 min | No (Kalshi data is free) |",
        "| `score` | 12:30 UTC | :15 and :45 past the hour | No (pure compute) |",
        "| `settle` | 13:00 UTC | hourly | No |",
        "| `enrich` | **not scheduled — manual only** | (same) | **Yes** — the only paid job |",
    ])
    new = "\n".join([
        "| `ingest` | 06:00 UTC | every 30 min | No (Kalshi data is free) |",
        "| `enrich` | 08:00 UTC | every 2–4 h | **Yes** — the only paid job (~$0.76/day at 40 assessments) |",
        "| `score` | 10:00 UTC | :15 and :45 past the hour | No (pure compute) |",
        "| `settle` | 11:00 UTC | hourly | No |",
    ])
    assert old in s, "runbook schedule rows not found"
    s = s.replace(old, new)
    anchor = "Vercel Hobby only fires cron jobs once per day;"
    assert anchor in s, "runbook hobby sentence not found"
    return s.replace(anchor,
        "Vercel Hobby only fires cron jobs once per day, and late (observed 21–51 min), so jobs sit"
        " 2h apart to keep ingest → enrich → score in order;", 1)
edit("docs/RUNBOOK.md", runbook)

def readme(s):
    old = "therefore ships daily schedules (ingest 12:00, score 12:30, settle 13:00 UTC) so"
    assert old in s, "README schedule sentence not found"
    return s.replace(old, "therefore ships daily schedules 2h apart (ingest 06:00, enrich 08:00,"
                     " score 10:00, settle 11:00 UTC) so")
edit("README.md", readme)

def costs(s):
    new, n = re.subn(
        r"At ~\$0\.033/assessment.*$",
        "Metered cost is **$0.019/assessment all-in** (mean of the 12 full runs to 2026-07-24, news"
        " included), below the $0.033 planning figure above. Enrich runs daily on cron since"
        " 2026-09-24: ~40 assessments/day ≈ **$0.76/day ≈ $23/month**. $10/day covers ~500"
        " assessments, so the cap is a backstop, not the operating limit.",
        s, count=1, flags=re.M)
    assert n == 1, "COSTS sentence not found"
    return new
edit("docs/COSTS.md", costs)

def status(s):
    lines = s.split("\n")
    i = next(i for i, l in enumerate(lines) if l.startswith("2. **Cron cadence**"))
    lines[i] = ("2. **Cron cadence** — Hobby = once/day per job, and it fires late (observed +21 to +51 min),"
                " so jobs sit 2h apart to keep order: ingest 06:00, enrich 08:00, score 10:00, settle"
                " 11:00 UTC. Sub-daily needs Vercel Pro (snippet in README).")
    return "\n".join(lines)
edit("docs/STATUS.md", status)

def claude(s):
    lines = s.split("\n")
    i = next(i for i, l in enumerate(lines) if l.startswith("- **`enrich` is manual-only**"))
    lines[i] = ("- **`enrich` runs daily on cron** (since 2026-09-24; \"Run now\" still works) — the only job"
                " that spends money (~$0.019/assessment metered, ~$23/month at 40/day, $10/day cap). It's"
                " **resumable** and **concurrent**: `enrich_concurrency` assessments in flight, with the"
                " wall-clock budget (`enrich_max_seconds`) and the daily cap checked when each one"
                " *starts*. Candidates come from the pure `rankCandidates` (`modules/enrich/select.ts`):"
                " `enrich_categories` allowlist (default Politics + Economics), fresh snapshot, liquidity"
                " and spread floors, ≤ `enrich_max_per_event` per event. Vercel Hobby fires each cron"
                " once/day and **late** (observed 21–51 min) — keep jobs ≥2h apart so ingest → enrich →"
                " score stays ordered.")
    return "\n".join(lines)
edit("CLAUDE.md", claude)
print("all edits applied")
EOF
grep -n "12:00\|12:30\|13:00 UTC\|manual only\|manual-only" README.md docs/RUNBOOK.md CLAUDE.md docs/02_ARCHITECTURE.md || echo "(no stale schedule text)"
```

Expected: `all edits applied` (an `AssertionError` or `StopIteration` names the anchor that moved — fix that edit, don't skip it), then ideally `(no stale schedule text)`. If the grep prints lines, read each one: a statement of *current* behaviour (a schedule, or enrich being manual) must be fixed; a clearly historical remark may stay. `docs/STATUS.md` is deliberately not grepped, because its dated sections record the old times on purpose.

- [ ] **Step 3: Build and commit**

Run: `npm run build 2>&1 | tail -5`
Expected: the route table prints and the build exits 0. (Vercel validates `vercel.json` at deploy.)

```bash
git add vercel.json docs/02_ARCHITECTURE.md docs/RUNBOOK.md README.md docs/COSTS.md docs/STATUS.md CLAUDE.md
git commit -F - <<'EOF'
feat(cron): run enrich daily and space jobs two hours apart

Enrich was manual-only until its cost was proven. It is now metered at
$0.019/assessment under a $10/day cap, so it joins the daily cron (~40
assessments, ~$0.76/day).

Hobby fires crons late — 21 to 51 minutes in the ledger — so jobs now sit
2h apart (ingest 06:00, enrich 08:00, score 10:00, settle 11:00 UTC) to
keep ingest -> enrich -> score ordered.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Roll out and verify against production

**Files:**
- Modify: `docs/STATUS.md` (new dated section; replace the `### Still open after this pass` block)
- Modify: `docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md` (status line; append "Implementation notes")

This task spends money (one enrich run ≈ $0.76) and changes production. **Ask the operator before Step 2.**

Every `curl` below reads the cron token without echoing it, via:

```bash
SECRET=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d "\"'\r")
```

- [ ] **Step 1: Full local gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build 2>&1 | tail -3`
Expected: 144 tests pass, typecheck silent, lint clean, build succeeds.

- [ ] **Step 2: Confirm with the operator, then push**

Ask: "Pushing to `main` deploys to production and turns on the paid daily enrich cron (~$0.76/day). OK to push?" On yes:

Run: `git push origin main`
Expected: a `<old>..<new>  main -> main` line. If it hangs on a credential dialog, stop and tell the operator.

- [ ] **Step 3: Detect the new deploy with a safe ingest**

Wait ~3 minutes for Vercel. The active config is still row 11 (Sports only), so an ingest now touches only Sports and, on the new code, finishes quickly — its response is the deploy detector:

```bash
SECRET=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d "\"'\r")
curl -s -m 330 -w '\nHTTP %{http_code} in %{time_total}s\n' -H "Authorization: Bearer $SECRET" https://afterlight-mu.vercel.app/api/jobs/ingest
```

Expected (new code): `HTTP 200` in well under 300s, JSON with `"meta":{"skippedExcluded":…,"skippedBelowFloor":…}` where `skippedBelowFloor` is in the tens of thousands and `itemsOk` is ~2,800.
If the JSON has no `skippedBelowFloor`, or the call returns 504 after ~300s, the old deploy served it: wait 2 more minutes and repeat.

- [ ] **Step 4: Apply the scope config**

Run: `npm run db:config-patch -- config/patches/2026-09-24-category-scope-funnel.json`
Expected: `config_versions 11 -> <new id>: category scope funnel …` followed by diff lines for `excluded_categories`, `ingest_min_volume`, `enrich_categories`, `enrich_max_per_event`, `enrich_concurrency`. It must **not** list `max_days_to_close` (540 is carried forward).

- [ ] **Step 5: Ingest the full scope**

```bash
SECRET=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d "\"'\r")
curl -s -m 330 -w '\nHTTP %{http_code} in %{time_total}s\n' -H "Authorization: Bearer $SECRET" https://afterlight-mu.vercel.app/api/jobs/ingest
```

Expected: `HTTP 200` in under 300s (design estimate ~90s); `itemsOk` in the low thousands (~4,000 on 2026-09-22 — the universe moves daily); `itemsFailed` 0 or near it; `skippedExcluded` ~26,000; `skippedBelowFloor` ~83,000. Record `itemsOk`, `skippedBelowFloor` and the time.

- [ ] **Step 6: Verify what was stored**

Create `_x-smoke.ts`:

```ts
import "dotenv/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    select m.category, count(*)::int as n, min(s.volume)::int as min_vol
    from markets m
    join lateral (
      select volume from market_snapshots where ticker = m.ticker order by captured_at desc limit 1
    ) s on true
    where m.updated_at > now() - interval '1 hour'
    group by 1 order by 2 desc`);
  for (const x of (r.rows ?? []) as { category: string | null; n: number; min_vol: number }[]) {
    console.log(`${x.category ?? "(none)"}: ${x.n} stored, min 24h volume ${x.min_vol}`);
  }
}
main().then(() => process.exit(0));
```

Run: `npx tsx _x-smoke.ts; rm -f _x-smoke.ts`
Expected: Sports, Elections, Economics, Politics, Climate and Weather present (possibly a few uncategorized); **every `min 24h volume` ≥ 500**; no Crypto, Financials or Entertainment.

- [ ] **Step 7: Measure the enrich pool (read-only)**

Create `_x-smoke.ts`:

```ts
import "dotenv/config";
import { getActiveConfig } from "@/lib/services/config";
import { selectCandidates } from "@/modules/enrich/run";

async function main() {
  const { id, thresholds } = await getActiveConfig();
  const t0 = Date.now();
  const r = await selectCandidates(thresholds);
  console.log(
    `config ${id}: ${Date.now() - t0}ms, ${r.candidates.length} candidates this run, ` +
      `${r.eligibleUnassessed} eligible and never assessed`,
  );
}
main().then(() => process.exit(0));
```

Run: `npx tsx _x-smoke.ts; rm -f _x-smoke.ts`
Expected: under a few seconds; `40 candidates` unless the pool is smaller. Record `eligibleUnassessed` — the design estimated 591 from volume alone; the spread and freshness gates will lower it. If it is below 40, note in STATUS that enrich covers the whole pool each day.

- [ ] **Step 8: Close the orphaned ingest runs**

Create `_x-smoke.ts`:

```ts
import "dotenv/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    update pipeline_runs
    set status = 'error', finished_at = now(),
        error = 'orphaned: killed at the function ceiling before withRun could record an outcome (backfilled)'
    where status = 'running' and started_at < now() - interval '15 minutes'
    returning id, job, started_at::text`);
  for (const x of (r.rows ?? []) as { id: number; job: string; started_at: string }[]) {
    console.log(`closed ${x.id} ${x.job} ${x.started_at}`);
  }
}
main().then(() => process.exit(0));
```

Run: `npx tsx _x-smoke.ts; rm -f _x-smoke.ts`
Expected: closes the ingest runs started 2026-09-22, 23 and 24 at 12:21 UTC (ids 32, 35, 38) and any later orphan.

- [ ] **Step 9: One paid enrich run (~$0.76)**

```bash
SECRET=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d "\"'\r")
curl -s -m 330 -w '\nHTTP %{http_code} in %{time_total}s\n' -H "Authorization: Bearer $SECRET" https://afterlight-mu.vercel.app/api/jobs/enrich
```

Expected: `HTTP 200` in ≤ 300s; `meta.concurrency` 4; `itemsOk + itemsFailed` ≥ 35, or equal to the Step 7 candidate count if that was smaller; `costUsd` ≈ $0.019 × `itemsOk`. If it is ~12 with `stoppedForTime: true`, concurrency is not in effect — check the deployed commit. If `itemsFailed` is high, read `meta.errorSamples` (a 429 means lowering `enrich_concurrency` with a new config patch).

- [ ] **Step 10: Verify where the money went**

Create `_x-smoke.ts`:

```ts
import "dotenv/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await db.execute(sql`
    with recent as (
      select a.ticker, m.category, m.event_ticker
      from llm_assessments a join markets m on m.ticker = a.ticker
      where a.created_at > now() - interval '15 minutes'
    )
    select
      (select count(*) from recent)::int as total,
      (select string_agg(distinct coalesce(category, '(none)'), ', ') from recent) as categories,
      (select max(c) from (select count(*) as c from recent group by coalesce(event_ticker, ticker)) x)::int as max_per_event`);
  console.log(JSON.stringify((r.rows ?? [])[0]));
}
main().then(() => process.exit(0));
```

Run: `npx tsx _x-smoke.ts; rm -f _x-smoke.ts`
Expected: `total` equals Step 9's `itemsOk`; `categories` is only `Economics` and/or `Politics`; `max_per_event` ≤ 2.

- [ ] **Step 11: Score**

```bash
SECRET=$(sed -n 's/^CRON_SECRET=//p' .env | tr -d "\"'\r")
curl -s -m 120 -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer $SECRET" https://afterlight-mu.vercel.app/api/jobs/score
```

Expected: `HTTP 200`, `itemsFailed` 0.

- [ ] **Step 12: Record the outcome**

In `docs/STATUS.md`:
1. Change the `**Updated:**` date to `2026-09-24`.
2. Insert this section directly above `## ⚠️ 2026-09-21 — the pipeline had been dead for two months`, replacing each `‹…›` with the value recorded in the named step:

```markdown
## 2026-09-24 — category scope funnel

Design: `docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md`. In scope: store Politics, Economics, Elections, Sports and Climate and Weather; analyse Politics + Economics only.

- **Ingest fixed.** It had been killed at the 300s ceiling on every run since crons returned (2026-09-22/23/24). It now stores only markets with 24h volume ≥ 500: ‹itemsOk, Step 5› stored, ‹skippedBelowFloor, Step 5› below the floor, in ‹time, Step 5›.
- **Enrich pool:** ‹eligibleUnassessed, Step 7› eligible Politics + Economics markets after the volume, spread, freshness and time-to-close gates (the design's 591 counted volume only).
- **Enrich throughput:** ‹itemsOk, Step 9› assessments in one run at concurrency 4 (was ~12 sequential), ‹costUsd, Step 9› spent, ≤ 2 per event, only Politics/Economics.
- **Now on cron:** ingest 06:00, enrich 08:00, score 10:00, settle 11:00 UTC (Hobby fires 21–51 min late, hence the gaps). Expected spend ~$23/month.
- **Fixed on the way:** Settings saves no longer reset `max_days_to_close` and other unshown fields; enrich candidate selection no longer loads snapshot history.
```

3. Replace the `### Still open after this pass` heading and its three numbered items with:

```markdown
### Resolved 2026-09-24

The leftover Sports-only config (row 11) is superseded by the scope-funnel row; crons are verified end to end; market data is fresh again. See the section above.
```

In the design spec, change the status line to `**Date:** 2026-09-22 · **Status:** implemented 2026-09-24` and append:

```markdown
## Implementation notes (2026-09-24)

Added during implementation, each recorded in the canonical spec it touches:

- **Snapshot freshness gate (36h)** in `rankCandidates` (`04 §1`). The ingest floor means a market that loses volume stops being refreshed; without the gate it would be assessed against a stale price.
- **Spread ceiling applied.** `04 §1` always required spread ≤ `max_spread`, but candidate selection never checked it; it does now, and an unknown spread fails.
- **Settings carry-forward.** Saving Settings rewrote only the form's fields, resetting `max_days_to_close` 540 → 90, and would have erased every new field. Both config writers now use `applyThresholdsPatch`.
- **`db:config-patch` + committed patch files** as the audit trail for scope changes.
- **Enrich on cron, jobs 2h apart** (`02 §5`): Hobby crons fire 21–51 min late.
```

- [ ] **Step 13: Commit and push**

```bash
git add docs/STATUS.md docs/superpowers/specs/2026-09-22-category-scope-funnel-design.md
git commit -F - <<'EOF'
docs: record the category scope funnel rollout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin main
```

Expected: push succeeds (a docs-only deploy).
