import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard loading skeleton — rendered instantly while the async account page
 * fetches (profile, wallet, circles, savings). Mirrors the Home layout (header,
 * hero balance card, quick actions, content cards) so the shell feels stable.
 */
export default function AccountLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </div>
      </div>

      <div className="container max-w-3xl space-y-5 py-6">
        {/* Greeting + status */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-40" />
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>

        {/* Hero balance card */}
        <Skeleton className="h-44 w-full rounded-3xl" />

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>

        {/* Primary goal / coach cards */}
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>

      {/* Floating tab bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 flex justify-center">
        <Skeleton className="h-12 w-72 rounded-full" />
      </div>
    </div>
  );
}
