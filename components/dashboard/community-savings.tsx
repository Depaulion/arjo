import { Compass } from "lucide-react";

import type { Circle } from "@/lib/types";
import { JoinCircleButton } from "@/components/dashboard/join-circle-button";
import { CircleCard } from "@/components/dashboard/circles/circle-card";

export type MarketplaceCircle = Circle & { creatorName: string | null };

/**
 * "Community savings": public circles to discover, rendered as rich cards with
 * contribution rate, payout pool, monthly target and social proof, plus a
 * one-tap Join action.
 */
export function CommunitySavings({
  circles,
  joinedIds,
  userId,
}: {
  circles: MarketplaceCircle[];
  joinedIds: string[];
  userId: string;
}) {
  const joined = new Set(joinedIds);

  if (circles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-10 text-center">
        <Compass className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          No public circles to discover yet. Make one of your circles public to
          list it here for others to join.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {circles.map((circle) => (
        <CircleCard
          key={circle.id}
          circle={circle}
          action={
            <JoinCircleButton
              circleId={circle.id}
              userId={userId}
              joined={joined.has(circle.id)}
            />
          }
        />
      ))}
    </div>
  );
}
