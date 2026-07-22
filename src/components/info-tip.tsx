"use client";

import { useId, useState } from "react";

/**
 * Accessible "ⓘ" affordance that reveals a short explanation on hover, focus,
 * or tap (docs/01 §4.1 — every model number links to its explanation). Keyboard
 * and touch reachable; color is never the only carrier of meaning.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-hairline text-[9px] font-medium leading-none text-muted hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-1/2 top-full z-20 mt-1 w-52 -translate-x-1/2 rounded border border-hairline bg-surface px-2 py-1.5 text-left text-xs font-normal normal-case leading-snug text-text shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
