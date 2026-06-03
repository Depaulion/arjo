import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { SAFELOCK_APY } from "@/lib/financial-planner";
import type { SavingsPlan } from "@/lib/types";

export const runtime = "nodejs";

/** Penalty (fraction of principal) for withdrawing a locked plan early. */
const EARLY_WITHDRAWAL_PENALTY = 0.1;

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

  const { data: plan, error: planError } = await supabase
    .from("savings_plans")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single<SavingsPlan>();

  if (planError || !plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }
  if (plan.status !== "active") {
    return NextResponse.json(
      { error: `This plan is already ${plan.status}.` },
      { status: 409 }
    );
  }

  const now = new Date();
  const lockUntil = plan.lock_until ? new Date(plan.lock_until) : null;
  const isEarly =
    plan.plan_type === "locked" && lockUntil !== null && now < lockUntil;

  const principal = plan.principal;
  let penalty = 0;
  let bonus = 0;

  if (isEarly) {
    penalty = Math.round(principal * EARLY_WITHDRAWAL_PENALTY * 100) / 100;
  } else {
    // Matured / on-time: credit the advertised bonus pro-rated over the time held.
    const created = new Date(plan.created_at);
    const monthsHeld = Math.max(
      0,
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    const rate = (plan.apy_bonus || SAFELOCK_APY * 100) / 100;
    bonus = Math.round(principal * rate * (monthsHeld / 12) * 100) / 100;
  }

  const payout = Math.max(0, principal - penalty + bonus);

  // Resolve the user's wallet (the destination for the returned funds).
  const { data: profile } = await supabase
    .from("profiles")
    .select("arc_wallet_address, preferred_stablecoin")
    .eq("id", user.id)
    .single<{ arc_wallet_address: string | null; preferred_stablecoin: string | null }>();

  const userAddress = profile?.arc_wallet_address ?? null;
  const currency = plan.currency;

  // Record the withdrawal (and any penalty/bonus) before attempting transfer.
  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "withdraw",
    amount: payout,
    currency,
    planId: plan.id,
    destination: userAddress,
    note: isEarly
      ? `Early withdrawal of "${plan.name}" (−${penalty} ${currency} penalty)`
      : `Withdrawal of "${plan.name}"${bonus > 0 ? ` (+${bonus} ${currency} bonus)` : ""}`,
  });

  if (penalty > 0) {
    await recordLedgerEntry(supabase, {
      userId: user.id,
      kind: "penalty",
      amount: penalty,
      currency,
      planId: plan.id,
      status: "confirmed",
      note: "Early SafeLock exit penalty",
    });
  }
  if (bonus > 0) {
    await recordLedgerEntry(supabase, {
      userId: user.id,
      kind: "bonus",
      amount: bonus,
      currency,
      planId: plan.id,
      status: "confirmed",
      note: "SafeLock yield bonus",
    });
  }

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  if (isCircleConfigured() && userAddress && payout > 0) {
    try {
      const vault = await ensureVault();
      const res = await sendUsdc({
        fromWalletId: vault.walletId,
        toAddress: userAddress,
        amount: payout,
        idempotencyKey: ledger.id,
        refId: `withdraw:${plan.id}`,
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
            ? `Payout not sent: ${err.message}`
            : "Payout not sent.",
      });
    }
  } else {
    pending = true;
  }

  // Mark the plan withdrawn regardless of transfer state; the ledger tracks the
  // money movement and the on-chain balance stays authoritative.
  const { data: updated } = await supabase
    .from("savings_plans")
    .update({ status: "withdrawn" })
    .eq("id", plan.id)
    .eq("user_id", user.id)
    .select("*")
    .single<SavingsPlan>();

  return NextResponse.json({
    plan: updated ?? { ...plan, status: "withdrawn" },
    payout,
    penalty,
    bonus,
    isEarly,
    transfer,
    pending,
    onChain: isCircleConfigured() && Boolean(userAddress),
  });
}
