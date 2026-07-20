import { db, schema } from "@/db";

export type RunRow = typeof schema.pipelineRuns.$inferSelect;

/** Recent pipeline runs, newest first (docs/01 §3.4). */
export async function getRecentRuns(limit = 50): Promise<RunRow[]> {
  return db.query.pipelineRuns.findMany({
    orderBy: (r, { desc }) => desc(r.startedAt),
    limit,
  });
}

/** Timestamp of the most recent successful ingest — shown in the app header. */
export async function getLastSuccessfulIngest(): Promise<Date | null> {
  const rows = await db.query.pipelineRuns.findMany({
    where: (r, { and, eq, inArray }) =>
      and(eq(r.job, "ingest"), inArray(r.status, ["ok", "partial"])),
    orderBy: (r, { desc }) => desc(r.finishedAt),
    limit: 1,
  });
  return rows[0]?.finishedAt ?? null;
}
