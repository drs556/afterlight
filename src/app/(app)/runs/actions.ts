"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withRun, isJobRunning } from "@/modules/runs/ledger";
import { runIngest } from "@/modules/kalshi/ingest";
import { runSettle } from "@/modules/kalshi/settle";
import { runEnrich } from "@/modules/enrich/run";

const jobBodies = {
  ingest: runIngest,
  enrich: runEnrich,
  settle: runSettle,
} as const;

export type RunnableJob = keyof typeof jobBodies;

/**
 * "Run now" server action (docs/01 §3.4). Session-authed (not the cron bearer),
 * idempotent, and a no-op if the job is already running.
 */
export async function runJobNow(job: RunnableJob): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  if (await isJobRunning(job)) return;
  await withRun(job, jobBodies[job]);
  revalidatePath("/runs");
}
