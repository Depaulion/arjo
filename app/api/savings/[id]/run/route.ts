import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { getUserWallet, applyGamification } from "@/lib/savings-actions";
import type { AutoCadence, SavingsPlan } from "@/lib/types";

export const runtime = "nodejs";

function nextRun(cadence: AutoCadence, from = new Date()): string {
  const d = new Date(from);
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/**
 * Run a due auto-save plan once, in the user's session. (Without a Supabase
 * service-role key a background cron can't satisfy RLS, so the dashboard
 * surfaces due plans with a "Run now" button that calls this.)
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: plan, error } = await supabase
    .from("savings_plans")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single<SavingsPlan>();

  if (error || !plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }
  if (plan.plan_type !== "auto" || plan.status !== "active") {
    return NextResponse.json(
      { error: "This is not an active auto-save plan." },
      { status: 409 }
    );
  }
  const amount = plan.auto_amount ?? 0;
  if (amount <= 0) {
    return NextResponse.json(
      { error: "This plan has no auto-save amount." },
      { status: 409 }
    );
  }

  const wallet = await getUserWallet(supabase, user.id);
  const currency = plan.currency;

  let vaultAddress = plan.vault_address;
  if (!vaultAddress && isCircleConfigured()) {
    try {
      vaultAddress = (await ensureVault()).address;
    } catch {
      vaultAddress = null;
    }
  }

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "autosave",
    amount,
    currency,
    planId: plan.id,
    destination: vaultAddress,
    note: `Auto-save into "${plan.name}"`,
  });

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  if (isCircleConfigured() && wallet.walletId && vaultAddress) {
    try {
      const res = await sendUsdc({
        fromWalletId: wallet.walletId,
        toAddress: vaultAddress,
        amount,
        idempotencyKey: ledger.id,
        refId: `autosave:${plan.id}`,
      });
      await settleLedgerEntry(supabase, ledger.id, {
        status: "pending",
        circleTxId: res.circleTxId,
        txHash: res.txHash,
      });
      transfer = { state: res.state, txHash: res.txHash };
    } catch (err) {
      pending = true;
      await settleLedgerEntry(supabase, ledger.id, {
        status: "pending",
        note:
          err instanceof Error
            ? `Transfer not sent: ${err.message}`
            : "Transfer not sent.",
      });
    }
  } else {
    pending = true;
  }

  // Advance the schedule and grow the principal regardless of transfer state.
  const { data: updated } = await supabase
    .from("savings_plans")
    .update({
      principal: plan.principal + amount,
      next_run_at: plan.auto_cadence ? nextRun(plan.auto_cadence) : null,
    })
    .eq("id", plan.id)
    .eq("user_id", user.id)
    .select("*")
    .single<SavingsPlan>();

  const gamification = await applyGamification(supabase, user.id, "autosave");

  return NextResponse.json({
    plan: updated ?? plan,
    amount,
    transfer,
    pending,
    gamification,
    onChain: isCircleConfigured() && Boolean(wallet.walletId && vaultAddress),
  });
}
