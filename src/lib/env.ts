import { z } from "zod";

// Fail loudly at boot if configuration is missing (docs/02 §7).
const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  ADMIN_EMAIL: z.string().email().default("admin@afterlight.local"),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  CRON_SECRET: z.string().min(8).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
