/**
 * Which paths the session middleware must NOT intercept (docs/02 §7).
 *
 * Two layers guard the same contract:
 *
 * 1. `SESSION_AUTH_MATCHER` is Next's build-time `config.matcher`. It must be a
 *    string literal in `middleware.ts` (Next statically analyses it), so the
 *    copy there and the copy here are kept in sync by a test rather than by an
 *    import.
 * 2. `bypassesSessionAuth` is the runtime check inside the middleware body —
 *    defence in depth for the case where the matcher is edited and drifts.
 *
 * Why this matters: Vercel Cron authenticates with `Authorization: Bearer
 * ${CRON_SECRET}` and never carries a session cookie. When the session
 * middleware redirected `/api/jobs/*` to `/login`, the bearer guard in
 * `lib/job-auth.ts` became unreachable and every cron 302'd silently — without
 * reaching `withRun()`, so no `pipeline_runs` row recorded the failure.
 */

/** Path prefixes that authenticate themselves instead of via a session. */
const SELF_GUARDED_PREFIXES = [
  // Auth.js's own sign-in/callback endpoints.
  "/api/auth/",
  // Job endpoints — guarded by the CRON_SECRET bearer token (docs/02 §7).
  "/api/jobs/",
] as const;

/**
 * True when `pathname` guards itself and the session middleware must let it
 * through. Intentionally stricter than `SESSION_AUTH_MATCHER`: it requires a
 * non-empty segment after the prefix, so a bare `/api/jobs` or a lookalike like
 * `/api/jobsecret` is still treated as a protected route.
 */
export function bypassesSessionAuth(pathname: string): boolean {
  return SELF_GUARDED_PREFIXES.some(
    (prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length,
  );
}

/**
 * Mirror of the `config.matcher` literal in `middleware.ts`. A coarse
 * prefix-based exclusion so the middleware is never even invoked for these
 * paths; `bypassesSessionAuth` is the precise runtime check.
 */
export const SESSION_AUTH_MATCHER =
  "/((?!api/auth|api/jobs|_next/static|_next/image|favicon.ico).*)";
