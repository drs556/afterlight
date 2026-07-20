import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/opportunities",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error;
  }
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        action={login}
        className="w-full max-w-sm rounded-md border border-hairline bg-surface p-6"
      >
        <h1 className="mb-1 text-lg font-medium tracking-tight">Afterlight Edge</h1>
        <p className="mb-6 text-sm text-muted">Sign in to continue.</p>

        {searchParams.error && (
          <p className="mb-4 text-sm text-edgeNeg">Invalid email or password.</p>
        )}

        <label className="mb-1 block text-sm text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="mb-4 w-full rounded border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-1 block text-sm text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-6 w-full rounded border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <button
          type="submit"
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
