import type { SupabaseClient } from "@supabase/supabase-js";

import { isEvmAddress, type ArcStablecoin } from "@/lib/arc";
import {
  getUsdcBalance,
  getUsdcTransfers,
  type UsdcTransfer,
} from "@/lib/arc-onchain";
import type {
  CircleFrequency,
  CircleLedger,
  Contributor,
} from "@/lib/types";

export type CircleLedgerInput = {
  id: string;
  name: string;
  address: string | null;
  currency?: ArcStablecoin;
  contributionAmount?: number | null;
  frequency?: CircleFrequency | null;
  memberCount?: number | null;
  currentRound?: number | null;
  totalRounds?: number | null;
  roundDueAt?: string | null;
};

function emptyLedger(input: CircleLedgerInput): CircleLedger {
  return {
    id: input.id,
    name: input.name,
    currency: input.currency ?? "USDC",
    address: input.address,
    configured: false,
    rpcOk: false,
    potBalance: 0,
    totalContributed: 0,
    totalPaidOut: 0,
    contributors: [],
    contributionCount: 0,
    payoutCount: 0,
    lastPayout: null,
    transfers: [],
    scannedFromBlock: null,
    latestBlock: null,
    contributionAmount: input.contributionAmount ?? null,
    frequency: input.frequency ?? null,
    memberCount: input.memberCount ?? null,
    currentRound: input.currentRound ?? null,
    totalRounds: input.totalRounds ?? null,
    roundDueAt: input.roundDueAt ?? null,
  };
}

function summarizeContributors(incoming: UsdcTransfer[]): Contributor[] {
  const byAddress = new Map<string, Contributor>();
  for (const t of incoming) {
    const existing = byAddress.get(t.counterparty);
    if (existing) {
      existing.total += t.amount;
      existing.count += 1;
      if (t.timestamp && (!existing.lastAt || t.timestamp > existing.lastAt)) {
        existing.lastAt = t.timestamp;
      }
    } else {
      byAddress.set(t.counterparty, {
        address: t.counterparty,
        total: t.amount,
        count: 1,
        lastAt: t.timestamp,
      });
    }
  }
  return Array.from(byAddress.values()).sort((a, b) => b.total - a.total);
}

/**
 * Build a circle dashboard from live Arc Testnet USDC data for the pot wallet.
 * Falls back gracefully: no address -> not configured; RPC failure -> rpcOk
 * false, so the page can show a clear empty/error state instead of crashing.
 */
export async function getCircleLedger(
  input: CircleLedgerInput
): Promise<CircleLedger> {
  const ledger = emptyLedger(input);

  if (!input.address || !isEvmAddress(input.address)) {
    return ledger;
  }
  ledger.configured = true;

  const [balanceResult, transfersResult] = await Promise.allSettled([
    getUsdcBalance(input.address),
    getUsdcTransfers(input.address),
  ]);

  if (balanceResult.status === "fulfilled") {
    ledger.rpcOk = true;
    ledger.potBalance = balanceResult.value;
  }

  if (transfersResult.status === "fulfilled") {
    ledger.rpcOk = true;
    const { transfers, fromBlock, latestBlock } = transfersResult.value;
    const incoming = transfers.filter((t) => t.direction === "in");
    const outgoing = transfers.filter((t) => t.direction === "out");

    ledger.transfers = transfers;
    ledger.totalContributed = incoming.reduce((s, t) => s + t.amount, 0);
    ledger.totalPaidOut = outgoing.reduce((s, t) => s + t.amount, 0);
    ledger.contributors = summarizeContributors(incoming);
    ledger.contributionCount = incoming.length;
    ledger.payoutCount = outgoing.length;
    ledger.lastPayout = outgoing[0] ?? null;
    ledger.scannedFromBlock = fromBlock;
    ledger.latestBlock = latestBlock;
  }

  return ledger;
}

// --- DB-derived dashboard (the pot lives in the shared vault, migration 0019) -
// Once contributions flow into the commingled platform vault, a single on-chain
// address can no longer represent one circle's pot. These shapes mirror the
// SECURITY DEFINER RPCs (circle_pot_summary / circle_contributors /
// circle_ledger_feed) that attribute pot activity per circle from the ledger.

type PotSummaryRow = {
  pot_balance: number | string | null;
  total_contributed: number | string | null;
  total_paid_out: number | string | null;
  contribution_count: number | string | null;
  payout_count: number | string | null;
  last_payout_at: string | null;
  last_payout_to: string | null;
  last_payout_amount: number | string | null;
};

type ContributorRow = {
  user_id: string;
  display_name: string | null;
  address: string | null;
  total: number | string | null;
  count: number | string | null;
  last_at: string | null;
};

type FeedRow = {
  id: string;
  kind: string;
  amount: number | string | null;
  status: string;
  tx_hash: string | null;
  destination: string | null;
  counterparty: string | null;
  note: string | null;
  created_at: string | null;
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

/**
 * Build a circle dashboard from the LEDGER (per-circle attribution) instead of a
 * single on-chain address — the correct source now that every circle's pot is
 * pooled in the shared vault. Falls back to an empty (but configured) ledger if
 * the RPCs error, so the page renders a clean state rather than crashing.
 */
export async function getCircleLedgerFromDb(
  supabase: SupabaseClient,
  input: CircleLedgerInput
): Promise<CircleLedger> {
  const ledger = emptyLedger(input);
  ledger.configured = true;

  const [summaryRes, contributorsRes, feedRes] = await Promise.all([
    supabase.rpc("circle_pot_summary", { p_circle_id: input.id }),
    supabase.rpc("circle_contributors", { p_circle_id: input.id }),
    supabase.rpc("circle_ledger_feed", { p_circle_id: input.id, p_limit: 25 }),
  ]);

  if (!summaryRes.error && Array.isArray(summaryRes.data) && summaryRes.data[0]) {
    const s = summaryRes.data[0] as PotSummaryRow;
    ledger.rpcOk = true;
    ledger.potBalance = num(s.pot_balance);
    ledger.totalContributed = num(s.total_contributed);
    ledger.totalPaidOut = num(s.total_paid_out);
    ledger.contributionCount = num(s.contribution_count);
    ledger.payoutCount = num(s.payout_count);
    if (s.last_payout_at) {
      ledger.lastPayout = {
        txHash: "",
        logIndex: 0,
        blockNumber: 0,
        timestamp: s.last_payout_at,
        from: input.address ?? "",
        to: s.last_payout_to ?? "",
        amount: num(s.last_payout_amount),
        direction: "out",
        counterparty: s.last_payout_to ?? "",
      };
    }
  }

  if (!contributorsRes.error && Array.isArray(contributorsRes.data)) {
    ledger.rpcOk = true;
    ledger.contributors = (contributorsRes.data as ContributorRow[]).map((c) => ({
      address: c.address ?? c.display_name ?? c.user_id,
      total: num(c.total),
      count: num(c.count),
      lastAt: c.last_at,
      // The RPC returns total=null only for members masked by the circle's
      // "private amounts" mode (contributor rows otherwise always have total>0).
      masked: c.total === null,
    }));
  }

  if (!feedRes.error && Array.isArray(feedRes.data)) {
    ledger.rpcOk = true;
    ledger.transfers = (feedRes.data as FeedRow[]).map((r) => {
      const out = r.kind === "payout" || r.kind === "withdraw";
      return {
        txHash: r.tx_hash ?? "",
        logIndex: 0,
        blockNumber: 0,
        timestamp: r.created_at,
        from: out ? input.address ?? "" : r.counterparty ?? "",
        to: out ? r.counterparty ?? "" : input.address ?? "",
        amount: num(r.amount),
        direction: out ? "out" : "in",
        counterparty: r.counterparty ?? "",
      };
    });
  }

  return ledger;
}
