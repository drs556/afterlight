CREATE TABLE IF NOT EXISTS "config_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"weights" jsonb NOT NULL,
	"thresholds" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"snapshot_id" integer,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"p_estimate" double precision,
	"p_low" double precision,
	"p_high" double precision,
	"rationale" jsonb,
	"citations" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_news" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_ticker" text NOT NULL,
	"news_id" integer NOT NULL,
	"relevance_score" double precision,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"yes_bid" double precision,
	"yes_ask" double precision,
	"yes_mid" double precision,
	"volume" bigint,
	"open_interest" bigint,
	"spread" double precision,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markets" (
	"ticker" text PRIMARY KEY NOT NULL,
	"event_ticker" text,
	"series_ticker" text,
	"title" text NOT NULL,
	"category" text,
	"rules_summary" text,
	"resolution_source" text,
	"close_time" timestamp with time zone,
	"status" text,
	"kalshi_url" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"source" text,
	"headline" text,
	"published_at" timestamp with time zone,
	"snippet" text,
	"raw" jsonb,
	CONSTRAINT "news_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_ok" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"cost_usd" numeric DEFAULT '0',
	"error" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resolutions" (
	"ticker" text PRIMARY KEY NOT NULL,
	"resolved_at" timestamp with time zone,
	"outcome" text,
	"settlement_source" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"snapshot_id" integer,
	"assessment_id" integer,
	"config_version" integer NOT NULL,
	"p_market" double precision,
	"p_model" double precision,
	"p_model_low" double precision,
	"p_model_high" double precision,
	"fee_adjusted_cost" double precision,
	"net_edge" double precision,
	"confidence_tier" text,
	"kelly_full" double precision,
	"kelly_used" double precision,
	"size_capped_reason" text,
	"ranking_score" double precision,
	"actionable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_assessments" ADD CONSTRAINT "llm_assessments_ticker_markets_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."markets"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_assessments" ADD CONSTRAINT "llm_assessments_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_news" ADD CONSTRAINT "market_news_market_ticker_markets_ticker_fk" FOREIGN KEY ("market_ticker") REFERENCES "public"."markets"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_news" ADD CONSTRAINT "market_news_news_id_news_items_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_ticker_markets_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."markets"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_ticker_markets_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."markets"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_ticker_markets_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."markets"("ticker") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_assessment_id_llm_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."llm_assessments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scores" ADD CONSTRAINT "scores_config_version_config_versions_id_fk" FOREIGN KEY ("config_version") REFERENCES "public"."config_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_snapshots_ticker_captured_idx" ON "market_snapshots" USING btree ("ticker","captured_at");