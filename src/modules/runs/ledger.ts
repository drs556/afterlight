import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type JobName = "ingest" | "enrich" | "score" | "settle";

export interface RunResult {
  itemsOk: number;
  itemsFailed: number;
  costUsd?: number;
  meta?: Record<string, unknown>;
}

/**
 * Wrap a job body in a pipeline_runs ledger entry (docs/02 §1, §8.5).
 * Records start, then success/failure with counts — every failure lands here
 * so the Runs page can surface it.
 */
export async function withRun(
  job: JobName,
  body: () => Promise<RunResult>,
): Promise<{ runId: number; result?: RunResult; error?: string }> {
  const [run] = await db
    .insert(schema.pipelineRuns)
    .values({ job, status: "running" })
    .returning({ id: schema.pipelineRuns.id });
  const runId = run!.id;

  try {
    const result = await body();
    await db
      .update(schema.pipelineRuns)
      .set({
        status: result.itemsFailed > 0 ? "partial" : "ok",
        finishedAt: new Date(),
        itemsOk: result.itemsOk,
        itemsFailed: result.itemsFailed,
        costUsd: String(result.costUsd ?? 0),
        meta: result.meta ?? null,
      })
      .where(eq(schema.pipelineRuns.id, runId));
    return { runId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.pipelineRuns)
      .set({ status: "error", finishedAt: new Date(), error: message })
      .where(eq(schema.pipelineRuns.id, runId));
    return { runId, error: message };
  }
}

/** Is a job currently running? Used to disable "Run now" (docs/01 §3.4). */
export async function isJobRunning(job: JobName): Promise<boolean> {
  const rows = await db.query.pipelineRuns.findMany({
    where: eq(schema.pipelineRuns.job, job),
    orderBy: (r, { desc }) => desc(r.startedAt),
    limit: 1,
  });
  return rows[0]?.status === "running";
}
