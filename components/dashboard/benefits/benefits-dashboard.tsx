"use client";

import Link from "next/link";
import {
  Landmark,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { BenefitsSnapshot, BenefitStreamKey } from "@/lib/benefits";
import { YIELD_SOURCE } from "@/lib/yield-engine";
import type { ArcStablecoin } from "@/lib/arc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STREAM_ICON: Record<BenefitStreamKey, LucideIcon> = {
  yield: TrendingUp,
  circles: Users,
  rewards: Trophy,
  protection: ShieldCheck,
};

const STREAM_TINT: Record<BenefitStreamKey, string> = {
  yield: "bg-emerald-500/15 text-emerald-500",
  circles: "bg-primary/15 text-primary",
  rewards: "bg-amber-500/15 text-amber-500",
  protection: "bg-sky-500/15 text-sky-500",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Benefits Dashboard — one screen that adds up the real value a member gets from
 * Arjo: USYC yield, circle savings, rewards, and bond protection. The yield is
 * Treasury-backed (see lib/yield-engine.ts); figures are illustrative on
 * testnet, which the footnote makes explicit.
 */
export function BenefitsDashboard({
  benefits,
  currency,
}: {
  benefits: BenefitsSnapshot;
  currency: ArcStablecoin;
}) {
  const apyPct = Math.round(benefits.apy * 100);
  const live = benefits.mode === "live";

  return (
    <div className="space-y-5">
      {/* Headline: total yield earned + accruing */}
      <Card className="border-emerald-500/30 bg-gradient-to-br from-card to-emerald-500/5">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-lg">Your benefits</CardTitle>
                <CardDescription>
                  The value your savings generate, in one place.
                </CardDescription>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                live
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-500"
              }`}
              title={
                live
                  ? "Yield is backed by a live, allowlisted USYC position."
                  : "USYC not yet enabled — figures are simulated at the published USYC rate."
              }
            >
              {live ? "Live USYC" : "Simulated"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-xs text-muted-foreground">USYC yield (earned + accruing)</p>
          <p className="text-3xl font-bold tracking-tight">
            {fmt(benefits.yieldTotal)}{" "}
            <span className="text-base font-medium text-muted-foreground">
              {currency}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Landmark className="h-3.5 w-3.5 text-emerald-500" />
              {fmt(benefits.yieldEarned)} {currency} paid out
            </span>
            <span>·</span>
            <span>{fmt(benefits.yieldAccruing)} {currency} accruing</span>
            <span>·</span>
            <span>~{apyPct}% APY</span>
          </p>
        </CardContent>
      </Card>

      {/* Four benefit streams */}
      <div className="grid gap-4 sm:grid-cols-2">
        {benefits.streams.map((s) => {
          const Icon = STREAM_ICON[s.key];
          return (
            <Card key={s.key}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${STREAM_TINT[s.key]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {s.caption}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {s.unit === "xp" ? (
                      <>
                        {fmt(s.value)}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          XP
                        </span>
                      </>
                    ) : (
                      <>
                        {fmt(s.value)}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          {currency}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Where the yield comes from */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where the yield comes from</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Locked principal is allocated to{" "}
            <span className="font-medium text-foreground">
              {YIELD_SOURCE.name} ({YIELD_SOURCE.token})
            </span>
            , backed by {YIELD_SOURCE.backing}. Its redemption value rises a
            little each day, and that accrual is the yield you see here — not
            platform subsidy or token emissions.
          </p>
          <p className="text-xs">
            {live ? (
              <>
                Yield is funded by the vault&apos;s live USYC position on Arc.
                Rates track the market and aren&apos;t guaranteed.
              </>
            ) : (
              <>
                USYC has live contracts on Arc but is permissioned — until the
                vault is allowlisted, these figures are{" "}
                <span className="font-medium text-foreground">simulated</span> at
                the published USYC rate, not disbursed from a real position.
              </>
            )}{" "}
            <Link href="/docs#yield" className="text-primary hover:underline">
              Read more in the docs
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
