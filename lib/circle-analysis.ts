/**
 * Group-savings analytics for an Ajo circle.
 *
 * The numeric health score and risk classification are computed deterministically
 * (so they are reproducible and trustworthy). An optional AI layer (see
 * app/api/circles/analyze) enriches the narrative summary, recommendations and
 * outlook on top of these numbers — never the other way around.
 */

export type AnalysisMember = {
  /** Display id — a name or shortened address. */
  id: string;
  /** Expected contribution per round, in the circle currency. */
  contribution: number;
  /** Rounds the member has actually paid. */
  paidCount: number;
  /** Rounds elapsed so far. */
  totalRounds: number;
};

export type RiskLevel = "low" | "medium" | "high";

export type RiskMember = {
  id: string;
  level: RiskLevel;
  /** 0–1 payment reliability. */
  reliability: number;
  missed: number;
  reason: string;
};

export type CircleAnalysis = {
  /** 0–100 overall group health. */
  healthScore: number;
  healthLabel: string;
  summary: string;
  metrics: {
    collectionRate: number;
    avgReliability: number;
    consistency: number;
    totalCollected: number;
    totalExpected: number;
    memberCount: number;
    roundsElapsed: number;
  };
  riskMembers: RiskMember[];
  recommendations: string[];
  prediction: {
    stability: "stable" | "moderate" | "at-risk";
    /** 0–1 confidence given how much history we have. */
    confidence: number;
    /** 0–1 projected collection rate for the next rounds. */
    projectedCollectionRate: number;
    /** Projected USDC inflow over the next 4 weeks at the projected rate. */
    projectedInflow: number;
    outlook: string;
  };
  source: "heuristic" | "ai";
  currency: string;
};

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function healthLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 40) return "At risk";
  return "Critical";
}

function riskLevel(reliability: number): RiskLevel {
  if (reliability >= 0.85) return "low";
  if (reliability >= 0.6) return "medium";
  return "high";
}

/**
 * Deterministic baseline analysis. Always works, no network or keys required.
 */
export function analyzeCircleHeuristic(
  members: AnalysisMember[],
  currency = "USDC"
): CircleAnalysis {
  const valid = members.filter((m) => m.totalRounds > 0);
  const roundsElapsed = valid.reduce((m, x) => Math.max(m, x.totalRounds), 0);

  const reliabilities = valid.map((m) => clamp(m.paidCount / m.totalRounds));
  const avgReliability =
    reliabilities.length > 0
      ? reliabilities.reduce((s, v) => s + v, 0) / reliabilities.length
      : 0;

  const totalCollected = valid.reduce(
    (s, m) => s + m.paidCount * m.contribution,
    0
  );
  const totalExpected = valid.reduce(
    (s, m) => s + m.totalRounds * m.contribution,
    0
  );
  const collectionRate = totalExpected > 0 ? totalCollected / totalExpected : 0;
  const consistency = clamp(1 - stdev(reliabilities));

  const healthScore = Math.round(
    100 * (0.6 * collectionRate + 0.25 * avgReliability + 0.15 * consistency)
  );

  // Risk members: anyone below "reliable" (medium/high), worst first.
  const riskMembers: RiskMember[] = valid
    .map((m) => {
      const reliability = clamp(m.paidCount / m.totalRounds);
      const level = riskLevel(reliability);
      const missed = Math.max(0, m.totalRounds - m.paidCount);
      return {
        id: m.id,
        level,
        reliability: round2(reliability),
        missed,
        reason:
          level === "high"
            ? `Missed ${missed} of ${m.totalRounds} contributions (${Math.round(
                reliability * 100
              )}% reliability) — a serious threat to the pot.`
            : level === "medium"
            ? `Missed ${missed} of ${m.totalRounds} contributions (${Math.round(
                reliability * 100
              )}% reliability) — worth watching.`
            : `On track: paid ${m.paidCount} of ${m.totalRounds}.`,
      };
    })
    .filter((m) => m.level !== "low")
    .sort((a, b) => a.reliability - b.reliability);

  // Prediction.
  const minReliability =
    reliabilities.length > 0 ? Math.min(...reliabilities) : 0;
  const projectedCollectionRate = round2(
    clamp(0.65 * collectionRate + 0.35 * avgReliability)
  );
  const perRoundExpected = valid.reduce((s, m) => s + m.contribution, 0);
  const projectedInflow = round2(projectedCollectionRate * perRoundExpected * 4);
  const stability: CircleAnalysis["prediction"]["stability"] =
    healthScore >= 80 && minReliability >= 0.7
      ? "stable"
      : healthScore >= 60
      ? "moderate"
      : "at-risk";
  // More rounds of history -> more confidence, capped.
  const confidence = round2(clamp(0.45 + 0.06 * roundsElapsed, 0.45, 0.9));

  const highRisk = riskMembers.filter((m) => m.level === "high");
  const outlook =
    stability === "stable"
      ? `On current trends the circle should stay stable, collecting roughly ${Math.round(
          projectedCollectionRate * 100
        )}% of dues (~${projectedInflow} ${currency}) over the next 4 weeks.`
      : stability === "moderate"
      ? `Stability over the next 4 weeks hinges on ${
          highRisk.map((m) => m.id).join(", ") || "the weaker contributors"
        }. Expect ~${Math.round(
          projectedCollectionRate * 100
        )}% collection (~${projectedInflow} ${currency}) unless reliability improves.`
      : `The circle is fragile. Without intervention, expect only ~${Math.round(
          projectedCollectionRate * 100
        )}% collection (~${projectedInflow} ${currency}) over the next 4 weeks and possible shortfalls at payout.`;

  // Recommendations.
  const recommendations: string[] = [];
  for (const m of highRisk) {
    recommendations.push(
      `Follow up directly with ${m.id} (missed ${m.missed}/${roundsElapsed}). Confirm their Circle wallet is funded and set an automatic USDC reminder before each due date.`
    );
  }
  const mediumRisk = riskMembers.filter((m) => m.level === "medium");
  for (const m of mediumRisk) {
    recommendations.push(
      `Keep ${m.id} on a watchlist (${Math.round(
        m.reliability * 100
      )}% reliability) — a single reminder is usually enough to keep them on track.`
    );
  }
  if (highRisk.length > 0) {
    recommendations.push(
      `Hold a reserve buffer of about one round (~${perRoundExpected} ${currency}) so a single missed payment never delays a payout.`
    );
    recommendations.push(
      `Consider moving repeat late-payers to a later payout slot, so reliable members aren't exposed to their default risk.`
    );
  }
  const reliable = valid
    .filter((m) => clamp(m.paidCount / m.totalRounds) >= 0.85)
    .map((m) => m.id);
  if (reliable.length > 0) {
    recommendations.push(
      `Reward consistency: ${reliable.join(
        ", "
      )} ${reliable.length > 1 ? "have" : "has"} paid reliably — prioritise them for earlier payout slots.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "All members are contributing reliably — keep automated reminders on and maintain the current schedule."
    );
  }

  const summary = `${valid.length} members across ${roundsElapsed} round${
    roundsElapsed === 1 ? "" : "s"
  }: ${Math.round(collectionRate * 100)}% of dues collected (${round2(
    totalCollected
  )}/${round2(totalExpected)} ${currency}). Health is ${healthLabel(
    healthScore
  ).toLowerCase()} at ${healthScore}/100${
    highRisk.length
      ? `, dragged down by ${highRisk.map((m) => m.id).join(", ")}.`
      : "."
  }`;

  return {
    healthScore,
    healthLabel: healthLabel(healthScore),
    summary,
    metrics: {
      collectionRate: round2(collectionRate),
      avgReliability: round2(avgReliability),
      consistency: round2(consistency),
      totalCollected: round2(totalCollected),
      totalExpected: round2(totalExpected),
      memberCount: valid.length,
      roundsElapsed,
    },
    riskMembers,
    recommendations,
    prediction: {
      stability,
      confidence,
      projectedCollectionRate,
      projectedInflow,
      outlook,
    },
    source: "heuristic",
    currency,
  };
}
