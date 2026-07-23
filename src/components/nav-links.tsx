"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav links with an active-section indicator (the current route is accent-
 * colored so it's distinct from the white brand). prefetch is off so a nav
 * click always fetches fresh dynamic data rather than a stale prefetch.
 */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`text-sm ${active ? "text-accent" : "text-muted hover:text-text"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
