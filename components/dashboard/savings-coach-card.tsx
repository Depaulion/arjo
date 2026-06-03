import { Brain, Lightbulb, Sparkles, TrendingUp } from "lucide-react";

import type { SavingsCoachAnalysis } from "@/lib/savings-coach";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#coachGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="coachGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none">{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

const FACTOR_LABELS: Record<string, string> = {
  consistency: "Consistency",
  activity: "Activity",
  engagement: "Engagement",
  funded: "Funded",
};

export function SavingsCoachCard({
  coach,
  currency = "USDC",
}: {
  coach: SavingsCoachAnalysis;
  currency?: string;
}) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg">AI Savings Coach</CardTitle>
              <CardDescription>
                Your personalised savings health and outlook.
              </CardDescription>
            </div>
          </div>
          <Badge variant={coach.source === "ai" ? "accent" : "outline"}>
            <Sparkles className="h-3.5 w-3.5" />
            {coach.source === "ai" ? "Claude" : "Smart engine"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ScoreRing score={coach.healthScore} />
          <div className="space-y-2">
            <p className="text-sm font-semibold">{coach.healthLabel} health</p>
            <p className="text-sm text-muted-foreground">{coach.summary}</p>
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            Object.keys(coach.factors) as Array<keyof typeof coach.factors>
          ).map((key) => (
            <div
              key={key}
              className="rounded-xl bg-secondary/40 px-3 py-2.5"
            >
              <p className="text-xs text-muted-foreground">
                {FACTOR_LABELS[key]}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${Math.round(coach.factors[key] * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Projections */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Weekly projection
            </p>
            <p className="mt-1 text-xl font-bold">
              {coach.weeklyProjection.toLocaleString()}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {currency}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-accent-foreground" />
              4-week projection
            </p>
            <p className="mt-1 text-xl font-bold">
              {coach.monthlyProjection.toLocaleString()}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                {currency}
              </span>
            </p>
          </div>
        </div>

        {/* Recommendations */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="h-4 w-4 text-primary" />
            Recommendations
          </p>
          <ul className="space-y-1.5">
            {coach.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
