import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { getUserWallet, applyGamification } from "@/lib/savings-actions";
import type { Circle } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Contribute USDC to a circle's pot. The pot is the shared platform vault (the
 * single SCA wallet that also holds SafeLock principal and bonds), NOT the
 * creator's personal wallet — so no member ever has to trust the creator to
 * custody the pool. Per-circle attribution lives in the ledger (circle_id), and
 * the dashboard reads it back via the circle_pot_* RPCs (migration 0019).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Body is optional — fall back to the circle's contribution amount.
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select("*")
    .eq("id", params.id)
    .single<Circle>();

  if (circleError || !circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }

  const amount =
    body.amount != null ? Number(body.amount) : circle.contribution_amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a contribution amount greater than zero." },
      { status: 400 }
    );
  }

  // Resolve the pot wallet = the shared platform vault (not the creator).
  let potAddress: string | null = null;
  if (isCircleConfigured()) {
    try {
      potAddress = (await ensureVault()).address;
    } catch {
      potAddress = null;
    }
  }
  const wallet = await getUserWallet(supabase, user.id);
  const currency = circle.currency;

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "contribution",
    amount,
    currency,
    circleId: circle.id,
    destination: potAddress,
    note: `Contribution to "${circle.name}"`,
  });

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  if (isCircleConfigured() && wallet.walletId && potAddress) {
    try {
      const res = await sendUsdc({
        fromWalletId: wallet.walletId,
        toAddress: potAddress,
        amount,
        idempotencyKey: ledger.id,
        refId: `contribution:${circle.id}`,
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

  // Record that this member paid the current rotation round (migration 0020).
  // Best-effort and idempotent: a second contribution in the same round keeps
  // the first row, and a failure here must never fail the contribution itself.
  try {
    await supabase
      .from("circle_round_contributions")
      .upsert(
        {
          circle_id: circle.id,
          round_number: circle.current_round ?? 1,
          user_id: user.id,
          ledger_id: ledger.id,
          amount,
          status: "paid",
        },
        { onConflict: "circle_id,round_number,user_id", ignoreDuplicates: true }
      );
  } catch {
    // ignore — round tracking is non-critical to the money movement
  }

  const gamification = await applyGamification(supabase, user.id, "contribution");

  // Lightweight per-circle reputation: +5 for contributing. Best-effort — never
  // let a reputation hiccup fail the contribution.
  try {
    await supabase.rpc("bump_my_reputation", {
      p_circle_id: circle.id,
      p_delta: 5,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({
    ledgerId: ledger.id,
    amount,
    transfer,
    pending,
    gamification,
    potAddress,
    onChain: isCircleConfigured() && Boolean(wallet.walletId && potAddress),
  });
}
