import { HeaderSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading runs…</span>
      <HeaderSkeleton />
      <div className="mb-6 flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <Skeleton className="mb-6 h-3 w-96" />
      <TableSkeleton rows={6} cols={7} />
    </div>
  );
}
