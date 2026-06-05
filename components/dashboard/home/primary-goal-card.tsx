import Link from "next/link";
import { ArrowRight, Plus, Target } from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Pick a friendly emoji for a goal from its name. */
export function goalEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/(laptop|macbook|pc|computer)/.test(n)) return "💻";
  if (/(phone|iphone|gadget|device|airpod|watch)/.test(n)) return "📱";
  if (/(school|tuition|educat|course|degree|book)/.test(n)) return "🎓";
  if (/(rent|house|home|apartment)/.test(n)) return "🏠";
  if (/(car|vehicle|bike|motor)/.test(n)) return "🚗";
  if (/(travel|trip|flight|vacation|holiday)/.test(n)) return "✈️";
  if (/(wedding|ring|marriage)/.test(n)) return "💍";
  if (/(emergency|safety|rainy)/.test(n)) return "🛟";
  return "🎯";
}

/**
 * The "what am I saving for" card — the user's primary goal with a clear
 * progress bar, how much is left, and a single CTA to keep going.
 */
export function PrimaryGoalCard({
  name,
  saved,
  target,
  targetDate,
  currency,
}: {
  name: string;
  saved: number;
  target: number;
  targetDate: string | null;
  currency: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const remaining = Math.max(0, target - saved);

  let daysLeft: number | null = null;
  if (targetDate) {
    const ms = new Date(targetDate).getTime() - Date.now();
    daysLeft = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-xl">
            {goalEmoji(name)}
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current goal
            </p>
            <p className="text-lg font-semibold leading-tight">{name}</p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {pct}%
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-bold tracking-tight">
            {fmt(saved)}
            <span className="text-base font-medium text-muted-foreground">
              {" "}
              / {fmt(target)} {currency}
            </span>
          </p>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {remaining > 0
            ? `${fmt(remaining)} ${currency} to go`
            : "Goal reached — nice work! 🎉"}
          {daysLeft !== null &&
            remaining > 0 &&
            ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
        </p>
      </div>

      <Link
        href="#save"
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Continue saving
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Empty state shown when the user has no goal yet. */
export function PrimaryGoalEmpty() {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card p-6 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Target className="h-6 w-6" />
      </span>
      <p className="mt-3 text-base font-semibold">Set your first goal</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        Name what you&apos;re saving for and we&apos;ll track your progress and
        forecast your finish date.
      </p>
      <Link
        href="#goals"
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Create a goal
      </Link>
    </div>
  );
}
