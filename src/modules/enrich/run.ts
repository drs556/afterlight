import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Thresholds } from "@/lib/config-schema";
import {
  MAX_SNAPSHOT_AGE_HOURS,
  rankCandidates,
  type Candidate,
  type CandidateInput,
} from "./select";
import { runPool } from "./pool";
import { db, schema } from "@/db";
import { getActiveConfig } from "@/lib/services/config";
import { getNewsClients, retrieveNews } from "@/modules/news";
import { getLlmClient } from "@/modules/llm";
import type { RunResult } from "@/modules/runs/ledger";

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

async function upsertNewsItem(item: {
  url: string;
  source: string | null;
  headline: string;
  publishedAt: Date | null;
  snippet: string | null;
  raw: unknown;
}): Promise<number> {
  const [row] = await db
    .insert(schema.newsItems)
    .values({
      url: item.url,
      source: item.source,
      headline: item.headline,
      publishedAt: item.publishedAt,
      snippet: item.snippet,
      raw: item.raw,
    })
    .onConflictDoUpdate({
      target: schema.newsItems.url,
      set: { headline: item.headline },
    })
    .returning({ id: schema.newsItems.id });
  return row!.id;
}

/** Sum of enrich-run cost_usd since local midnight (the daily budget window). */
async function enrichSpendTodayUsd(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const runs = await db.query.pipelineRuns.findMany({
    where: (r, { and, eq, gte }) => and(eq(r.job, "enrich"), gte(r.startedAt, start)),
  });
  return runs.reduce((sum, r) => sum + Number(r.costUsd ?? 0), 0);
}
