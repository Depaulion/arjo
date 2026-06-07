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
