import { Compass } from "lucide-react";

import { CIRCLE_FREQUENCIES, type Circle } from "@/lib/types";
import { JoinCircleButton } from "@/components/dashboard/join-circle-button";

export type MarketplaceCircle = Circle & { creatorName: string | null };

function frequencyLabel(value: Circle["frequency"]) {
  return CIRCLE_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

/** Two-letter monogram for the token-style avatar. */
function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AJ";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Deterministic gradient per circle so each "token" reads distinct. */
const GRADIENTS = [
  "from-primary to-accent",
  "from-accent to-primary",
  "from-fuchsia-500 to-violet-500",
  "from-pink-500 to-purple-500",
  "from-rose-500 to-fuchsia-600",
  "from-violet-500 to-fuchsia-500",
];

function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/**
 * "Community savings" rendered like a crypto holdings list: each public circle
 * is a token row with a gradient monogram, name + cadence subtitle, the pool
 * value on the right, and a one-tap Join action.
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
    <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      {circles.map((circle) => {
        const pool = circle.contribution_amount * circle.member_count;
        return (
          <div
            key={circle.id}
            className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40 sm:px-4"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(
                circle.id
              )} text-sm font-bold text-white shadow-sm`}
            >
              {monogram(circle.name)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">
                {circle.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {frequencyLabel(circle.frequency)} · {circle.member_count}{" "}
                members
                {circle.creatorName ? ` · by ${circle.creatorName}` : ""}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="font-semibold leading-tight tabular-nums">
                {pool.toLocaleString()} {circle.currency}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {circle.contribution_amount.toLocaleString()} / cycle
              </p>
            </div>

            <div className="shrink-0">
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
