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
