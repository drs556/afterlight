import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { bypassesSessionAuth, SESSION_AUTH_MATCHER } from "@/lib/route-access";

describe("bypassesSessionAuth", () => {
  it("lets job endpoints through so their CRON_SECRET bearer guard can run (docs/02 §7)", () => {
    // Vercel Cron sends a bearer token, never a session cookie. If the session
    // middleware redirects these, the guard in lib/job-auth.ts is unreachable
    // and every cron silently 302s to /login without touching pipeline_runs.
    expect(bypassesSessionAuth("/api/jobs/ingest")).toBe(true);
    expect(bypassesSessionAuth("/api/jobs/enrich")).toBe(true);
    expect(bypassesSessionAuth("/api/jobs/score")).toBe(true);
    expect(bypassesSessionAuth("/api/jobs/settle")).toBe(true);
  });

  it("lets Auth.js's own endpoints through", () => {
    expect(bypassesSessionAuth("/api/auth/signin")).toBe(true);
    expect(bypassesSessionAuth("/api/auth/callback/credentials")).toBe(true);
  });

  it("still guards the UI routes", () => {
    expect(bypassesSessionAuth("/opportunities")).toBe(false);
    expect(bypassesSessionAuth("/settings")).toBe(false);
    expect(bypassesSessionAuth("/runs")).toBe(false);
    expect(bypassesSessionAuth("/markets/ACME-24")).toBe(false);
    expect(bypassesSessionAuth("/")).toBe(false);
  });

  it("does not let a lookalike path masquerade as a job endpoint", () => {
    expect(bypassesSessionAuth("/api/jobsecret")).toBe(false);
    expect(bypassesSessionAuth("/evil/api/jobs/ingest")).toBe(false);
    expect(bypassesSessionAuth("/api/jobs")).toBe(false);
  });
});

describe("SESSION_AUTH_MATCHER", () => {
  // The matcher is what stops the middleware from even being invoked. It has to
  // stay in sync with bypassesSessionAuth; this pins both to the same contract.
  const re = new RegExp(`^${SESSION_AUTH_MATCHER}$`);

  it("excludes job endpoints and Next internals from the middleware", () => {
    expect(re.test("/api/jobs/ingest")).toBe(false);
    expect(re.test("/api/jobs/settle")).toBe(false);
    expect(re.test("/api/auth/signin")).toBe(false);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/favicon.ico")).toBe(false);
  });

  it("still matches the UI routes", () => {
    expect(re.test("/opportunities")).toBe(true);
    expect(re.test("/settings")).toBe(true);
    expect(re.test("/markets/ACME-24")).toBe(true);
  });

  it("is kept in sync with the literal in middleware.ts", () => {
    // Next statically analyses config.matcher, so middleware.ts cannot import
    // it. Reading the source is the only way to stop the two copies drifting —
    // and drift here silently reinstates the cron-redirect bug.
    const source = readFileSync(
      fileURLToPath(new URL("../../src/middleware.ts", import.meta.url)),
      "utf8",
    );
    const literal = source.match(/matcher:\s*\[\s*"([^"]+)"\s*\]/)?.[1];
    expect(literal).toBe(SESSION_AUTH_MATCHER);
  });
});
