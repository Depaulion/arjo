/**
 * Bond yield — the attribution model for yield-bearing member bonds.
 *
 * A circle bond is a non-withdrawable stake every member posts on join, held in
 * the platform vault until the circle completes. While held, that principal is
 * treated exactly like a SafeLock deposit: it earns USYC-backed APY (Treasury
 * yield), accrued daily-compounded on-read from a single timestamp
 * (`circle_members.bond_started_at`). There is no balance to reconcile and no
 * cron — the figure is recomputed from principal + elapsed time whenever it is
 * displayed or settled.
 *
 * Settlement (see app/api/circles/[id]/defaulters/route.ts):
 *   - Good-standing return → member receives principal + accrued yield.
 *   - Slash on default      → the whole position (principal + yield) is forfeited.
 *
 * Pure module (no I/O, no `server-only`): safe to import on client or server.
 * Live-vs-simulated mode lives in lib/usyc.ts; the math here is identical in
 * both modes — going live is a config change, not a rewrite.
 */

import { USYC_BASE_APY, accrueYield } from "@/lib/yield-engine";

/**
 * Annualised yield a held bond earns, as a fraction (0.08 = 8%). Bonds track the
 * same USYC base rate as the default SafeLock vault — a bond is just locked
 * principal, so it earns what locked principal earns.
 */
export const BOND_APY = USYC_BASE_APY;

/**
 * Safety buffer above one round's contribution that the recommended bond adds.
 *
 * THE COVERAGE MODEL
 * ------------------
 * A defaulting member costs the group, at minimum, one missed contribution C.
 * The slash recovers the member's whole bond position (principal + accrued
 * yield), so the group is made whole when:
 *
 *   bond × (1 + APY/365)^days  ≥  C × (1 + buffer)
 *
 * Setting bond = 1.1 × C makes that hold from DAY ZERO — a slash covers the
 * missed round in full plus a 10% penalty that compensates the group for the
 * disruption. Because the held bond compounds daily at the USYC rate, coverage
 * only grows from there: defaults that happen late in a circle (the riskiest,
 * since early payout receivers have the most incentive to walk away) are met
 * by a strictly larger position. Risk surcharges (2×/3× for low-reputation
 * joiners) stack on top of this base.
 */
export const BOND_COVERAGE_BUFFER = 0.1;

/**
 * Recommended bond for a circle whose per-round contribution is `contribution`:
 * 110% of one round, rounded to 2dp. This is the creator-facing default and the
 * enforced minimum when bonds are enabled.
 */
export function recommendedBond(contribution: number): number {
  if (!Number.isFinite(contribution) || contribution <= 0) return 0;
  return Math.round(contribution * (1 + BOND_COVERAGE_BUFFER) * 100) / 100;
}

export type BondCoverage = {
  /** Current slashable position: principal + accrued yield. */
  position: number;
  /** position ÷ one round's contribution, as a percent (110 = covers 1.1×). */
  coveragePct: number;
  /** What remains after making the group whole for one missed round. */
  surplus: number;
  /** True when a slash today fully covers a missed contribution. */
  coversMissedRound: boolean;
};

/**
 * Live coverage of a held bond against one round's contribution — how much of
 * a missed round a slash today would recover, including the yield earned since
 * the bond was posted.
 */
export function bondCoverage(
  amount: number,
  startedAt: string | null | undefined,
  contribution: number,
  to: Date | string = new Date()
): BondCoverage {
  const { total } = bondPosition(amount, startedAt, to);
  const c = Math.max(0, contribution);
  const coveragePct = c > 0 ? Math.round((total / c) * 100) : 0;
  return {
    position: total,
    coveragePct,
    surplus: Math.round((total - c) * 100) / 100,
    coversMissedRound: c > 0 && total >= c,
  };
}

/**
 * Yield accrued on a held bond of `amount`, posted at `startedAt`, up to `to`
 * (defaults to now). Returns the gain only (excludes principal), rounded to 2dp.
 * Returns 0 for a zero/negative bond or a missing start timestamp (legacy rows
 * before migration 0018 / non-held bonds).
 */
export function bondYield(
  amount: number,
  startedAt: string | null | undefined,
  to: Date | string = new Date()
): number {
  if (!startedAt || amount <= 0) return 0;
  return accrueYield({ principal: amount, from: startedAt, to, apy: BOND_APY });
}

export type BondPosition = {
  /** Bond principal posted on join. */
  principal: number;
  /** USYC yield accrued since `bond_started_at`. */
  earned: number;
  /** principal + earned — what the member receives on a good-standing return. */
  total: number;
};

/**
 * Full current value of a held bond: principal, accrued yield, and their sum.
 * `earned` is 0 when the bond is not earning (no start timestamp / zero amount).
 */
export function bondPosition(
  amount: number,
  startedAt: string | null | undefined,
  to: Date | string = new Date()
): BondPosition {
  const principal = Math.max(0, amount);
  const earned = bondYield(principal, startedAt, to);
  return { principal, earned, total: Math.round((principal + earned) * 100) / 100 };
}
