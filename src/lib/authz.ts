import { auth } from "@/lib/auth";

export type Role = "admin" | "viewer";

/**
 * Role of the current session, or null if unauthenticated. Anything that is not
 * exactly "admin" collapses to "viewer" — least privilege by default (docs/01 §1).
 */
export async function getRole(): Promise<Role | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user.role === "admin" ? "admin" : "viewer";
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

/**
 * Server-side guard for mutating actions (Settings writes, running jobs). This
 * is the real enforcement — UI hiding is only cosmetic. Throws on failure.
 */
export async function requireAdmin(): Promise<void> {
  const role = await getRole();
  if (role === null) throw new Error("Unauthorized");
  if (role !== "admin") throw new Error("Forbidden: admin role required");
}
