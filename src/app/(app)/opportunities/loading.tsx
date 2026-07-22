import { HeaderSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading opportunities…</span>
      <HeaderSkeleton />
      <Skeleton className="mb-4 h-3 w-64" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-48 flex-1" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}
