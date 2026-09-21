import { auth } from "@/lib/auth";
import { bypassesSessionAuth } from "@/lib/route-access";

// All routes except /login require an authenticated session (docs/01 §1).
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Job endpoints authenticate with the CRON_SECRET bearer token instead of a
  // session (docs/02 §7) — redirecting them here would make that guard
  // unreachable. See lib/route-access.ts.
  if (bypassesSessionAuth(pathname)) return;

  const isLoggedIn = !!req.auth;
  const isLogin = pathname.startsWith("/login");

  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL("/opportunities", req.nextUrl));
  }
});

export const config = {
  // Protect everything except Next internals, static assets, and the routes
  // that guard themselves (auth API, job endpoints). Next requires this to be a
  // static literal, so it is mirrored by SESSION_AUTH_MATCHER in
  // lib/route-access.ts and pinned by tests/lib/route-access.test.ts.
  matcher: ["/((?!api/auth|api/jobs|_next/static|_next/image|favicon.ico).*)"],
};
