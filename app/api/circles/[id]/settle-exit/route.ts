import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { shortenHex } from "@/lib/arc";
import type { Circle, Proposal } from "@/lib/types";

export const runtime = "nodejs";

type MemberRow = {
  user_id: string;
  role: "creator" | "member";
  payout_address: string | null;
  pending_exit: boolean;
};

/**
 * Settle an approved circle exit/removal — return the leaving member's net
 * contributions, then remove them.
 *
 * 0007 approved exit proposals by deleting the membership and refunding nothing.
 * 0009 splits that: approval only flags the member `pending_exit`; this route
 * (creator-only, since the pot is the creator's wallet) refunds their net
 * contributions from the pot and then calls finalize_member_exit to remove the
 * membership and mark the proposal EXECUTED.
 *
 * Ledger-first, like every USDC action here: record the row, attempt the send,
 * settle it pending. A failed send leaves the row pending AND the member still
 * pending_exit, so the creator can retry — the onchain balance stays
 * authoritative and the member is never removed before they are paid.
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
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const proposalId =
    typeof body.proposalId === "string" ? body.proposalId : "";
  if (!proposalId) {
    return NextResponse.json(
      { error: "Which exit proposal should be settled?" },
      { status: 400 }
    );
  }

  // Load the circle to confirm the caller controls the pot.
  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select("*")
    .eq("id", params.id)
    .single<Circle>();

  if (circleError || !circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }
  if (circle.created_by !== user.id) {
    return NextResponse.json(
      { error: "Only the circle creator can settle an exit." },
      { status: 403 }
    );
  }

  // Load the proposal and validate it's a settle-able, approved exit.
  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("circle_id", circle.id)
    .single<Proposal>();

  if (proposalError || !proposal) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  if (
    proposal.type !== "MEMBER_EXIT_REQUEST" &&
    proposal.type !== "MEMBER_REMOVAL"
  ) {
    return NextResponse.json(
      { error: "That proposal isn't a member exit or removal." },
      { status: 400 }
    );
  }
  if (proposal.status !== "APPROVED") {
    return NextResponse.json(
      { error: "This exit isn't approved and awaiting settlement." },
      { status: 409 }
    );
  }
  if (!proposal.target_user_id) {
    return NextResponse.json(
      { error: "This proposal has no member to settle." },
      { status: 400 }
    );
  }

  const targetUserId = proposal.target_user_id;

  // The leaving member's recipient address (creator can read co-members).
  const { data: member } = await supabase
    .from("circle_members")
    .select("user_id, role, payout_address, pending_exit")
    .eq("circle_id", circle.id)
    .eq("user_id", targetUserId)
    .maybeSingle<MemberRow>();

  if (!member) {
    // Already removed — nothing left to settle; just finalize the proposal.
    await supabase.rpc("finalize_member_exit", { p_proposal_id: proposalId });
    return NextResponse.json({
      settled: true,
      refund: 0,
      message: "Member already left; nothing to refund.",
    });
  }
  if (member.role === "creator") {
    return NextResponse.json(
      { error: "The circle creator can't be removed or exited." },
      { status: 400 }
    );
  }

  // How much do we owe them? (Net contributions, unless they were already paid.)
  const { data: refundData, error: refundError } = await supabase.rpc(
    "circle_exit_refund",
    { p_circle_id: circle.id, p_user_id: targetUserId }
  );
  if (refundError) {
    return NextResponse.json(
      { error: "Couldn't compute the refund owed. Try again shortly." },
      { status: 500 }
    );
  }
  const refund = Math.max(0, Number(refundData) || 0);
  const currency = circle.currency;

  // No refund owed (e.g. already paid out, or never contributed) → just finalize.
  if (refund <= 0) {
    const { error: finalizeError } = await supabase.rpc("finalize_member_exit", {
      p_proposal_id: proposalId,
    });
    if (finalizeError) {
      return NextResponse.json(
        { error: "Couldn't finalize the exit. Try again shortly." },
        { status: 500 }
      );
    }
    return NextResponse.json({
      settled: true,
      refund: 0,
      currency,
      message: "Exit settled — no contributions left to refund.",
    });
  }

  // A refund is owed but we can't pay it yet: leave the member pending_exit.
  if (!member.payout_address) {
    return NextResponse.json(
      {
        error:
          "This member hasn't linked a wallet, so the refund can't be sent. They stay in the circle until that's resolved.",
        refund,
        currency,
      },
      { status: 409 }
    );
  }
  if (!isCircleConfigured()) {
    return NextResponse.json(
      { error: "onchain transfers aren't available right now." },
      { status: 503 }
    );
  }

  // The refund is paid FROM the platform vault (the pot), not the creator.
  let vault: { walletId: string; address: string } | null = null;
  try {
    vault = await ensureVault();
  } catch {
    vault = null;
  }
  if (!vault?.walletId) {
    return NextResponse.json(
      { error: "The platform vault isn't ready yet. Try again in a moment." },
      { status: 409 }
    );
  }

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "withdraw",
    amount: refund,
    currency,
    circleId: circle.id,
    destination: member.payout_address,
    note: `Exit refund to ${shortenHex(member.payout_address)} from "${circle.name}"`,
  });

  let transfer: { state: string | null; txHash: string | null } | null = null;

  try {
    const res = await sendUsdc({
      fromWalletId: vault.walletId,
      toAddress: member.payout_address,
      amount: refund,
      idempotencyKey: ledger.id,
      refId: `exit:${circle.id}`,
    });
    await settleLedgerEntry(supabase, ledger.id, {
      status: "pending",
      circleTxId: res.circleTxId,
      txHash: res.txHash,
    });
    transfer = { state: res.state, txHash: res.txHash };
  } catch (err) {
    // Send failed: keep the row pending and the member pending_exit for retry.
    await settleLedgerEntry(supabase, ledger.id, {
      status: "pending",
      note:
        err instanceof Error
          ? `Exit refund not sent: ${err.message}`
          : "Exit refund not sent.",
    });
    return NextResponse.json(
      {
        settled: false,
        pending: true,
        refund,
        currency,
        ledgerId: ledger.id,
        error:
          "The refund couldn't be sent onchain. The member stays in the circle so you can retry.",
      },
      { status: 502 }
    );
  }

  // Refund accepted by Circle — remove the member and mark the exit EXECUTED.
  const { error: finalizeError } = await supabase.rpc("finalize_member_exit", {
    p_proposal_id: proposalId,
  });

  return NextResponse.json({
    settled: !finalizeError,
    refund,
    currency,
    destination: member.payout_address,
    ledgerId: ledger.id,
    transfer,
    onChain: true,
    // If finalize failed, the refund went out but the row wasn't removed — rare,
    // and safe to retry (a second settle owes 0 and just finalizes).
    finalizeError: finalizeError ? finalizeError.message : undefined,
  });
}
