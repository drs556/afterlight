import { NextResponse } from "next/server";

/**
 * Guard job endpoints with the CRON_SECRET bearer token (docs/02 §7).
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
 * the env var is set. Returns a 401 response if the token is missing/wrong,
 * or null when the request is authorized.
 */
export function checkCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
