import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Thresholds } from "@/lib/config-schema";
import {
  MAX_SNAPSHOT_AGE_HOURS,
  rankCandidates,
  type Candidate,
  type CandidateInput,
} from "./select";
import { db, schema } from "@/db";
import { getActiveConfig } from "@/lib/services/config";
import { getNewsClients, retrieveNews } from "@/modules/news";
import { getLlmClient } from "@/modules/llm";
import type { RunResult } from "@/modules/runs/ledger";

/**
 * Enrichment job (docs/02 §5, docs/03 §3, docs/04 §4):
 * pick top-K candidate markets by liquidity × proximity-to-close × staleness,
 * retrieve+dedupe+filter news, run one LLM assessment each, and store news,
 * market_news, and llm_assessments (append-only).
 *
 * Budget-guarded: reads a daily USD cap from config, tracks today's enrich
 * spend, and stops-and-logs when exceeded — never overspends.
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

  // Wall-clock budget: stop starting new assessments before the serverless
  // timeout. Candidates are stalest-first, so a re-run picks up the rest.
  const startedAt = Date.now();
  const maxMs = thresholds.enrich_max_seconds * 1000;

  for (const c of candidates) {
    if (spentToday + runCost >= budget) {
      stoppedForBudget = true;
      break;
    }
    if (Date.now() - startedAt >= maxMs) {
      stoppedForTime = true;
      break;
    }
    try {
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

      runCost += assessment.costUsd;
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
  }

  // True backlog: eligible markets with no assessment, less the ones this run
  // just assessed (successes come off the top of the un-assessed queue). When
  // this hits 0, every eligible market has an assessment; further runs only
  // refresh the stalest.
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
      remaining,
      errorSamples,
    },
  };
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
