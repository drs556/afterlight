"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for every screen under (app) (docs/01 §4.4).
 * States what happened and what to do; no apology, no vague copy.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Message only — never logs secrets (docs/02 non-negotiables).
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-md border border-hairline bg-surface p-6" role="alert">
      <h2 className="text-base font-medium text-text">This screen didn&rsquo;t load</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Fetching data for this page failed. This is usually transient — try again. If it keeps
        happening, check the <span className="text-text">Runs</span> page for a failed job, or the
        database connection.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted">
          Reference: <span className="tnum">{error.digest}</span>
        </p>
      )}
      <div className="mt-4">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-hairline bg-surface px-3 py-1.5 text-sm hover:border-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
