import type { ArcStablecoin } from "@/lib/arc";
import type { UsdcTransfer } from "@/lib/arc-onchain";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  arc_wallet_address: string | null;
  circle_wallet_id: string | null;
  wallet_blockchain: string;
  preferred_stablecoin: ArcStablecoin;
  /** Can read and triage all support tickets (migration 0011). */
  is_admin: boolean;
  /** Gamification counters (migration 0005). */
  xp: number;
  level: number;
  streak_weeks: number;
  badges: string[];
  /**
   * Reputation & risk signals (migration 0012). SYSTEM-MANAGED — never written
   * from a user-authenticated path; the Phase-4 defaulter flow updates these via
   * SECURITY DEFINER functions.
   */
  default_count: number;
  last_default_date: string | null;
  circle_lockout_until: string | null;
  is_flagged: boolean;
  default_status: DefaultStatus;
  missed_payments: number;
  withdrawal_attempts: number;
  reinstatement_circles_completed: number;
  ai_risk_score: RiskTier;
  reputation_history: ReputationEvent[];
  /** Linked Telegram chat the bot DMs notifications to (migration 0023). */
  telegram_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Member standing within the defaulter lifecycle (migration 0012). */
export type DefaultStatus = "none" | "grace" | "defaulted" | "reinstating";

/** Rule-based risk tier produced by lib/risk-engine.ts. */
export type RiskTier = "low" | "medium" | "high";

/** One entry in profiles.reputation_history. */
export type ReputationEvent = {
  event: string;
  delta: number;
  date: string;
  circle_id?: string | null;
};

/** Persisted notification kinds (migration 0014; auto-debit added 0021). */
export type NotificationType =
  | "default_warning"
  | "grace_period"
  | "bond_slashed"
  | "payout_delayed"
  | "restructure_vote"
  | "payout_protected"
  | "reinstatement_eligible"
  // Circle auto-debit lifecycle (migration 0021).
  | "auto_debit_upcoming"
  | "auto_debit_paid"
  | "auto_debit_failed"
  // Round-due reminder for members not on auto-debit (migration 0023).
  | "round_reminder";

/** A row from public.notifications. */
export type Notification = {
  id: string;
  user_id: string;
  circle_id: string | null;
  type: NotificationType;
  message: string;
  read: boolean;
  created_at: string;
};

export const CIRCLE_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

export type CircleFrequency = (typeof CIRCLE_FREQUENCIES)[number]["value"];

export type CircleStatus = "forming" | "active" | "completed";

export type Circle = {
  id: string;
  created_by: string;
  name: string;
  contribution_amount: number;
  currency: ArcStablecoin;
  frequency: CircleFrequency;
  member_count: number;
  status: CircleStatus;
  is_public: boolean;
  description: string | null;
  /** Refundable stake each member posts to join (migration 0013). 0 = no bond. */
  required_bond: number;
  /** Rotation round cycle (migration 0020). */
  current_round: number;
  round_started_at: string | null;
  round_due_at: string | null;
  total_rounds: number | null;
  created_at: string;
  updated_at: string;
};

export type CircleRole = "creator" | "member";

/** Lifecycle of a member's bond (migration 0013). */
export type BondStatus = "held" | "returned" | "slashed";

export type CircleMember = {
  circle_id: string;
  user_id: string;
  role: CircleRole;
  payout_position: number | null;
  /** Recipient Arc wallet, denormalized at join (migration 0006). */
  payout_address: string | null;
  /** True once this member has received their rotation payout. */
  paid_out: boolean;
  paid_at: string | null;
  payout_tx_hash: string | null;
  /** Awaiting refund settlement after an approved exit/removal (migration 0009). */
  pending_exit: boolean;
  /** Bond posted to join, held in the vault until completion (migration 0013). */
  bond_amount: number;
  bond_status: BondStatus;
  /** When the bond principal began earning USYC yield (migration 0018). Null
   *  for legacy rows with no held bond. Yield is accrued on-read from here. */
  bond_started_at: string | null;
  grace_period_ends: string | null;
  missed_contributions: number;
  /** Per-circle defaulter standing (migration 0013). */
  default_status: DefaultStatus;
  /** Opted in to automatic per-round contribution pulls (migration 0021). */
  auto_debit: boolean;
  joined_at: string;
};

// --- Circle governance (migration 0007) ---

export type ProposalType =
  | "PAYOUT_ORDER_CHANGE"
  | "MEMBER_EXIT_REQUEST"
  | "MEMBER_REMOVAL"
  | "RULE_CHANGE"
  // System-generated when a member's grace period expires (migration 0016).
  // Not user-pickable, so it is intentionally absent from PROPOSAL_TYPES.
  | "RESTRUCTURE";

export type ProposalStatus =
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "CANCELLED";

export type Proposal = {
  id: string;
  circle_id: string;
  created_by: string;
  type: ProposalType;
  title: string;
  description: string | null;
  /** Structured execution data, e.g. { order: [user_id, ...] }. */
  payload: Record<string, unknown>;
  /** Member targeted by an exit/removal proposal. */
  target_user_id: string | null;
  status: ProposalStatus;
  /** Percent of all members that must vote YES to approve. */
  threshold_pct: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type VoteChoice = "YES" | "NO";

export type ProposalVote = {
  proposal_id: string;
  user_id: string;
  choice: VoteChoice;
  created_at: string;
};

export const PROPOSAL_TYPES: {
  value: ProposalType;
  label: string;
  description: string;
}[] = [
  {
    value: "PAYOUT_ORDER_CHANGE",
    label: "Change payout order",
    description: "Reorder who receives the pooled payout, and when.",
  },
  {
    value: "MEMBER_EXIT_REQUEST",
    label: "Request to exit",
    description: "Ask the circle to approve a member leaving.",
  },
  {
    value: "MEMBER_REMOVAL",
    label: "Remove a member",
    description: "Vote a member out of the circle.",
  },
  {
    value: "RULE_CHANGE",
    label: "Change a rule",
    description: "Record a collective decision about how the circle runs.",
  },
];

export type SavingsGoal = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  currency: ArcStablecoin;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

// --- Customer support (migration 0010) ---

export type SupportCategory =
  | "general"
  | "payments"
  | "circles"
  | "account"
  | "bug"
  | "other";

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export const SUPPORT_CATEGORIES: {
  value: SupportCategory;
  label: string;
}[] = [
  { value: "general", label: "General question" },
  { value: "payments", label: "Payments & transfers" },
  { value: "circles", label: "Circles & payouts" },
  { value: "account", label: "Account & wallet" },
  { value: "bug", label: "Report a bug" },
  { value: "other", label: "Something else" },
];

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  category: SupportCategory;
  message: string;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

// --- Phase B: savings plans, ledger, challenges, gamification ---

export type SavingsPlanType = "flex" | "locked" | "target" | "auto";
export type SavingsPlanStatus = "active" | "matured" | "withdrawn" | "cancelled";
export type AutoCadence = "daily" | "weekly" | "monthly";

export type SavingsPlan = {
  id: string;
  user_id: string;
  name: string;
  plan_type: SavingsPlanType;
  principal: number;
  currency: ArcStablecoin;
  lock_until: string | null;
  auto_cadence: AutoCadence | null;
  auto_amount: number | null;
  next_run_at: string | null;
  target_amount: number | null;
  apy_bonus: number;
  status: SavingsPlanStatus;
  vault_address: string | null;
  /** Optional goal this plan funds (migration 0017). */
  goal_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LedgerKind =
  | "contribution"
  | "lock"
  | "withdraw"
  | "autosave"
  | "payout"
  | "penalty"
  | "bonus"
  // Circle bonds (migration 0013): post on join, refund on completion,
  // slash on default. Mirrors lib/ledger.ts.
  | "bond"
  | "bond_refund"
  | "bond_slash"
  // Yield earned by a held bond while invested in USYC (migration 0018).
  // Paid to the member on a good-standing return; forfeited to the pot on slash.
  | "bond_yield";
export type LedgerStatus = "pending" | "confirmed" | "failed";

export type LedgerEntry = {
  id: string;
  user_id: string;
  kind: LedgerKind;
  amount: number;
  currency: ArcStablecoin;
  circle_id: string | null;
  plan_id: string | null;
  tx_hash: string | null;
  circle_tx_id: string | null;
  status: LedgerStatus;
  destination: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ChallengeStatus = "active" | "completed" | "failed" | "abandoned";

export type Challenge = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  currency: ArcStablecoin;
  start_date: string;
  end_date: string;
  status: ChallengeStatus;
  reward_xp: number;
  created_at: string;
  updated_at: string;
};

// --- Contribution dashboard (live Arc on-chain USDC data) ---

export type { UsdcTransfer, TransferDirection } from "@/lib/arc-onchain";

/** One distinct on-chain contributor (an address that sent USDC to the pot). */
export type Contributor = {
  address: string;
  /** Total USDC sent into the pot. */
  total: number;
  /** Number of contribution transfers. */
  count: number;
  /** ISO timestamp of their most recent contribution. */
  lastAt: string | null;
  /**
   * True when this contributor's figures are hidden from the viewer by the
   * circle's "private amounts" mode (governed visibility — migration 0022).
   * The member is still listed (participation isn't secret), but total/count
   * are masked. Always false for the member themselves and the creator.
   */
  masked?: boolean;
};

/**
 * A circle dashboard backed by real Arc Testnet USDC transfers for the circle's
 * pot wallet, instead of mock data.
 */
export type CircleLedger = {
  id: string;
  name: string;
  currency: ArcStablecoin;
  /** The pot wallet address whose USDC activity drives the dashboard. */
  address: string | null;
  /** True once a pot address was resolved. */
  configured: boolean;
  /** True if the Arc RPC responded. */
  rpcOk: boolean;
  /** Current on-chain USDC balance of the pot wallet. */
  potBalance: number;
  /** Sum of all incoming USDC (contributions) in the scanned window. */
  totalContributed: number;
  /** Sum of all outgoing USDC (payouts) in the scanned window. */
  totalPaidOut: number;
  /** Distinct contributors, richest first. */
  contributors: Contributor[];
  /** Number of incoming transfers (contributions). */
  contributionCount: number;
  /** Number of outgoing transfers (payouts). */
  payoutCount: number;
  /** Most recent payout (outgoing transfer), if any. */
  lastPayout: UsdcTransfer | null;
  /** Recent transfers, newest first. */
  transfers: UsdcTransfer[];
  /** Lowest block scanned (start of the covered window). */
  scannedFromBlock: number | null;
  latestBlock: number | null;
  /** Optional circle metadata from Supabase, when available. */
  contributionAmount: number | null;
  frequency: CircleFrequency | null;
  memberCount: number | null;
  /** Rotation round cycle (migration 0020), when available. */
  currentRound: number | null;
  totalRounds: number | null;
  roundDueAt: string | null;
};
