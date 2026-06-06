/**
 * Arjo — rule-based reputation & risk engine (Phase 1).
 *
 * Pure, deterministic logic: no ML, no I/O, no money movement. Given a member's
 * behavioral signals it produces (a) a reputation score 0–100, (b) a risk tier,
 * and (c) the feature gates that follow from them. Callers (dashboard, circle
 * join/create flows) read these to decide what a member may do.
 *
 * The reputation score deliberately reconciles with the existing live "Arc
 * Score": positive savings signals lift it above a neutral baseline, and the
 * persisted negative signals (defaults, flags) pull it down — so there is ONE
 * number, not two competing ones.
 */
import type { ReputationEvent, RiskTier } from "@/lib/types";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** A brand-new member starts here — squarely in the "standard" access band. */
export const REPUTATION_BASELINE = 50;

// --- Reputation score -------------------------------------------------------

export type ReputationInputs = {
  /** Consecutive-week contribution streak. */
  streakWeeks: number;
  /** Lifetime count of outgoing contributions. */
  contributionCount: number;
  /** Number of circles the member is actively committed to. */
  activeCircles: number;
  /** Lifetime confirmed defaults (profiles.default_count). */
  defaultCount: number;
  /** Risk flag (profiles.is_flagged). */
  isFlagged: boolean;
};

/**
 * Reputation 0–100. Baseline 50, up to +50 from positive reliability signals,
 * minus penalties for defaults / flags. Clamped to [0, 100].
 */
export function computeReputationScore(i: ReputationInputs): number {
  const positive =
    50 *
    (0.45 * clamp(i.streakWeeks / 8) +
      0.3 * clamp(i.contributionCount / 10) +
      0.25 * clamp(i.activeCircles / 3));
  const penalty = 20 * Math.max(0, i.defaultCount) + (i.isFlagged ? 10 : 0);
  return Math.round(clamp(REPUTATION_BASELINE + positive - penalty, 0, 100));
}

export function reputationLabel(score: number): string {
  if (score >= 85) return "Trusted saver";
  if (score >= 70) return "Reliable";
  if (score >= 50) return "Established";
  if (score >= 30) return "Rising";
  return "Newcomer";
}

// --- Reputation event deltas (for the persisted history log) ----------------

export const REPUTATION_DELTAS = {
  round_complete: 10,
  on_time_contribution: 5,
  referral_complete: 3,
  approved_exit: -5,
  missed_contribution: -10,
  default: -20,
  unapproved_exit: -20,
} as const;

export type ReputationEventType = keyof typeof REPUTATION_DELTAS;

/** Build a reputation_history entry (does not persist — caller writes it). */
export function buildReputationEvent(
  event: ReputationEventType,
  circleId?: string | null
): ReputationEvent {
  return {
    event,
    delta: REPUTATION_DELTAS[event],
    date: new Date().toISOString(),
    circle_id: circleId ?? null,
  };
}

// --- Rule-based risk tier ---------------------------------------------------

export type RiskSignals = {
  defaultCount: number;
  /** On-time ÷ total contributions, as a percentage 0–100. */
  consistencyRate: number;
  missedPayments: number;
  reputationScore: number;
  withdrawalAttempts: number;
};

export type RiskAssessment = {
  tier: RiskTier;
  reasons: string[];
};

/** Pure on-time consistency rate (0–100). Safe on zero history (→ 100). */
export function consistencyRate(onTime: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round(clamp(onTime / total, 0, 1) * 100);
}

/**
 * Assign a risk tier from behavioral signals. HIGH dominates MEDIUM dominates
 * LOW: a single high-risk signal is enough to flag the member.
 */
export function assessRisk(s: RiskSignals): RiskAssessment {
  const reasons: string[] = [];

  if (s.defaultCount >= 1) reasons.push("Has defaulted before");
  if (s.consistencyRate < 60) reasons.push("Low contribution consistency");
  if (s.missedPayments >= 3) reasons.push("Three or more missed payments");
  if (s.reputationScore < 30) reasons.push("Reputation below 30");
  if (reasons.length > 0) return { tier: "high", reasons };

  if (s.consistencyRate < 80) reasons.push("Building consistency");
  if (s.missedPayments >= 1) reasons.push("One or two missed payments");
  if (s.reputationScore < 60) reasons.push("Reputation still building");
  if (s.withdrawalAttempts >= 3) reasons.push("Frequent recent withdrawals");
  if (reasons.length > 0) return { tier: "medium", reasons };

  return { tier: "low", reasons: ["Consistent, default-free history"] };
}

// --- Feature gates ----------------------------------------------------------

export type CircleAccess = {
  /** May join an existing circle right now. */
  canJoin: boolean;
  /** May create new circles. */
  canCreate: boolean;
  /** Cap on member count for circles they may join (null = no cap). */
  maxMembers: number | null;
  /** Cap on per-round contribution in stablecoin units (null = no cap). */
  maxContribution: number | null;
  /** Required bond as a multiple of the standard bond. */
  bondMultiplier: number;
  /** Human-readable explanation of the gate. */
  reason: string;
};

/**
 * Resolve what a member may do from their score, risk tier and lockout.
 * Order of precedence: active lockout → score band → risk/default surcharges.
 */
export function circleAccess(input: {
  score: number;
  tier: RiskTier;
  defaultCount: number;
  lockoutUntil: string | null;
  now?: Date;
}): CircleAccess {
  const now = input.now ?? new Date();
  const lockedOut =
    input.lockoutUntil != null && new Date(input.lockoutUntil) > now;

  // Bond surcharge: high-risk → 2×, repeat defaulter (≥2) → 3×.
  const bondMultiplier =
    input.defaultCount >= 2 ? 3 : input.tier === "high" ? 2 : 1;
  // A repeat defaulter can never create circles.
  const repeatDefaulter = input.defaultCount >= 2;

  if (lockedOut) {
    return {
      canJoin: false,
      canCreate: false,
      maxMembers: null,
      maxContribution: null,
      bondMultiplier,
      reason: `Locked out until ${new Date(
        input.lockoutUntil as string
      ).toLocaleDateString()} after a default. Rejoin small circles once it lifts.`,
    };
  }

  if (input.score < 30) {
    return {
      canJoin: false,
      canCreate: false,
      maxMembers: null,
      maxContribution: null,
      bondMultiplier,
      reason: "Reputation below 30 — blocked from circles. Build it back up by saving consistently.",
    };
  }

  if (input.score < 60) {
    return {
      canJoin: true,
      canCreate: !repeatDefaulter && false,
      maxMembers: 10,
      maxContribution: 50,
      bondMultiplier,
      reason: "Standard access: join circles up to 10 members and 50 per round.",
    };
  }

  if (input.score < 80) {
    return {
      canJoin: true,
      canCreate: !repeatDefaulter,
      maxMembers: null,
      maxContribution: null,
      bondMultiplier,
      reason: "Premium access: larger circles unlocked.",
    };
  }

  return {
    canJoin: true,
    canCreate: !repeatDefaulter,
    maxMembers: null,
    maxContribution: null,
    bondMultiplier,
    reason: repeatDefaulter
      ? "Full access, but repeat defaulters cannot create circles."
      : "Full access: create circles and priority payout slots unlocked.",
  };
}

// --- Risk badge presentation ------------------------------------------------

export const RISK_BADGES: Record<
  RiskTier,
  { label: string; tone: "green" | "yellow" | "red" }
> = {
  low: { label: "Trusted Saver", tone: "green" },
  medium: { label: "Building Trust", tone: "yellow" },
  high: { label: "High Risk", tone: "red" },
};
