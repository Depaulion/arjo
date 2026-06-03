/**
 * Server-side aggregator for the member dashboard.
 *
 * Does ONE on-chain scan of the member's wallet and derives everything the
 * dashboard needs from it: balance, contribution streak, weekly cadence,
 * reputation score and the savings-coach analysis. Keeping it to a single scan
 * keeps the dashboard fast even though it powers several sections.
 */
import "server-only";

import { getUsdcBalance, getUsdcTransfers, type UsdcTransfer } from "@/lib/arc-onchain";
import { analyzeSavings, type SavingsCoachAnalysis } from "@/lib/savings-coach";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type DashboardSnapshot = {
  walletAddress: string | null;
  walletBalance: number | null;
  rpcOk: boolean;
  /** Total USDC contributed into pots (outgoing transfers). */
  totalContributed: number;
  /** Total USDC received as payouts (incoming transfers). */
  totalReceived: number;
  contributionCount: number;
  streakWeeks: number;
  avgWeeklyContribution: number;
  lastContributionAt: string | null;
  reputationScore: number;
  reputationLabel: string;
  coach: SavingsCoachAnalysis;
  recentTransfers: UsdcTransfer[];
};

function reputationLabel(score: number): string {
  if (score >= 85) return "Trusted saver";
  if (score >= 70) return "Reliable";
  if (score >= 50) return "Established";
  if (score >= 30) return "Rising";
  return "Newcomer";
}

/** Consecutive weeks (counting back from the current week) with ≥1 contribution. */
function contributionStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const now = Date.now();
  const weekIndex = (t: number) => Math.floor((now - t) / MS_PER_WEEK);
  const weeks = new Set(timestamps.map(weekIndex));
  let streak = 0;
  while (weeks.has(streak)) streak += 1;
  return streak;
}

export async function getDashboardSnapshot(input: {
  walletAddress: string | null;
  activeCircles: number;
  goalCount: number;
}): Promise<DashboardSnapshot> {
  const { walletAddress, activeCircles, goalCount } = input;

  let walletBalance: number | null = null;
  let rpcOk = false;
  let transfers: UsdcTransfer[] = [];

  if (walletAddress) {
    try {
      const [balance, scan] = await Promise.all([
        getUsdcBalance(walletAddress),
        getUsdcTransfers(walletAddress, { maxTransfers: 60 }),
      ]);
      walletBalance = balance;
      transfers = scan.transfers;
      rpcOk = true;
    } catch {
      rpcOk = false;
    }
  }

  const outgoing = transfers.filter((t) => t.direction === "out");
  const incoming = transfers.filter((t) => t.direction === "in");

  const totalContributed = round2(outgoing.reduce((s, t) => s + t.amount, 0));
  const totalReceived = round2(incoming.reduce((s, t) => s + t.amount, 0));
  const contributionCount = outgoing.length;

  const outTimestamps = outgoing
    .map((t) => (t.timestamp ? new Date(t.timestamp).getTime() : null))
    .filter((n): n is number => n !== null);

  const streakWeeks = contributionStreak(outTimestamps);
  const lastContributionAt = outgoing[0]?.timestamp ?? null;

  // Average weekly contribution over the active span (first→last contribution).
  let avgWeeklyContribution = 0;
  if (outTimestamps.length > 0 && totalContributed > 0) {
    const newest = Math.max(...outTimestamps);
    const oldest = Math.min(...outTimestamps);
    const spanWeeks = Math.max(1, Math.round((newest - oldest) / MS_PER_WEEK) + 1);
    avgWeeklyContribution = round2(totalContributed / spanWeeks);
  }

  const coach = analyzeSavings({
    balance: walletBalance,
    totalContributed,
    contributionCount,
    streakWeeks,
    avgWeeklyContribution,
    activeCircles,
    goalCount,
  });

  // Reputation leans on reliability signals: streak, on-chain activity and how
  // many circles the member commits to. Distinct from the coach's health score.
  const reputationScore = Math.round(
    100 *
      (0.45 * clamp(streakWeeks / 8) +
        0.3 * clamp(contributionCount / 10) +
        0.25 * clamp(activeCircles / 3))
  );

  return {
    walletAddress,
    walletBalance,
    rpcOk,
    totalContributed,
    totalReceived,
    contributionCount,
    streakWeeks,
    avgWeeklyContribution,
    lastContributionAt,
    reputationScore,
    reputationLabel: reputationLabel(reputationScore),
    coach,
    recentTransfers: transfers.slice(0, 6),
  };
}
