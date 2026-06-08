/**
 * Goal funding — the single source of truth for "how much real money is set
 * aside for a goal".
 *
 * A goal's progress is NOT the user's liquid wallet balance (that made every
 * goal look instantly "reached"). It is the principal committed across the
 * goal's active linked savings plans, plus the USYC yield each has accrued so
 * far — money that is genuinely locked in a vault and growing. Used by both the
 * Goals tab and the Home "current goal" card so figures line up everywhere.
 *
 * Pure module: no I/O, safe on client or server.
 */
import type { SavingsPlan } from "@/lib/types";
import { accrueYield, effectiveApy, periodYield } from "@/lib/yield-engine";

export type GoalFunding = {
  /** Principal + accrued yield across active linked plans. */
  funded: number;
  /** Principal only (sum of linked plan principals). */
  principal: number;
  /** USYC yield accrued so far across linked plans. */
  earned: number;
  /** Yield this goal's vaults made over the last 24h (sub-cent, unrounded). */
  earnedToday: number;
  /** Yield this goal's vaults made over the last 7 days (sub-cent, unrounded). */
  earnedThisWeek: number;
  /** Number of active plans linked to the goal. */
  count: number;
};

export function goalFunding(goalId: string, plans: SavingsPlan[]): GoalFunding {
  const linked = plans.filter(
    (p) => p.goal_id === goalId && p.status === "active"
  );
  let principal = 0;
  let earned = 0;
  let earnedToday = 0;
  let earnedThisWeek = 0;
  for (const p of linked) {
    principal += p.principal;
    if (p.apy_bonus > 0 && p.principal > 0) {
      const apy = effectiveApy(p.apy_bonus);
      earned += accrueYield({ principal: p.principal, from: p.created_at, apy });
      earnedToday += periodYield({
        principal: p.principal,
        from: p.created_at,
        windowDays: 1,
        apy,
      });
      earnedThisWeek += periodYield({
        principal: p.principal,
        from: p.created_at,
        windowDays: 7,
        apy,
      });
    }
  }
  return {
    funded: principal + earned,
    principal,
    earned,
    earnedToday,
    earnedThisWeek,
    count: linked.length,
  };
}
