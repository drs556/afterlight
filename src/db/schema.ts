import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  doublePrecision,
  numeric,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";

// Data model per docs/02_ARCHITECTURE.md §4.
// Non-negotiables: market_snapshots / llm_assessments / scores are APPEND-ONLY
// (never updated or deleted) to preserve calibration integrity.

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const markets = pgTable("markets", {
  ticker: text("ticker").primaryKey(),
  eventTicker: text("event_ticker"),
  seriesTicker: text("series_ticker"),
  title: text("title").notNull(),
  category: text("category"),
  rulesSummary: text("rules_summary"),
  resolutionSource: text("resolution_source"),
  closeTime: timestamp("close_time", { withTimezone: true }),
  status: text("status"),
  kalshiUrl: text("kalshi_url"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: serial("id").primaryKey(),
    ticker: text("ticker")
      .notNull()
      .references(() => markets.ticker),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    yesBid: doublePrecision("yes_bid"),
    yesAsk: doublePrecision("yes_ask"),
    yesMid: doublePrecision("yes_mid"),
    volume: bigint("volume", { mode: "number" }),
    openInterest: bigint("open_interest", { mode: "number" }),
    spread: doublePrecision("spread"),
    raw: jsonb("raw"),
  },
  (t) => ({
    tickerCapturedIdx: index("market_snapshots_ticker_captured_idx").on(t.ticker, t.capturedAt),
  }),
);

export const newsItems = pgTable("news_items", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  source: text("source"),
  headline: text("headline"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  snippet: text("snippet"),
  raw: jsonb("raw"),
});

export const marketNews = pgTable("market_news", {
  id: serial("id").primaryKey(),
  marketTicker: text("market_ticker")
    .notNull()
    .references(() => markets.ticker),
  newsId: integer("news_id")
    .notNull()
    .references(() => newsItems.id),
  relevanceScore: doublePrecision("relevance_score"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
});

export const llmAssessments = pgTable("llm_assessments", {
  id: serial("id").primaryKey(),
  ticker: text("ticker")
    .notNull()
    .references(() => markets.ticker),
  snapshotId: integer("snapshot_id").references(() => marketSnapshots.id),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  pEstimate: doublePrecision("p_estimate"),
  pLow: doublePrecision("p_low"),
  pHigh: doublePrecision("p_high"),
  rationale: jsonb("rationale"), // { thesis, evidence_for[], evidence_against[], change_triggers[] }
  citations: jsonb("citations"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costUsd: numeric("cost_usd"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const configVersions = pgTable("config_versions", {
  id: serial("id").primaryKey(),
  weights: jsonb("weights").notNull(),
  thresholds: jsonb("thresholds").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only — this is the immutable prediction log.
export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  ticker: text("ticker")
    .notNull()
    .references(() => markets.ticker),
  snapshotId: integer("snapshot_id").references(() => marketSnapshots.id),
  assessmentId: integer("assessment_id").references(() => llmAssessments.id),
  configVersion: integer("config_version")
    .notNull()
    .references(() => configVersions.id),
  pMarket: doublePrecision("p_market"),
  pModel: doublePrecision("p_model"),
  pModelLow: doublePrecision("p_model_low"),
  pModelHigh: doublePrecision("p_model_high"),
  feeAdjustedCost: doublePrecision("fee_adjusted_cost"),
  netEdge: doublePrecision("net_edge"),
  // Direction the edge/argmax selected ("yes" | "no") — needed for paper PnL
  // (docs/04 §6.2, §9) and to interpret feeAdjustedCost/netEdge correctly.
  direction: text("direction"),
  confidenceTier: text("confidence_tier"),
  kellyFull: doublePrecision("kelly_full"),
  kellyUsed: doublePrecision("kelly_used"),
  sizeCappedReason: text("size_capped_reason"),
  rankingScore: doublePrecision("ranking_score"),
  actionable: boolean("actionable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resolutions = pgTable("resolutions", {
  ticker: text("ticker")
    .primaryKey()
    .references(() => markets.ticker),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  outcome: text("outcome"),
  settlementSource: text("settlement_source"),
});

export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  itemsOk: integer("items_ok").default(0),
  itemsFailed: integer("items_failed").default(0),
  costUsd: numeric("cost_usd").default("0"),
  error: text("error"),
  meta: jsonb("meta"),
});
