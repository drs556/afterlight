import { HeaderSkeleton, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading settings…</span>
      <HeaderSkeleton />
      <div className="max-w-lg space-y-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-3 w-32" />
            <Skeleton className="h-9 w-full rounded" />
          </div>
        ))}
        <Skeleton className="h-9 w-28 rounded" />
      </div>
    </div>
  );
}
