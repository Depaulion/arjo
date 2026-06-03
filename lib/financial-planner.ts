/**
 * Deterministic AI financial planner.
 *
 * Takes a member's income, monthly commitments, a savings goal, time horizon
 * and risk appetite, and produces a concrete plan: how much to save each month,
 * how to split it across a flexible buffer, a locked SafeLock vault, and circle
 * contributions, plus a realistic timeline to the goal. The numbers are fully
 * deterministic; the optional Claude layer (via /api/planner) only rewrites the
 * narrative around these figures — it never changes them.
 */

export type RiskAppetite = "cautious" | "balanced" | "ambitious";

export type PlannerInput = {
  /** Monthly income in the chosen stablecoin. */
  monthlyIncome: number;
  /** Existing fixed monthly expenses/commitments. */
  monthlyExpenses: number;
  /** Target amount to reach. */
  goalAmount: number;
  /** Months the member wants to reach the goal in (optional). */
  horizonMonths?: number;
  /** How aggressively to save. */
  risk: RiskAppetite;
  /** Amount already saved toward the goal. */
  currentSavings?: number;
  currency?: string;
};

export type PlanSplitItem = {
  bucket: "flex" | "locked" | "circle";
  label: string;
  monthly: number;
  /** Share of the monthly savings (0–1). */
  share: number;
  rationale: string;
};

export type FinancialPlan = {
  /** Recommended total to save each month. */
  recommendedMonthly: number;
  /** Savings rate as a fraction of income. */
  savingsRate: number;
  /** Disposable income after expenses. */
  disposable: number;
  /** Months projected to reach the goal at the recommended pace. */
  monthsToGoal: number;
  /** True if the user's chosen horizon is achievable. */
  horizonAchievable: boolean;
  /** If the horizon is too tight, the monthly needed to actually hit it. */
  monthlyForHorizon: number | null;
  split: PlanSplitItem[];
  /** Projected SafeLock yield bonus earned over the timeline (whole units). */
  projectedBonus: number;
  summary: string;
  recommendations: string[];
  currency: string;
  source: "heuristic" | "ai";
};

/** Target savings rate (of disposable income) by risk appetite. */
const RISK_RATE: Record<RiskAppetite, number> = {
  cautious: 0.25,
  balanced: 0.4,
  ambitious: 0.6,
};

/** How the monthly savings is split across buckets, by risk appetite. */
const RISK_SPLIT: Record<RiskAppetite, { flex: number; locked: number; circle: number }> = {
  cautious: { flex: 0.5, locked: 0.3, circle: 0.2 },
  balanced: { flex: 0.35, locked: 0.4, circle: 0.25 },
  ambitious: { flex: 0.2, locked: 0.5, circle: 0.3 },
};

/** Annualised SafeLock bonus we advertise for locked funds. */
export const SAFELOCK_APY = 0.08;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildFinancialPlan(input: PlannerInput): FinancialPlan {
  const currency = input.currency ?? "USDC";
  const income = Math.max(0, input.monthlyIncome);
  const expenses = Math.max(0, input.monthlyExpenses);
  const disposable = Math.max(0, income - expenses);
  const already = Math.max(0, input.currentSavings ?? 0);
  const remaining = Math.max(0, input.goalAmount - already);

  const rate = RISK_RATE[input.risk];
  const recommendedMonthly = round2(disposable * rate);
  const savingsRate = income > 0 ? recommendedMonthly / income : 0;

  const monthsToGoal =
    recommendedMonthly > 0
      ? Math.ceil(remaining / recommendedMonthly)
      : Infinity;

  const horizon = input.horizonMonths && input.horizonMonths > 0
    ? input.horizonMonths
    : null;
  const monthlyForHorizon =
    horizon && remaining > 0 ? round2(remaining / horizon) : null;
  const horizonAchievable =
    horizon === null
      ? true
      : monthlyForHorizon !== null && monthlyForHorizon <= disposable;

  // Build the split off the *actual* monthly we'll recommend. If the user has a
  // horizon they can afford, honour it; otherwise use the risk-based amount.
  const planMonthly =
    horizon && horizonAchievable && monthlyForHorizon
      ? monthlyForHorizon
      : recommendedMonthly;

  const shares = RISK_SPLIT[input.risk];
  const split: PlanSplitItem[] = [
    {
      bucket: "flex",
      label: "Flexible buffer",
      monthly: round2(planMonthly * shares.flex),
      share: shares.flex,
      rationale:
        "Instant-access savings for emergencies — withdraw any time, no penalty.",
    },
    {
      bucket: "locked",
      label: "SafeLock vault",
      monthly: round2(planMonthly * shares.locked),
      share: shares.locked,
      rationale: `Locked until your goal date for a ${Math.round(
        SAFELOCK_APY * 100
      )}% APY bonus and zero temptation to spend.`,
    },
    {
      bucket: "circle",
      label: "Ajo circle",
      monthly: round2(planMonthly * shares.circle),
      share: shares.circle,
      rationale:
        "Group accountability — a rotating payout keeps your contributions consistent.",
    },
  ];

  // Projected bonus: locked monthly compounding-ish, approximated simply over
  // the timeline at the SafeLock APY (deterministic, illustrative).
  const lockedMonthly = split.find((s) => s.bucket === "locked")?.monthly ?? 0;
  const timeline = Number.isFinite(monthsToGoal)
    ? (horizon && horizonAchievable ? horizon : monthsToGoal)
    : 12;
  const avgLockedBalance = (lockedMonthly * timeline) / 2;
  const projectedBonus = round2(avgLockedBalance * SAFELOCK_APY * (timeline / 12));

  const summary = buildSummary({
    disposable,
    planMonthly,
    remaining,
    timeline: Number.isFinite(monthsToGoal) ? monthsToGoal : null,
    horizon,
    horizonAchievable,
    monthlyForHorizon,
    currency,
  });

  const recommendations = buildRecommendations({
    income,
    disposable,
    planMonthly,
    horizon,
    horizonAchievable,
    monthlyForHorizon,
    lockedMonthly,
    currency,
  });

  return {
    recommendedMonthly: planMonthly,
    savingsRate,
    disposable,
    monthsToGoal: Number.isFinite(monthsToGoal) ? monthsToGoal : 0,
    horizonAchievable,
    monthlyForHorizon,
    split,
    projectedBonus,
    summary,
    recommendations,
    currency,
    source: "heuristic",
  };
}

function buildSummary(a: {
  disposable: number;
  planMonthly: number;
  remaining: number;
  timeline: number | null;
  horizon: number | null;
  horizonAchievable: boolean;
  monthlyForHorizon: number | null;
  currency: string;
}): string {
  if (a.disposable <= 0) {
    return "Your expenses currently match or exceed your income, so there's nothing left to save. Trim a recurring cost first, then start with even a small flexible deposit to build momentum.";
  }
  if (a.remaining <= 0) {
    return "You've already reached this goal — consider locking the surplus in a SafeLock vault to earn a yield bonus, or set a more ambitious target.";
  }
  if (a.horizon && !a.horizonAchievable) {
    return `Your ${a.horizon}-month deadline needs ${a.monthlyForHorizon?.toLocaleString()} ${a.currency}/mo, which is more than your disposable income. Either extend the deadline or free up cash — at a comfortable pace you'd get there in about ${a.timeline} months.`;
  }
  return `Saving ${a.planMonthly.toLocaleString()} ${a.currency} a month puts your goal within reach in about ${a.timeline} month${a.timeline === 1 ? "" : "s"}. The split below balances access, discipline, and group accountability.`;
}

function buildRecommendations(a: {
  income: number;
  disposable: number;
  planMonthly: number;
  horizon: number | null;
  horizonAchievable: boolean;
  monthlyForHorizon: number | null;
  lockedMonthly: number;
  currency: string;
}): string[] {
  const recs: string[] = [];
  if (a.disposable <= 0) {
    recs.push("Review fixed expenses — aim to free up at least 10% of income to save.");
    return recs;
  }
  recs.push(
    `Automate a ${a.planMonthly.toLocaleString()} ${a.currency} monthly auto-save so it happens before you can spend it.`
  );
  if (a.lockedMonthly > 0) {
    recs.push(
      `Route ${a.lockedMonthly.toLocaleString()} ${a.currency} into a SafeLock vault to earn the yield bonus and avoid impulse withdrawals.`
    );
  }
  if (a.horizon && !a.horizonAchievable && a.monthlyForHorizon) {
    recs.push(
      `To truly hit your deadline you'd need ${a.monthlyForHorizon.toLocaleString()} ${a.currency}/mo — consider a side income or a longer horizon.`
    );
  }
  recs.push(
    "Join an Ajo circle for the accountability of a group — consistent contributors get earlier payout slots."
  );
  return recs;
}
