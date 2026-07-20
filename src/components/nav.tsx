import Link from "next/link";
import { signOut } from "@/lib/auth";

const links = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/track-record", label: "Track record" },
  { href: "/runs", label: "Runs" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-6">
          <span className="text-sm font-medium tracking-tight">Afterlight Edge</span>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm text-muted hover:text-text">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
