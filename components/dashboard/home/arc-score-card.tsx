"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";

import { RISK_BADGES } from "@/lib/risk-engine";
import type { RiskTier } from "@/lib/types";

type Factor = { label: string; value: number };

const RISK_BADGE_CLASS: Record<RiskTier, string> = {
  low: "bg-emerald-500/15 text-emerald-500",
  medium: "bg-amber-500/15 text-amber-500",
  high: "bg-red-500/15 text-red-500",
};

/**
 * A single, consolidated reputation number — the Arc Score /100 — replacing the
 * old scatter of stability/engagement/health percentages. Tap to expand the
 * factors that drive it.
 */
export function ArcScoreCard({
  score,
  label,
  factors,
  riskTier,
}: {
  score: number;
  label: string;
  /** Sub-scores 0–1 driving the headline number. */
  factors: {
    consistency: number;
    activity: number;
    engagement: number;
    funded: number;
  };
  /** Rule-based risk tier (migration 0012); shows a coloured trust badge. */
  riskTier?: RiskTier;
}) {
  const [open, setOpen] = useState(false);
  const badge = riskTier ? RISK_BADGES[riskTier] : null;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * c;

  const rows: Factor[] = [
    { label: "Savings consistency", value: factors.consistency },
    { label: "Contribution history", value: factors.activity },
    { label: "Circle participation", value: factors.engagement },
    { label: "Goal funding", value: factors.funded },
  ];

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative h-[84px] w-[84px] shrink-0">
          <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
            <circle
              cx="42"
              cy="42"
              r={r}
              fill="none"
              strokeWidth="8"
              className="stroke-secondary"
            />
            <circle
              cx="42"
              cy="42"
              r={r}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              stroke="url(#arcScoreGrad)"
              strokeDasharray={`${dash} ${c}`}
            />
            <defs>
              <linearGradient id="arcScoreGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold leading-none">{score}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Arc Score
            {badge && (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${RISK_BADGE_CLASS[riskTier as RiskTier]}`}
              >
                {badge.label}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-lg font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">
            Your savings reputation across consistency, goals and circles.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl bg-secondary/60 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        How it&apos;s calculated
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const pct = Math.round(Math.min(1, Math.max(0, row.value)) * 100);
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
