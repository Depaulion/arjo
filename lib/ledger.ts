import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArcStablecoin } from "@/lib/arc";

/**
 * Helpers for the append-only ledger. Every USDC action records a row *before*
 * the on-chain transfer is attempted (status 'pending'), then is promoted to
 * 'confirmed' or 'failed'. RLS enforces user_id = auth.uid(), so these run with
 * the cookie-session server client.
 */

export type LedgerKind =
  | "contribution"
  | "lock"
  | "withdraw"
  | "autosave"
  | "payout"
  | "penalty"
  | "bonus"
  // Circle bonds (migration 0013): post on join, refund on completion,
  // slash on default.
  | "bond"
  | "bond_refund"
  | "bond_slash"
  // Yield earned by a held bond while invested in USYC (migration 0018).
  | "bond_yield";

export type LedgerStatus = "pending" | "confirmed" | "failed";

export type RecordLedgerInput = {
  userId: string;
  kind: LedgerKind;
  amount: number;
  currency?: ArcStablecoin;
  circleId?: string | null;
  planId?: string | null;
  destination?: string | null;
  note?: string | null;
  status?: LedgerStatus;
};

export type LedgerRow = {
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

/** Insert a ledger row (default status 'pending'); returns the created row. */
export async function recordLedgerEntry(
  supabase: SupabaseClient,
  input: RecordLedgerInput
): Promise<LedgerRow> {
  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency ?? "USDC",
      circle_id: input.circleId ?? null,
      plan_id: input.planId ?? null,
      destination: input.destination ?? null,
      note: input.note ?? null,
      status: input.status ?? "pending",
    })
    .select("*")
    .single<LedgerRow>();

  if (error) throw new Error(error.message);
  return data;
}

/** Promote/settle a ledger row with the transfer outcome. */
export async function settleLedgerEntry(
  supabase: SupabaseClient,
  id: string,
  patch: {
    status: LedgerStatus;
    circleTxId?: string | null;
    txHash?: string | null;
    note?: string | null;
  }
): Promise<void> {
  const update: Record<string, unknown> = { status: patch.status };
  if (patch.circleTxId !== undefined) update.circle_tx_id = patch.circleTxId;
  if (patch.txHash !== undefined) update.tx_hash = patch.txHash;
  if (patch.note !== undefined) update.note = patch.note;

  const { error } = await supabase
    .from("ledger_entries")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(error.message);
}
