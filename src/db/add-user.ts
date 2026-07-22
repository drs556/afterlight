import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Add a login user. Credentials come from env vars so the password never
 * appears in shell history args or source:
 *
 *   NEW_USER_EMAIL=a@b.com NEW_USER_PASSWORD='…' npm run db:add-user
 *
 * Optional NEW_USER_ROLE (default "admin"). Note: the app does not yet gate
 * features by role — any valid user can access everything (roles are for the
 * post-MVP multi-user work). Password is bcrypt-hashed at cost 12, matching
 * the seed. Re-running with an existing email is a no-op (use a different
 * script/flow to reset a password).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const email = process.env.NEW_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_USER_PASSWORD;
  const role = process.env.NEW_USER_ROLE?.trim() || "admin";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("NEW_USER_EMAIL must be a valid email address");
  }
  if (!password || password.length < 8) {
    throw new Error("NEW_USER_PASSWORD is required and must be at least 8 characters");
  }

  const db = drizzle(neon(url), { schema });

  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) {
    console.log(`↩︎  User already exists: ${email} (no change)`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(schema.users).values({ email, passwordHash, role });
  console.log(`✅ Added user: ${email} (role: ${role})`);
}

main().catch((err) => {
  console.error("❌ add-user failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
