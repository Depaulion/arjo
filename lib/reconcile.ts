import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCircleConfigured } from "@/lib/circle";
import { getTransferStatus } from "@/lib/circle-transfer";
import { settleLedgerEntry } from "@/lib/ledger";

/**
 * Settlement reconciler. Pending ledger rows that carry a Circle transaction id
 * are polled against Circle's state machine
 * (INITIATED → CLEARED → QUEUED → SENT → CONFIRMED → COMPLETE) and promoted to
 * `confirmed` (capturing the on-chain Arc tx hash) or `failed`. Rows still in
 * flight are left untouched for the next sync.
 *
 * Runs in the user's session against the cookie-bound client, so RLS limits it
 * to the caller's own rows.
 */

export type ReconcileSummary = {
  checked: number;
  confirmed: number;
  failed: number;
  stillPending: number;
};

export async function reconcilePendingLedger(
  supabase: SupabaseClient,
  userId: string,
  { limit = 25 }: { limit?: number } = {}
): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    checked: 0,
    confirmed: 0,
    failed: 0,
    stillPending: 0,
  };

  if (!isCircleConfigured()) return summary;

  const { data: pending } = await supabase
    .from("ledger_entries")
    .select("id, circle_tx_id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .not("circle_tx_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<{ id: string; circle_tx_id: string }[]>();

  if (!pending || pending.length === 0) return summary;

  for (const row of pending) {
    summary.checked += 1;
    try {
      const status = await getTransferStatus(row.circle_tx_id);
      if (status.confirmed) {
        await settleLedgerEntry(supabase, row.id, {
          status: "confirmed",
          txHash: status.txHash,
        });
        summary.confirmed += 1;
      } else if (status.failed) {
        await settleLedgerEntry(supabase, row.id, {
          status: "failed",
          note: `On-chain state: ${status.state ?? "failed"}`,
        });
        summary.failed += 1;
      } else {
        // Still in flight — capture the hash if it appeared, leave pending.
        if (status.txHash) {
          await settleLedgerEntry(supabase, row.id, {
            status: "pending",
            txHash: status.txHash,
          });
        }
        summary.stillPending += 1;
      }
    } catch {
      // A single transient failure shouldn't abort the whole sync.
      summary.stillPending += 1;
    }
  }

  return summary;
}
