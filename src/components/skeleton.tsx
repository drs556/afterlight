// Loading skeletons (docs/01 §4.4 — every screen has a loading state). The
// pulse animation is CSS, so it's automatically stilled under
// prefers-reduced-motion by the global rule in globals.css.

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-hairline ${className}`} aria-hidden />;
}

export function HeaderSkeleton() {
  return (
    <div className="mb-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-3 w-72" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-hairline" aria-hidden>
      <div className="flex gap-4 border-b border-hairline px-3 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i === 0 ? "w-40 flex-1" : "w-14"}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-hairline px-3 py-3.5 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? "w-48 flex-1" : "w-14"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
