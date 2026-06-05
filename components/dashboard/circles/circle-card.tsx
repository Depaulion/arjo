import Link from "next/link";
import { ArrowUpRight, CalendarClock, Coins, Trophy, Users } from "lucide-react";

import { CIRCLE_FREQUENCIES, type Circle, type CircleRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function frequencyLabel(value: Circle["frequency"]) {
  return CIRCLE_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

/** A short "per X" cadence noun for the contribution rate. */
function cadenceNoun(value: Circle["frequency"]) {
  return value === "weekly" ? "week" : value === "biweekly" ? "2 wks" : "month";
}

/** Approx contributions per month, to normalise different cadences. */
const PER_MONTH: Record<Circle["frequency"], number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
};

/** Two-letter monogram for the token-style avatar. */
function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AJ";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

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

const STATUS_BADGE: Record<
  Circle["status"],
  { label: string; variant: "default" | "accent" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  forming: { label: "Forming", variant: "outline" },
  completed: { label: "Completed", variant: "accent" },
};

export type CircleCardData = {
  id: string;
  name: string;
  contribution_amount: number;
  currency: string;
  frequency: Circle["frequency"];
  member_count: number;
  status: Circle["status"];
  /** The viewer's role, when they belong to the circle. */
  role?: CircleRole | null;
  /** Display name of the creator, for social proof on public circles. */
  creatorName?: string | null;
};

/**
 * A rich circle card: gradient token, role/status, a stats grid (contribution
 * rate, full payout pool, monthly-normalised target) and a social-proof footer.
 * Renders as a link to the circle when `href` is given, otherwise as a static
 * card with an optional `action` (e.g. a Join button).
 */
export function CircleCard({
  circle,
  href,
  action,
}: {
  circle: CircleCardData;
  href?: string;
  action?: React.ReactNode;
}) {
  const pool = circle.contribution_amount * circle.member_count;
  const monthly = circle.contribution_amount * PER_MONTH[circle.frequency];
  const status = STATUS_BADGE[circle.status];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(
              circle.id
            )} text-sm font-bold text-white shadow-sm`}
          >
            {monogram(circle.name)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold leading-tight">
              {circle.name}
              {circle.role === "creator" && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Creator
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {frequencyLabel(circle.frequency)}
              {circle.creatorName ? ` · by ${circle.creatorName}` : ""}
            </p>
          </div>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-primary" />
            Per {cadenceNoun(circle.frequency)}
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {fmt(circle.contribution_amount)}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Trophy className="h-3 w-3 text-accent" />
            Payout
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmt(pool)}</p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3 text-primary" />
            Monthly
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmt(monthly)}</p>
        </div>
      </div>

      {/* Social proof + action */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 text-primary" />
          {circle.member_count} saving together · {circle.currency}
        </span>
        {action ? (
          <div className="shrink-0">{action}</div>
        ) : href ? (
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>
    </>
  );

  const className =
    "block rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-colors";

  if (href) {
    return (
      <Link href={href} className={`${className} hover:border-primary/40`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
