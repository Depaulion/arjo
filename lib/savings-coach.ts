/**
 * Personal savings analytics — the "AI Savings Coach".
 *
 * Like the circle analyzer, the score and projections are computed
 * deterministically (reproducible, always available with no API key). An
 * optional Claude layer can later rewrite the narrative on top of these
 * numbers, but it never sets them.
 */

export type SavingsCoachInput = {
  /** Current on-chain USDC balance (whole USDC), or null if unreadable. */
  balance: number | null;
  /** Total USDC the member has contributed into pots (sum of outgoing). */
  totalContributed: number;
  /** Number of contribution transactions seen on-chain. */
  contributionCount: number;
  /** Consecutive weeks (up to now) with at least one contribution. */
  streakWeeks: number;
  /** Average USDC contributed per active week. */
  avgWeeklyContribution: number;
  /** Circles the member actively participates in. */
  activeCircles: number;
  /** Number of savings goals the member is tracking. */
  goalCount: number;
};

export type SavingsCoachAnalysis = {
  /** 0–100 savings health. */
  healthScore: number;
  healthLabel: string;
  /** Projected USDC saved over the next 7 days. */
  weeklyProjection: number;
  /** Projected USDC saved over the next 4 weeks. */
  monthlyProjection: number;
  summary: string;
  recommendations: string[];
  /** Sub-scores (0–1) powering the headline number, for the radial breakdown. */
  factors: {
    consistency: number;
    activity: number;
    engagement: number;
    funded: number;
  };
  source: "heuristic" | "ai";
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

function healthLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Building";
  if (score >= 35) return "Getting started";
  return "Just begun";
}

export function analyzeSavings(input: SavingsCoachInput): SavingsCoachAnalysis {
  const balance = input.balance ?? 0;

  // Sub-scores, each 0–1.
  const consistency = clamp(input.streakWeeks / 8); // 8-week streak == full marks
  const activity = clamp(input.contributionCount / 12);
  const engagement = clamp(input.activeCircles / 3);
  const funded = clamp(balance > 0 ? 0.5 + clamp(balance / 500) * 0.5 : 0);

  const healthScore = Math.round(
    100 *
      (0.35 * consistency +
        0.25 * activity +
        0.2 * engagement +
        0.2 * funded)
  );

  const weeklyProjection = round2(
    input.avgWeeklyContribution > 0
      ? input.avgWeeklyContribution
      : input.activeCircles > 0
      ? Math.max(0, input.totalContributed) /
        Math.max(1, input.contributionCount)
      : 0
  );
  const monthlyProjection = round2(weeklyProjection * 4);

  const recommendations: string[] = [];
  if (input.activeCircles === 0) {
    recommendations.push(
      "Join a savings circle from the community marketplace — saving alongside others is the single biggest driver of consistency."
    );
  }
  if (input.streakWeeks === 0) {
    recommendations.push(
      "Make your first contribution this week to start a streak. Even a small, regular amount compounds your reputation."
    );
  } else if (input.streakWeeks < 4) {
    recommendations.push(
      `You're on a ${input.streakWeeks}-week streak — contribute again before the week ends to keep it alive and lift your reputation score.`
    );
  } else {
    recommendations.push(
      `Strong ${input.streakWeeks}-week streak. Consider increasing your weekly amount by 10% to reach your goals faster.`
    );
  }
  if (input.goalCount === 0) {
    recommendations.push(
      "Set a savings goal so the coach can project your completion date and keep you accountable."
    );
  }
  if (balance <= 0) {
    recommendations.push(
      "Claim test USDC from the Arc faucet to fund your wallet, then start contributing on Arc Testnet."
    );
  }
  if (recommendations.length < 3) {
    recommendations.push(
      "Automate a recurring contribution so you never miss a round — reliability is what earns earlier payout slots."
    );
  }

  const summary =
    healthScore >= 70
      ? `Your savings habit is ${healthLabel(
          healthScore
        ).toLowerCase()}. With a ${input.streakWeeks}-week streak across ${input.activeCircles} circle${
          input.activeCircles === 1 ? "" : "s"
        }, you're projected to save about ${monthlyProjection} USDC over the next month.`
      : `Your savings journey is ${healthLabel(
          healthScore
        ).toLowerCase()}. A few consistent contributions will quickly lift your score — you're projected to save about ${monthlyProjection} USDC next month at your current pace.`;

  return {
    healthScore,
    healthLabel: healthLabel(healthScore),
    weeklyProjection,
    monthlyProjection,
    summary,
    recommendations: recommendations.slice(0, 4),
    factors: {
      consistency: round2(consistency),
      activity: round2(activity),
      engagement: round2(engagement),
      funded: round2(funded),
    },
    source: "heuristic",
  };
}
