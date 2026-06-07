import { ArrowRight, Sparkles } from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * The AI Savings Coach, distilled to a single actionable tip on Home.
 * Speaks in plain language about what to do next — no vague health labels.
 */
export function AICoachTip({
  monthlyProjection,
  weeklyProjection,
  recommendation,
  currency,
}: {
  monthlyProjection: number;
  weeklyProjection: number;
  /** The single most relevant recommendation string from the coach. */
  recommendation: string;
  currency: string;
}) {
  // Lead with the concrete projection, then the human nudge.
  const headline =
    monthlyProjection > 0
      ? `You're on track to save about ${fmt(
          monthlyProjection
        )} ${currency} this month.`
      : "Make a small contribution this week to kick-start your savings.";

  return (
    <div className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-primary/10 p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/20 text-accent">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold">
          AI Coach
          <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Beta
          </span>
        </p>
      </div>

      <p className="mt-3 text-[15px] font-medium leading-relaxed">{headline}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{recommendation}</p>

      <a
        href="#save"
        className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
      >
        Save now
        <ArrowRight className="h-4 w-4" />
      </a>
      {weeklyProjection > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          At your current pace that&apos;s ~{fmt(weeklyProjection)} {currency} a
          week.
        </p>
      )}
    </div>
  );
}
