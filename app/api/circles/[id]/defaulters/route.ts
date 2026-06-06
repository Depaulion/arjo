import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ArcStablecoin } from "@/lib/arc";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { getUserWallet } from "@/lib/savings-actions";
import { shortenHex } from "@/lib/arc";
import type { Circle } from "@/lib/types";

export const runtime = "nodejs";

type Action = "grace" | "clear" | "slash" | "return-bond";

type MemberRow = {
  user_id: string;
  role: "creator" | "member";
  payout_address: string | null;
  bond_amount: number;
  bond_status: "held" | "returned" | "slashed";
  default_status: "none" | "grace" | "defaulted";
};

/**
 * Creator-driven defaulter resolution for a circle. One endpoint, four actions:
 *
 *   grace        — flag a missed contribution; opens/extends the grace window.
 *   clear        — member caught up; return them to good standing.
 *   slash        — forfeit the member's bond to the pot + apply the reputation
 *                  consequences (lockout, flag, high risk). Money moves
 *                  vault → pot; consequences are committed regardless.
 *   return-bond  — refund a held bond from the vault to the member (good
 *                  standing). Money moves vault → member; only marked returned
 *                  once the send is accepted (mirrors settle-exit).
 *
 * State lives in SECURITY DEFINER functions (migration 0015); a DB function
 * can't move USDC, so this route orchestrates the transfer ledger-first and
 * then commits state — exactly the pattern circle-exit settlement uses.
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

  const action = (typeof body.action === "string" ? body.action : "") as Action;
  const targetUserId = typeof body.userId === "string" ? body.userId : "";
  const graceDays =
    typeof body.graceDays === "number" && body.graceDays > 0
      ? Math.floor(body.graceDays)
      : 7;

  if (!["grace", "clear", "slash", "return-bond"].includes(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (!targetUserId) {
    return NextResponse.json(
      { error: "Which member should this apply to?" },
      { status: 400 }
    );
  }

  // Only the circle creator controls the pot and resolution.
  const { data: circle } = await supabase
    .from("circles")
    .select("*")
    .eq("id", params.id)
    .single<Circle>();
  if (!circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }
  if (circle.created_by !== user.id) {
    return NextResponse.json(
      { error: "Only the circle creator can manage defaulters." },
      { status: 403 }
    );
  }
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "You can't apply this to yourself." },
      { status: 400 }
    );
  }

  const { data: member } = await supabase
    .from("circle_members")
    .select(
      "user_id, role, payout_address, bond_amount, bond_status, default_status"
    )
    .eq("circle_id", circle.id)
    .eq("user_id", targetUserId)
    .maybeSingle<MemberRow>();
  if (!member) {
    return NextResponse.json(
      { error: "That member isn't in this circle." },
      { status: 404 }
    );
  }
  if (member.role === "creator") {
    return NextResponse.json(
      { error: "The circle creator can't be a defaulter target." },
      { status: 400 }
    );
  }

  const currency = circle.currency as ArcStablecoin;

  // --- No-money actions: pure state via SECURITY DEFINER functions ----------
  if (action === "grace") {
    const { data, error } = await supabase.rpc("flag_missed_contribution", {
      p_circle_id: circle.id,
      p_user_id: targetUserId,
      p_grace_days: graceDays,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, graceEndsAt: data });
  }

  if (action === "clear") {
    const { error } = await supabase.rpc("clear_default", {
      p_circle_id: circle.id,
      p_user_id: targetUserId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  // --- Money actions: ledger-first transfer, then commit state --------------
  const bond = Math.max(0, Number(member.bond_amount) || 0);
  const slashable = member.bond_status === "held" ? bond : 0;

  if (action === "return-bond") {
    if (member.bond_status !== "held" || bond <= 0) {
      return NextResponse.json(
        { error: "There's no held bond to return for this member." },
        { status: 409 }
      );
    }
    if (member.default_status === "defaulted") {
      return NextResponse.json(
        { error: "A defaulted member's bond was slashed; nothing to return." },
        { status: 409 }
      );
    }
    if (!member.payout_address) {
      return NextResponse.json(
        {
          error:
            "This member hasn't linked an Arc wallet, so the bond can't be refunded yet.",
        },
        { status: 409 }
      );
    }
    if (!isCircleConfigured()) {
      return NextResponse.json(
        { error: "On-chain transfers aren't available right now." },
        { status: 503 }
      );
    }

    let vault;
    try {
      vault = await ensureVault();
    } catch {
      return NextResponse.json(
        { error: "The bond vault isn't available right now." },
        { status: 503 }
      );
    }

    const ledger = await recordLedgerEntry(supabase, {
      userId: targetUserId,
      kind: "bond_refund",
      amount: bond,
      currency,
      circleId: circle.id,
      destination: member.payout_address,
      note: `Bond refund to ${shortenHex(member.payout_address)} from "${circle.name}"`,
    });

    try {
      const res = await sendUsdc({
        fromWalletId: vault.walletId,
        toAddress: member.payout_address,
        amount: bond,
        idempotencyKey: ledger.id,
        refId: `bond-refund:${circle.id}`,
      });
      await settleLedgerEntry(supabase, ledger.id, {
        status: "pending",
        circleTxId: res.circleTxId,
        txHash: res.txHash,
      });
    } catch (err) {
      // Send failed: keep the row pending and the bond 'held' so it can retry.
      await settleLedgerEntry(supabase, ledger.id, {
        status: "pending",
        note:
          err instanceof Error
            ? `Bond refund not sent: ${err.message}`
            : "Bond refund not sent.",
      });
      return NextResponse.json(
        {
          ok: false,
          pending: true,
          amount: bond,
          currency,
          ledgerId: ledger.id,
          error:
            "The bond refund couldn't be sent on-chain. The bond stays held so you can retry.",
        },
        { status: 502 }
      );
    }

    // Send accepted — mark the bond returned.
    const { error: returnError } = await supabase.rpc("return_bond", {
      p_circle_id: circle.id,
      p_user_id: targetUserId,
    });
    return NextResponse.json({
      ok: !returnError,
      amount: bond,
      currency,
      destination: member.payout_address,
      ledgerId: ledger.id,
      onChain: true,
      stateError: returnError ? returnError.message : undefined,
    });
  }

  // action === "slash"
  if (member.default_status === "defaulted") {
    return NextResponse.json(
      { error: "This member has already been slashed." },
      { status: 409 }
    );
  }

  // Forfeit the held bond to the pot (creator wallet). Best-effort: a failed
  // vault transfer leaves a pending ledger row to reconcile, but the default
  // consequences below ALWAYS apply — defaulting is the member's own action.
  let transfer: { txHash: string | null } | null = null;
  let transferPending = false;

  if (slashable > 0 && isCircleConfigured()) {
    const pot = await getUserWallet(supabase, user.id); // pot = creator wallet
    let vault;
    try {
      vault = await ensureVault();
    } catch {
      vault = null;
    }

    if (vault && pot.address) {
      const ledger = await recordLedgerEntry(supabase, {
        userId: targetUserId,
        kind: "bond_slash",
        amount: slashable,
        currency,
        circleId: circle.id,
        destination: pot.address,
        note: `Bond slashed to pot from "${circle.name}" (missed contribution)`,
      });
      try {
        const res = await sendUsdc({
          fromWalletId: vault.walletId,
          toAddress: pot.address,
          amount: slashable,
          idempotencyKey: ledger.id,
          refId: `bond-slash:${circle.id}`,
        });
        await settleLedgerEntry(supabase, ledger.id, {
          status: "pending",
          circleTxId: res.circleTxId,
          txHash: res.txHash,
        });
        transfer = { txHash: res.txHash };
      } catch (err) {
        transferPending = true;
        await settleLedgerEntry(supabase, ledger.id, {
          status: "pending",
          note:
            err instanceof Error
              ? `Bond slash not forwarded: ${err.message}`
              : "Bond slash not forwarded.",
        });
      }
    } else {
      transferPending = slashable > 0;
    }
  }

  // Commit the slash + reputation consequences (always — see above).
  const { data: slashed, error: slashError } = await supabase.rpc(
    "apply_bond_slash",
    { p_circle_id: circle.id, p_user_id: targetUserId }
  );
  if (slashError) {
    return NextResponse.json({ error: slashError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    slashed: Math.max(0, Number(slashed) || 0),
    currency,
    transfer,
    transferPending,
    onChain: isCircleConfigured() && slashable > 0 && !transferPending,
  });
}
