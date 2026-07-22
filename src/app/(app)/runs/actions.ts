"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { withRun, isJobRunning } from "@/modules/runs/ledger";
import { runIngest } from "@/modules/kalshi/ingest";
import { runSettle } from "@/modules/kalshi/settle";
import { runEnrich } from "@/modules/enrich/run";
import { runScore } from "@/lib/services/score-run";

const jobBodies = {
  ingest: runIngest,
  enrich: runEnrich,
  score: runScore,
  settle: runSettle,
} as const;

export type RunnableJob = keyof typeof jobBodies;

/**
 * "Run now" server action (docs/01 §3.4). Admin-only (docs/01 §1 — viewers are
 * read-only and cannot spend on enrich), idempotent, and a no-op if the job is
 * already running.
 */
export async function runJobNow(job: RunnableJob): Promise<void> {
  await requireAdmin();

  if (await isJobRunning(job)) return;
  await withRun(job, jobBodies[job]);
  revalidatePath("/runs");
}
