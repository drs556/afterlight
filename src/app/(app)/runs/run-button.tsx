"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects its parent form's pending state, so the user
 * sees the job is running (and can't tell whether to click again). Disabled
 * while pending; a spinner + "Running…" label replaces the idle text.
 */
export function RunButton({ job }: { job: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-2 rounded border border-hairline bg-surface px-3 py-1.5 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && (
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-accent"
          aria-hidden
        />
      )}
      {pending ? `Running ${job}…` : `Run ${job}`}
    </button>
  );
}
