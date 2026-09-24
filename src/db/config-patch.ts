import "dotenv/config";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { applyThresholdsPatch, thresholdsSchema, weightsSchema } from "../lib/config-schema";

/**
 * Append a config_versions row that changes only the named thresholds and
 * carries everything else forward (config is append-only — CLAUDE.md):
 *
 *   npm run db:config-patch -- config/patches/<file>.json
 *
 * The file is { "note": string, "thresholds": { ...fields } }. Patch files are
 * committed, so git holds the audit trail of every scope change. Unknown field
 * names are rejected. Prints the resulting diff.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const path = process.argv[2];
  if (!path) throw new Error("usage: npm run db:config-patch -- <patch.json>");

  const file = JSON.parse(readFileSync(path, "utf8")) as { note?: unknown; thresholds?: unknown };
  if (typeof file.note !== "string" || file.note.trim() === "") {
    throw new Error('patch needs a non-empty "note"');
  }
  if (!file.thresholds || typeof file.thresholds !== "object" || Array.isArray(file.thresholds)) {
    throw new Error('patch needs a "thresholds" object');
  }

  const db = drizzle(neon(url), { schema });
  const current = await db.query.configVersions.findFirst({
    orderBy: (c, { desc }) => desc(c.createdAt),
  });
  if (!current) throw new Error("No config_version found — run the seed script");

  const before = thresholdsSchema.parse(current.thresholds);
  const after = applyThresholdsPatch(before, file.thresholds as Record<string, unknown>);

  const [row] = await db
    .insert(schema.configVersions)
    .values({ weights: weightsSchema.parse(current.weights), thresholds: after, note: file.note })
    .returning({ id: schema.configVersions.id });

  console.log(`config_versions ${current.id} -> ${row!.id}: ${file.note}`);
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) console.log(`  ${key}: ${a} -> ${b}`);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
