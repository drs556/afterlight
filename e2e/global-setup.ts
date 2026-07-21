import "dotenv/config";
import { runIngest } from "@/modules/kalshi/ingest";
import { runScore } from "@/lib/services/score-run";

/**
 * Ensure at least one market exists before the suite runs, so "opportunities
 * render with seeded data" and "market detail render" (docs/02 §8.3) don't
 * depend on whatever happens to already be in the dev DB. Runs the real job
 * bodies directly (fixture mode unless live keys are set) — idempotent.
 */
export default async function globalSetup(): Promise<void> {
  await runIngest();
  await runScore();
}
