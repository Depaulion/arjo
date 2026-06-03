import { Compass, Users } from "lucide-react";

import { CIRCLE_FREQUENCIES, type Circle } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { JoinCircleButton } from "@/components/dashboard/join-circle-button";

export type MarketplaceCircle = Circle & { creatorName: string | null };

function frequencyLabel(value: Circle["frequency"]) {
  return CIRCLE_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

export function Marketplace({
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
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
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
      {circles.map((circle) => {
        const pool = circle.contribution_amount * circle.member_count;
        return (
          <div
            key={circle.id}
            className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4 transition-colors hover:border-primary/40"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{circle.name}</p>
                <Badge variant="accent">{circle.currency}</Badge>
              </div>
              {circle.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {circle.description}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {circle.contribution_amount.toLocaleString()} {circle.currency} ·{" "}
                {frequencyLabel(circle.frequency)}
                {circle.creatorName ? ` · by ${circle.creatorName}` : ""}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {circle.member_count} members · {pool.toLocaleString()}{" "}
                {circle.currency} pool
              </span>
              <JoinCircleButton
                circleId={circle.id}
                userId={userId}
                joined={joined.has(circle.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
