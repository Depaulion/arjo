import { Skeleton } from "@/components/ui/skeleton";

/**
 * Circle dashboard loading skeleton — rendered while the circle page resolves
 * its ledger pot, contributors, governance and on-chain data. Mirrors the
 * page's header, round banner, stat-card grid and activity list.
 */
export default function CircleLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      <div className="container max-w-4xl space-y-6 py-6">
        {/* Title + round banner */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />

        {/* Contribute / actions */}
        <Skeleton className="h-11 w-full rounded-xl" />

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>

        {/* Activity list */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
