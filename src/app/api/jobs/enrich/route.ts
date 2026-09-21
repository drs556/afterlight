import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/job-auth";
import { withRun } from "@/modules/runs/ledger";
import { runEnrich } from "@/modules/enrich/run";

export const dynamic = "force-dynamic";
/**
 * Must stay >= `enrich_max_seconds` + the 60s per-call LLM timeout, or the
 * wall-clock guard in runEnrich can't stop the batch before the platform kills
 * it. At the 240s default that worst case is exactly 300s (docs/03 §3).
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const unauthorized = checkCronAuth(req);
  if (unauthorized) return unauthorized;

  const { runId, result, error } = await withRun("enrich", runEnrich);
  if (error) return NextResponse.json({ runId, error }, { status: 500 });
  return NextResponse.json({ runId, ...result });
}
