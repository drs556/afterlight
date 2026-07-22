import { eq, inArray } from "drizzle-orm";
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

  const candidates = await selectCandidates(
    thresholds.min_volume,
    thresholds.enrich_top_k,
    thresholds.max_days_to_close,
  );

  let itemsOk = 0;
  let itemsFailed = 0;
  let runCost = 0;
  let stoppedForBudget = false;

  for (const c of candidates) {
    if (spentToday + runCost >= budget) {
      stoppedForBudget = true;
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
    } catch {
      // A failed assessment (schema/API) is logged as a failure, never guessed.
      itemsFailed++;
    }
  }

  return {
    itemsOk,
    itemsFailed,
    costUsd: runCost,
    meta: { stoppedForBudget, spentBeforeRun: spentToday, candidates: candidates.length },
  };
}

interface Candidate {
  ticker: string;
  title: string;
  rulesSummary: string | null;
  resolutionSource: string | null;
  closeTime: Date | null;
  yesMid: number | null;
  snapshotId: number | null;
}

/** Rank active markets by volume × proximity-to-close × staleness; take top K. */
async function selectCandidates(
  minVolume: number,
  topK: number,
  maxDaysToClose: number,
): Promise<Candidate[]> {
  const markets = await db.query.markets.findMany({
    where: eq(schema.markets.status, "active"),
  });
  if (markets.length === 0) return [];

  const tickers = markets.map((m) => m.ticker);
  const snaps = await db.query.marketSnapshots.findMany({
    where: inArray(schema.marketSnapshots.ticker, tickers),
    orderBy: (s, { desc }) => desc(s.capturedAt),
  });
  const latestSnap = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latestSnap.has(s.ticker)) latestSnap.set(s.ticker, s);

  const assessments = await db.query.llmAssessments.findMany({
    where: inArray(schema.llmAssessments.ticker, tickers),
    orderBy: (a, { desc }) => desc(a.createdAt),
  });
  const lastAssessedAt = new Map<string, Date>();
  for (const a of assessments) if (!lastAssessedAt.has(a.ticker)) lastAssessedAt.set(a.ticker, a.createdAt);

  const now = Date.now();
  const scored = markets
    .map((m) => {
      const snap = latestSnap.get(m.ticker);
      const volume = snap?.volume ?? 0;
      const hoursToClose = m.closeTime
        ? (new Date(m.closeTime).getTime() - now) / 3_600_000
        : Infinity;
      const daysToClose = hoursToClose / 24;
      const last = lastAssessedAt.get(m.ticker);
      const stalenessHours = last ? (now - new Date(last).getTime()) / 3_600_000 : 1e6;

      const timeDecay = daysToClose > 0 ? 1 / (1 + daysToClose) : 0;
      const score = volume * timeDecay * (1 + stalenessHours);

      return {
        candidate: {
          ticker: m.ticker,
          title: m.title,
          rulesSummary: m.rulesSummary,
          resolutionSource: m.resolutionSource,
          closeTime: m.closeTime,
          yesMid: snap?.yesMid ?? null,
          snapshotId: snap?.id ?? null,
        } satisfies Candidate,
        volume,
        hoursToClose,
        score,
      };
    })
    // Universe floor (docs/04 §1): enough liquidity, and 6h–maxDaysToClose to close.
    .filter(
      (x) => x.volume >= minVolume && x.hoursToClose >= 6 && x.hoursToClose <= maxDaysToClose * 24,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map((x) => x.candidate);
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
