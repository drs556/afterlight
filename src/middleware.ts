import { auth } from "@/lib/auth";

// All routes except /login require an authenticated session (docs/01 §1).
export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLogin = req.nextUrl.pathname.startsWith("/login");

  if (!isLoggedIn && !isLogin) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isLogin) {
    return Response.redirect(new URL("/opportunities", req.nextUrl));
  }
});

export const config = {
  // Protect everything except Next internals, auth API, and static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
