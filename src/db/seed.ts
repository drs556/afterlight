import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

// Seed: admin user + default config_version + category exclusions.
// Idempotent — safe to re-run (docs/02 §8.7).
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to seed");
  const db = drizzle(neon(url), { schema });

  const email = process.env.ADMIN_EMAIL ?? "admin@afterlight.local";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is required to seed the admin user");

  const existingUser = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!existingUser) {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.insert(schema.users).values({ email, passwordHash, role: "admin" });
    console.log(`✅ Seeded admin user: ${email}`);
  } else {
    console.log(`↩︎  Admin user already exists: ${email}`);
  }

  const existingConfig = await db.query.configVersions.findFirst();
  if (!existingConfig) {
    // Defaults from docs/04 §5 (weights) and §§1,3,6 (thresholds).
    await db.insert(schema.configVersions).values({
      weights: { w_mkt: 0.55, w_llm: 0.3, w_base: 0.15 },
      thresholds: {
        net_edge_min: 0.05,
        net_edge_min_longshot: 0.08,
        min_volume: 500,
        max_spread: 0.08,
        exit_friction: 0.01,
        excluded_categories: ["crypto", "sports"],
      },
      note: "seed default",
    });
    console.log("✅ Seeded default config_version (crypto & sports excluded)");
  } else {
    console.log("↩︎  config_version already exists");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
