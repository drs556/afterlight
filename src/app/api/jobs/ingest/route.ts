import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/job-auth";
import { withRun } from "@/modules/runs/ledger";
import { runIngest } from "@/modules/kalshi/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const unauthorized = checkCronAuth(req);
  if (unauthorized) return unauthorized;

  const { runId, result, error } = await withRun("ingest", runIngest);
  if (error) return NextResponse.json({ runId, error }, { status: 500 });
  return NextResponse.json({ runId, ...result });
}
