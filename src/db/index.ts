import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";

// neon-http sends every query as an HTTP `fetch`, and Next.js 14 caches fetches
// made inside route handlers. Without `no-store`, a repeated identical query is
// answered from that cache: reads return stale rows (the jobs kept reading an
// old config_versions row) and identical writes never reach the database (a
// second pipeline_runs insert returned the first row's id without creating a
// row). The database must always be asked, in every context.
const sql = neon(env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
export const db = drizzle(sql, { schema });
export { schema };
