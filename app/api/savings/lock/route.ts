import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { getUserWallet, applyGamification } from "@/lib/savings-actions";
import type { AutoCadence, SavingsPlan, SavingsPlanType } from "@/lib/types";

export const runtime = "nodejs";

const PLAN_TYPES: SavingsPlanType[] = ["flex", "locked", "target", "auto"];
const CADENCES: AutoCadence[] = ["daily", "weekly", "monthly"];

/** Annualised bonus (%) we credit by plan type. Flex earns nothing. */
const APY_BONUS: Record<SavingsPlanType, number> = {
  flex: 0,
  locked: 8,
  target: 4,
  auto: 2,
};

function nextRun(cadence: AutoCadence, from = new Date()): string {
  const d = new Date(from);
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const planType = String(body.planType ?? "") as SavingsPlanType;
  const amount = Number(body.amount);
  const lockUntil = body.lockUntil ? String(body.lockUntil) : null;
  const autoCadence = body.autoCadence
    ? (String(body.autoCadence) as AutoCadence)
    : null;
  const autoAmount = body.autoAmount != null ? Number(body.autoAmount) : null;
  const targetAmount =
    body.targetAmount != null ? Number(body.targetAmount) : null;

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "Give your plan a name (2–80 characters)." },
      { status: 400 }
    );
  }
  if (!PLAN_TYPES.includes(planType)) {
    return NextResponse.json({ error: "Unknown plan type." }, { status: 400 });
  }
  if (planType === "auto") {
    if (!autoCadence || !CADENCES.includes(autoCadence)) {
      return NextResponse.json(
        { error: "Choose a valid auto-save cadence." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(autoAmount) || (autoAmount as number) <= 0) {
      return NextResponse.json(
        { error: "Enter an auto-save amount greater than zero." },
        { status: 400 }
      );
    }
  } else if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a deposit amount greater than zero." },
      { status: 400 }
    );
  }
  if (planType === "locked" && !lockUntil) {
    return NextResponse.json(
      { error: "A SafeLock plan needs a lock-until date." },
      { status: 400 }
    );
  }

  const wallet = await getUserWallet(supabase, user.id);
  const currency = wallet.currency;

  // Resolve the vault address (best-effort; null when Circle isn't configured).
  let vaultAddress: string | null = null;
  if (isCircleConfigured()) {
    try {
      vaultAddress = (await ensureVault()).address;
    } catch {
      vaultAddress = null;
    }
  }

  // For auto plans, principal starts at 0 and grows via /run. Otherwise the
  // initial deposit is the principal.
  const initialDeposit = planType === "auto" ? 0 : amount;

  const { data: plan, error: planError } = await supabase
    .from("savings_plans")
    .insert({
      user_id: user.id,
      name,
      plan_type: planType,
      principal: initialDeposit,
      currency,
      lock_until: lockUntil,
      auto_cadence: autoCadence,
      auto_amount: autoAmount,
      next_run_at: autoCadence ? nextRun(autoCadence) : null,
      target_amount: targetAmount,
      apy_bonus: APY_BONUS[planType],
      status: "active",
      vault_address: vaultAddress,
    })
    .select("*")
    .single<SavingsPlan>();

  if (planError || !plan) {
    return NextResponse.json(
      { error: planError?.message ?? "Could not create the plan." },
      { status: 500 }
    );
  }

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  // Move the initial deposit into the vault (skip for auto plans).
  if (initialDeposit > 0) {
    const ledger = await recordLedgerEntry(supabase, {
      userId: user.id,
      kind: "lock",
      amount: initialDeposit,
      currency,
      planId: plan.id,
      destination: vaultAddress,
      note: `Opened ${planType} plan "${name}"`,
    });

    if (isCircleConfigured() && wallet.walletId && vaultAddress) {
      try {
        const res = await sendUsdc({
          fromWalletId: wallet.walletId,
          toAddress: vaultAddress,
          amount: initialDeposit,
          idempotencyKey: ledger.id,
          refId: `lock:${plan.id}`,
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
      // Circle unavailable — keep the ledger pending for later reconciliation.
      pending = true;
    }
  }

  const gamification = await applyGamification(
    supabase,
    user.id,
    planType === "locked" ? "lock" : "contribution"
  );

  return NextResponse.json({
    plan,
    transfer,
    pending,
    gamification,
    onChain: isCircleConfigured() && Boolean(wallet.walletId && vaultAddress),
  });
}
