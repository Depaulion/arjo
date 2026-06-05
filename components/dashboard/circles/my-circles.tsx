import Link from "next/link";
import { Plus, Users } from "lucide-react";

import type { HealthCircle } from "@/components/dashboard/circle-health";
import { CircleCard } from "@/components/dashboard/circles/circle-card";

/**
 * The viewer's own circles (created + joined) as rich, tappable cards that link
 * through to each circle's dashboard. Shown above the public marketplace on the
 * Circles tab.
 */
export function MyCircles({ circles }: { circles: HealthCircle[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Your circles</h2>
            <p className="text-sm text-muted-foreground">
              {circles.length > 0
                ? `${circles.length} circle${circles.length === 1 ? "" : "s"} you save in.`
                : "Save together — create one or join below."}
            </p>
          </div>
        </div>
        <Link
          href="/circles/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      {circles.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {circles.map((c) => (
            <CircleCard
              key={c.id}
              circle={c}
              href={`/circles/${c.id}`}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
          You haven&apos;t joined any circles yet. Discover public circles below
          or start your own.
        </div>
      )}
    </div>
  );
}
