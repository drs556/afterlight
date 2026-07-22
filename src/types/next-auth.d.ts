import type { DefaultSession } from "next-auth";

// Carry the user's role through the JWT/session (docs/01 §1). Anything that is
// not "admin" is treated as a read-only "viewer" (least privilege).
declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      role?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}
