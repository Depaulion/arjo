"use client";

import { useState } from "react";
import { ArrowUpRight, DollarSign, Eye, EyeOff, Lock } from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Hero balance card — the single most important element on Home. Answers
 * "how much do I have?" at a glance: total savings up top, with the available
 * and locked split below. Tap the eye to privacy-hide the figures.
 */
export function BalanceCard({
  total,
  available,
  locked,
  monthDelta,
  currency,
}: {
  total: number;
  available: number;
  locked: number;
  /** Net inflow this calendar month, for the "+X this month" pill. */
  monthDelta: number;
  currency: string;
}) {
  const [hidden, setHidden] = useState(false);
  const mask = "••••";

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-accent to-primary p-6 text-white shadow-xl shadow-primary/20">
      {/* Decorative watermark */}
      <DollarSign className="pointer-events-none absolute -right-4 top-1/2 h-40 w-40 -translate-y-1/2 text-white/10" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute right-6 top-8 h-28 w-28 rounded-full border border-white/10" />

      <div className="relative">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            Total Savings
            {hidden ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <a
            href="#analytics"
            className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur transition-colors hover:bg-white/25"
          >
            Portfolio
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <p className="mt-3 text-4xl font-bold tracking-tight">
          {hidden ? mask : fmt(total)}
          <span className="ml-2 text-lg font-semibold text-white/80">
            {currency}
          </span>
        </p>

        {monthDelta > 0 && (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
            <ArrowUpRight className="h-3.5 w-3.5" />
            +{hidden ? mask : fmt(monthDelta)} {currency} this month
          </span>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
          <div>
            <p className="text-xs text-white/70">Available</p>
            <p className="mt-0.5 text-lg font-semibold">
              {hidden ? mask : fmt(available)}{" "}
              <span className="text-sm font-medium text-white/70">
                {currency}
              </span>
            </p>
          </div>
          <div className="border-l border-white/15 pl-4">
            <p className="flex items-center gap-1 text-xs text-white/70">
              <Lock className="h-3 w-3" />
              Locked in Vaults
            </p>
            <p className="mt-0.5 text-lg font-semibold">
              {hidden ? mask : fmt(locked)}{" "}
              <span className="text-sm font-medium text-white/70">
                {currency}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
