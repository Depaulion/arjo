/**
 * Benefits aggregation — a single honest view of the real value a member gets
 * from Arjo, in four streams:
 *
 *   1. USYC yield      — Treasury-backed yield realised + currently accruing on
 *                        locked/target/auto plan principal (lib/yield-engine.ts).
 *   2. Circle savings  — what group saving has moved: contributed vs. paid out.
 *   3. Rewards         — gamification (XP / level / streak / badges).
 *   4. Bond protection — refundable stake held in the vault protecting circles.
 *
 * Pure: takes already-loaded rows and returns a snapshot. Deliberately
 * currency-agnostic — values are expressed in the member's preferred stablecoin,
 * with NO hardcoded fiat (e.g. NGN) rate, since members span many regions.
 */

import type { ArcStablecoin } from "@/lib/arc";
import type { LedgerEntry, SavingsPlan } from "@/lib/types";
import {
  accrueYield,
  effectiveApy,
  periodYield,
  USYC_BASE_APY,
} from "@/lib/yield-engine";

export type BenefitStreamKey = "yield" | "circles" | "rewards" | "protection";

export type BenefitStream = {
  key: BenefitStreamKey;
  label: string;
  /** Primary figure: a stablecoin amount, unless `unit` says otherwise. */
  value: number;
  unit: "currency" | "xp";
  caption: string;
  detail: string;
};

export type BenefitsSnapshot = {
  currency: ArcStablecoin;
  /**
   * Yield mode: "live" when the vault holds a real, allowlisted USYC position;
   * "simulated" when figures are illustrative (USYC not yet enabled). Drives
   * honest labelling in the UI. See lib/usyc.ts.
   */
  mode: "live" | "simulated";
  /** USYC base APY as a fraction (e.g. 0.08). */
  apy: number;
  /** Yield already realised (confirmed `bonus` ledger entries). */
  yieldEarned: number;
  /** Yield currently accruing on active plan principal, to date. */
  yieldAccruing: number;
  /** earned + accruing — the headline "money your money made". */
  yieldTotal: number;
  /** Yield accrued on active principal over the last 24h (sub-cent, unrounded). */
  yieldToday: number;
  /** Yield accrued on active principal over the last 7 days (sub-cent, unrounded). */
  yieldThisWeek: number;
  streams: BenefitStream[];
};

export type BenefitsInput = {
  currency: ArcStablecoin;
  /** All of the member's savings plans (any status). */
  plans: SavingsPlan[];
  /** Ledger rows — at minimum kind/amount/status (more rows = more accurate). */
  ledger: Pick<LedgerEntry, "kind" | "amount" | "status">[];
  activeCircles: number;
  xp: number;
  level: number;
  streakWeeks: number;
  badges: string[];
  now?: Date;
  /** True when live USYC is enabled (lib/usyc.ts isUsycEnabled()). */
  usycLive?: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum confirmed-or-pending (never failed) ledger amounts for the given kinds. */
function sumKinds(
  ledger: Pick<LedgerEntry, "kind" | "amount" | "status">[],
  kinds: LedgerEntry["kind"][]
): number {
  return round2(
    ledger
      .filter((e) => kinds.includes(e.kind) && e.status !== "failed")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  );
}

export function computeBenefits(input: BenefitsInput): BenefitsSnapshot {
  const now = input.now ?? new Date();
  const { currency } = input;

  // --- 1. USYC yield --------------------------------------------------------
  const yieldEarned = sumKinds(input.ledger, ["bonus"]);

  const activePlans = input.plans.filter((p) => p.status === "active");
  const principalAtWork = round2(
    activePlans.reduce((s, p) => s + (Number(p.principal) || 0), 0)
  );
  const yieldAccruing = round2(
    activePlans.reduce(
      (s, p) =>
        s +
        accrueYield({
          principal: p.principal,
          from: p.created_at,
          to: now,
          apy: effectiveApy(p.apy_bonus),
        }),
      0
    )
  );
  const yieldTotal = round2(yieldEarned + yieldAccruing);

  // Per-period gain on active principal — the "your money made $X today/this
  // week" detail. Kept unrounded (sub-cent figures matter for small balances);
  // the UI formats with adaptive precision.
  const yieldToday = activePlans.reduce(
    (s, p) =>
      s +
      periodYield({
        principal: p.principal,
        from: p.created_at,
        to: now,
        windowDays: 1,
        apy: effectiveApy(p.apy_bonus),
      }),
    0
  );
  const yieldThisWeek = activePlans.reduce(
    (s, p) =>
      s +
      periodYield({
        principal: p.principal,
        from: p.created_at,
        to: now,
        windowDays: 7,
        apy: effectiveApy(p.apy_bonus),
      }),
    0
  );

  // --- 2. Circle savings ----------------------------------------------------
  const contributed = sumKinds(input.ledger, ["contribution", "autosave"]);
  const paidOut = sumKinds(input.ledger, ["payout"]);

  // --- 3. Rewards -----------------------------------------------------------
  const badgeCount = input.badges.length;

  // --- 4. Bond protection ---------------------------------------------------
  // Net stake still held = bonds posted − refunded − slashed.
  const bondsPosted = sumKinds(input.ledger, ["bond"]);
  const bondsReleased = sumKinds(input.ledger, ["bond_refund", "bond_slash"]);
  const bondsHeld = round2(Math.max(0, bondsPosted - bondsReleased));

  const live = input.usycLive ?? false;
  const apyPct = Math.round(USYC_BASE_APY * 100);

  const streams: BenefitStream[] = [
    {
      key: "yield",
      label: "USYC yield",
      value: yieldTotal,
      unit: "currency",
      caption: live
        ? `Earning ~${apyPct}% APY, Treasury-backed`
        : `Projected ~${apyPct}% APY, Treasury-backed (simulated)`,
      detail:
        principalAtWork > 0
          ? `${yieldAccruing} ${currency} accruing on ${principalAtWork} ${currency} at work · ${yieldEarned} ${currency} already paid out`
          : "Lock funds in a SafeLock vault to start earning USYC yield",
    },
    {
      key: "circles",
      label: "Circle savings",
      value: contributed,
      unit: "currency",
      caption:
        input.activeCircles > 0
          ? `${input.activeCircles} active circle${input.activeCircles === 1 ? "" : "s"}`
          : "Join a circle for group accountability",
      detail:
        paidOut > 0
          ? `${contributed} ${currency} contributed · ${paidOut} ${currency} received in payouts`
          : `${contributed} ${currency} contributed so far`,
    },
    {
      key: "rewards",
      label: "Rewards",
      value: input.xp,
      unit: "xp",
      caption: `Level ${input.level} · ${input.streakWeeks}-week streak`,
      detail:
        badgeCount > 0
          ? `${input.xp} XP earned · ${badgeCount} badge${badgeCount === 1 ? "" : "s"} unlocked`
          : `${input.xp} XP earned · save consistently to unlock badges`,
    },
    {
      key: "protection",
      label: "Bond protection",
      value: bondsHeld,
      unit: "currency",
      caption:
        bondsHeld > 0 ? "Refundable stake securing your circles" : "No bonds held",
      detail:
        bondsHeld > 0
          ? `${bondsHeld} ${currency} held in the vault, refunded when you finish in good standing`
          : "Bonds are returned in full when a circle completes",
    },
  ];

  return {
    currency,
    mode: input.usycLive ? "live" : "simulated",
    apy: USYC_BASE_APY,
    yieldEarned,
    yieldAccruing,
    yieldTotal,
    yieldToday,
    yieldThisWeek,
    streams,
  };
}
