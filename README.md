# Afterlight Edge

Decision-support web app for trading Kalshi event markets. See [`docs/`](./docs) for the specs and [`CLAUDE.md`](./CLAUDE.md) for how we build. This is **M0 — Foundation**.

## Stack

Next.js 14 (App Router) · TypeScript strict · Neon Postgres + Drizzle · Auth.js (credentials) · Tailwind · Vitest. Hosted on Vercel.

## Local setup

**Prerequisites:** Node 20+, and a Postgres connection string (a free [Neon](https://neon.tech) database, or local Postgres).

1. Copy env and fill it in:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL`, `AUTH_SECRET` (`openssl rand -base64 32`), and `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

2. One command to install, migrate, and seed:
   ```bash
   npm run setup
   ```

3. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — every route redirects to `/login` until you sign in with the seeded admin credentials.

## Scripts

| Command | Does |
|---|---|
| `npm run setup` | install → migrate → seed (first-run) |
| `npm run dev` | dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run db:generate` | generate a Drizzle migration from schema changes |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed admin user + default config (idempotent) |

## Deploy (Vercel)

1. Import the repo in Vercel; framework auto-detected (Next.js).
2. Set the same env vars from `.env.example` in Project → Settings → Environment Variables (add `CRON_SECRET`).
3. Point `DATABASE_URL` at your Neon database; run `npm run db:migrate && npm run db:seed` against it once.
4. Deploys from `main`. The app requires login at the deployed URL.
