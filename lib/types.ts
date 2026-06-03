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
  /** Gamification counters (migration 0005). */
  xp: number;
  level: number;
  streak_weeks: number;
  badges: string[];
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
};

export type CircleRole = "creator" | "member";

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
  joined_at: string;
};

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
  | "bonus";
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
};
