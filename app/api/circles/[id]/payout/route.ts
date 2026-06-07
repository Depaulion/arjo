import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { shortenHex } from "@/lib/arc";
import type { Circle } from "@/lib/types";

export const runtime = "nodejs";

const round2 = (n: number) => Math.round(n * 100) / 100;

type MemberRow = {
  user_id: string;
  role: "creator" | "member";
  payout_position: number | null;
  payout_address: string | null;
  paid_out: boolean;
};

/**
 * Trigger the next rotating payout for a circle — the defining Ajo/ROSCA action.
 *
 * The pot lives in the shared platform vault, so the payout is sent FROM the
 * vault wallet. Only the circle creator can authorize it. We pay the next member
 * in the rotation (lowest payout_position that hasn't been paid yet) the full
 * round pot (contribution × members, overridable via the request body), record a
 * `payout` ledger entry, and mark that member paid. When the last member is
 * paid, the circle is marked completed.
 *
 * Because the vault commingles every circle's funds, the payout is capped at the
 * circle's own ledger-derived pot balance (circle_pot_balance, migration 0019):
 * a circle can never pay out more than it has collected, so one circle's payout
 * can't touch another's money.
 *
 * Like every USDC action here, the ledger row is written first; a failed
 * on-chain send leaves the row `pending` and the member un-paid so it can be
 * retried — the on-chain balance stays authoritative.
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
    // Body is optional — fall back to the full round pot.
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select("*")
    .eq("id", params.id)
    .single<Circle>();

  if (circleError || !circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }

  // Only the creator authorizes payouts (the pot itself is the platform vault).
  if (circle.created_by !== user.id) {
    return NextResponse.json(
      { error: "Only the circle creator can send a payout." },
      { status: 403 }
    );
  }

  // Resolve the rotation: members not yet paid, lowest position first.
  const { data: members, error: membersError } = await supabase
    .from("circle_members")
    .select("user_id, role, payout_position, payout_address, paid_out")
    .eq("circle_id", circle.id)
    .eq("paid_out", false)
    .order("payout_position", { ascending: true })
    .returns<MemberRow[]>();

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 });
  }

  const queue = (members ?? []).filter((m) => m.payout_position != null);
  if (queue.length === 0) {
    // Everyone has been paid — the rotation is complete.
    if (circle.status !== "completed") {
      await supabase
        .from("circles")
        .update({ status: "completed" })
        .eq("id", circle.id);
    }
    return NextResponse.json({
      done: true,
      message: "All members have received their payout. The circle is complete.",
      remaining: 0,
    });
  }

  const recipient = queue[0];
  const remainingAfter = queue.length - 1;

  if (!recipient.payout_address) {
    return NextResponse.json(
      {
        error:
          "The next member in the rotation hasn't linked an Arc wallet yet, so the pot can't be paid out to them.",
      },
      { status: 409 }
    );
  }

  // Default payout = the full round pot (each member contributes once per round).
  const fullPot = circle.contribution_amount * circle.member_count;
  const amount = body.amount != null ? Number(body.amount) : fullPot;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a payout amount greater than zero." },
      { status: 400 }
    );
  }

  // Safety ceiling: never pay out more than THIS circle has collected. The vault
  // commingles every circle's funds, so this ledger-derived balance is what
  // keeps one circle's payout from spending another's money.
  const { data: potBalanceRaw, error: potError } = await supabase.rpc(
    "circle_pot_balance",
    { p_circle_id: circle.id }
  );
  if (potError) {
    return NextResponse.json(
      { error: "Couldn't read the circle's pot balance. Try again shortly." },
      { status: 500 }
    );
  }
  const potBalance = Math.max(0, Number(potBalanceRaw) || 0);
  if (round2(amount) > round2(potBalance)) {
    return NextResponse.json(
      {
        error: `The pot holds ${potBalance} ${circle.currency}, which isn't enough for a ${amount} ${circle.currency} payout yet. It fills as members contribute this round.`,
        potBalance,
        requested: amount,
      },
      { status: 409 }
    );
  }

  // Funds are paid FROM the platform vault, not the creator's wallet.
  let vault: { walletId: string; address: string } | null = null;
  if (isCircleConfigured()) {
    try {
      vault = await ensureVault();
    } catch {
      vault = null;
    }
  }
  const currency = circle.currency;
  const positionLabel = recipient.payout_position;

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "payout",
    amount,
    currency,
    circleId: circle.id,
    destination: recipient.payout_address,
    note: `Payout to ${shortenHex(recipient.payout_address)} (position ${positionLabel}) from "${circle.name}"`,
  });

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  if (isCircleConfigured() && vault?.walletId) {
    try {
      const res = await sendUsdc({
        fromWalletId: vault.walletId,
        toAddress: recipient.payout_address,
        amount,
        idempotencyKey: ledger.id,
        refId: `payout:${circle.id}`,
      });
      await settleLedgerEntry(supabase, ledger.id, {
        status: "pending",
        circleTxId: res.circleTxId,
        txHash: res.txHash,
      });
      transfer = { state: res.state, txHash: res.txHash };

      // Mark this member paid only once the send is accepted by Circle. A send
      // that throws leaves paid_out=false so the same member is retried.
      await supabase
        .from("circle_members")
        .update({
          paid_out: true,
          paid_at: new Date().toISOString(),
          payout_tx_hash: res.txHash,
        })
        .eq("circle_id", circle.id)
        .eq("user_id", recipient.user_id);

      if (remainingAfter === 0 && circle.status !== "completed") {
        await supabase
          .from("circles")
          .update({ status: "completed" })
          .eq("id", circle.id);
      } else if (circle.status === "forming") {
        // First payout activates the circle.
        await supabase
          .from("circles")
          .update({ status: "active" })
          .eq("id", circle.id);
      }
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

  return NextResponse.json({
    ledgerId: ledger.id,
    amount,
    currency,
    recipient: {
      address: recipient.payout_address,
      position: positionLabel,
    },
    transfer,
    pending,
    remaining: pending ? queue.length : remainingAfter,
    completed: !pending && remainingAfter === 0,
    onChain: isCircleConfigured() && Boolean(vault?.walletId),
  });
}
