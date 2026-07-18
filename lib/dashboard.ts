/**
 * Server-side aggregator for the member dashboard.
 *
 * Does ONE onchain scan of the member's wallet and derives everything the
 * dashboard needs from it: balance, contribution streak, weekly cadence,
 * reputation score and the savings-coach analysis. Keeping it to a single scan
 * keeps the dashboard fast even though it powers several sections.
 */
import "server-only";

import { getUsdcBalance, getUsdcTransfers, type UsdcTransfer } from "@/lib/arc-onchain";
import { analyzeSavings, type SavingsCoachAnalysis } from "@/lib/savings-coach";
import {
  assessRisk,
  computeReputationScore,
  consistencyRate,
  reputationLabel,
} from "@/lib/risk-engine";
import type { RiskTier } from "@/lib/types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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
  /** Rule-based risk tier from lib/risk-engine.ts. */
  riskTier: RiskTier;
  /** Plain-language drivers behind the risk tier. */
  riskReasons: string[];
  coach: SavingsCoachAnalysis;
  recentTransfers: UsdcTransfer[];
};

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
  /** Persisted safety signals from the profile (migration 0012). */
  defaultCount?: number;
  isFlagged?: boolean;
  missedPayments?: number;
  withdrawalAttempts?: number;
}): Promise<DashboardSnapshot> {
  const {
    walletAddress,
    activeCircles,
    goalCount,
    defaultCount = 0,
    isFlagged = false,
    missedPayments = 0,
    withdrawalAttempts = 0,
  } = input;

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

  // Reputation: a neutral baseline lifted by reliability signals (streak,
  // onchain activity, circle commitment) and pulled down by defaults/flags, so
  // there is one coherent score rather than a separate "positive only" number.
  const reputationScore = computeReputationScore({
    streakWeeks,
    contributionCount,
    activeCircles,
    defaultCount,
    isFlagged,
  });

  // On-time consistency proxy until per-round tracking lands (Phase 4):
  // contributions made vs. contributions made + missed.
  const consistency = consistencyRate(
    contributionCount,
    contributionCount + missedPayments
  );
  const { tier: riskTier, reasons: riskReasons } = assessRisk({
    defaultCount,
    consistencyRate: consistency,
    missedPayments,
    reputationScore,
    withdrawalAttempts,
  });

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
    riskTier,
    riskReasons,
    coach,
    recentTransfers: transfers.slice(0, 6),
  };
}
