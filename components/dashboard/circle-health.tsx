import Link from "next/link";
import { Activity, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";

import { CIRCLE_FREQUENCIES, type Circle, type CircleRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export type HealthCircle = Circle & { role: CircleRole };

function frequencyLabel(value: Circle["frequency"]) {
  return CIRCLE_FREQUENCIES.find((f) => f.value === value)?.label ?? value;
}

export function CircleHealth({
  circles,
  consistency,
}: {
  circles: HealthCircle[];
  /** 0–1 personal contribution consistency, from the coach. */
  consistency: number;
}) {
  const total = circles.length;
  const active = circles.filter((c) => c.status === "active").length;
  const activeRatio = total > 0 ? active / total : 0;
  const stabilityScore = Math.round(
    100 * (0.55 * consistency + 0.45 * activeRatio)
  );

  const insight =
    total === 0
      ? "Join or create a circle to start building portfolio stability. Saving in a group keeps your contributions consistent."
      : stabilityScore >= 70
      ? `Your ${total}-circle portfolio is stable. Consistent contributions and ${active} active circle${
          active === 1 ? "" : "s"
        } are keeping risk low — a great position to take an earlier payout slot.`
      : stabilityScore >= 45
      ? `Your portfolio is moderately stable. Lifting your contribution consistency is the fastest way to raise this score and your reputation.`
      : `Your portfolio needs attention. ${
          total - active
        } circle${total - active === 1 ? " is" : "s are"} still forming — contribute regularly to build momentum.`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-secondary/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Contribution consistency
          </p>
          <p className="mt-1 text-2xl font-bold">
            {Math.round(consistency * 100)}%
          </p>
        </div>
        <div className="rounded-xl bg-secondary/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Stability score
          </p>
          <p className="mt-1 text-2xl font-bold">{stabilityScore}/100</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">{insight}</p>
      </div>

      {circles.length > 0 && (
        <ul className="space-y-2">
          {circles.map((circle) => (
            <li key={circle.id}>
              <Link
                href={`/circles/${circle.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
              >
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {circle.name}
                    {circle.role === "creator" && (
                      <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
                        Creator
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {circle.contribution_amount.toLocaleString()}{" "}
                    {circle.currency} · {frequencyLabel(circle.frequency)} ·{" "}
                    {circle.member_count} members
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={circle.status === "active" ? "default" : "outline"}
                  >
                    {circle.status}
                  </Badge>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
