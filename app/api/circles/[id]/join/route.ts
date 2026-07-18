import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ArcStablecoin } from "@/lib/arc";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { getUserWallet } from "@/lib/savings-actions";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { isUsycEnabled, mintUsycFromUsdc } from "@/lib/usyc";
import {
  assessRisk,
  circleAccess,
  computeReputationScore,
  consistencyRate,
} from "@/lib/risk-engine";

export const runtime = "nodejs";

const round2 = (n: number) => Math.round(n * 100) / 100;

type CircleRow = {
  id: string;
  currency: string;
  status: string;
  is_public: boolean;
  member_count: number;
  contribution_amount: number;
  required_bond: number;
};

type ProfileSignals = {
  default_count: number;
  is_flagged: boolean;
  circle_lockout_until: string | null;
  missed_payments: number;
  withdrawal_attempts: number;
};

/**
 * Join a circle. Replaces the old raw client insert: enforces the reputation /
 * risk gates (lib/risk-engine.ts), posts the member's refundable bond into the
 * vault (ledger-first, onchain best-effort), and only then records membership
 * with the bond marked "held".
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

  // An invite code (for a private circle) may come in the body.
  let inviteCode: string | null = null;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.inviteCode === "string") inviteCode = body.inviteCode;
  } catch {
    /* no body — public-circle join */
  }

  // Load the circle (RLS: readable when public or already a member).
  let circle = (
    await supabase
      .from("circles")
      .select(
        "id, currency, status, is_public, member_count, contribution_amount, required_bond"
      )
      .eq("id", params.id)
      .maybeSingle<CircleRow>()
  ).data;

  // Private circle the invitee can't read via RLS: resolve it by invite code.
  // The code must match this exact circle, so it can't be used to join another.
  if (!circle && inviteCode) {
    const { data: inv } = await supabase.rpc("circle_by_invite", {
      p_code: inviteCode,
    });
    const row = Array.isArray(inv) ? (inv[0] as Record<string, unknown>) : null;
    if (row && row.id === params.id) {
      circle = {
        id: row.id as string,
        currency: row.currency as string,
        status: row.status as string,
        is_public: row.is_public as boolean,
        member_count: row.member_count as number,
        contribution_amount: row.contribution_amount as number,
        required_bond: row.required_bond as number,
      };
    }
  }

  if (!circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }
  if (circle.status === "completed") {
    return NextResponse.json(
      { error: "This circle has already completed." },
      { status: 409 }
    );
  }

  // Already a member? (PK is (circle_id, user_id), so this is exact.)
  const { data: existing } = await supabase
    .from("circle_members")
    .select("user_id")
    .eq("circle_id", circle.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You're already a member of this circle." },
      { status: 409 }
    );
  }

  // Pull the member's persisted safety signals + a cheap activity estimate.
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "default_count, is_flagged, circle_lockout_until, missed_payments, withdrawal_attempts"
    )
    .eq("id", user.id)
    .single<ProfileSignals>();

  const signals: ProfileSignals = profile ?? {
    default_count: 0,
    is_flagged: false,
    circle_lockout_until: null,
    missed_payments: 0,
    withdrawal_attempts: 0,
  };

  const { count: activeCircles } = await supabase
    .from("circle_members")
    .select("circle_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Score conservatively: omit positive onchain signals (streak/contributions)
  // so the gate can only be stricter, never looser, than the dashboard score.
  const score = computeReputationScore({
    streakWeeks: 0,
    contributionCount: 0,
    activeCircles: activeCircles ?? 0,
    defaultCount: signals.default_count,
    isFlagged: signals.is_flagged,
  });
  const consistency = consistencyRate(0, signals.missed_payments);
  const { tier } = assessRisk({
    defaultCount: signals.default_count,
    consistencyRate: consistency,
    missedPayments: signals.missed_payments,
    reputationScore: score,
    withdrawalAttempts: signals.withdrawal_attempts,
  });
  const access = circleAccess({
    score,
    tier,
    defaultCount: signals.default_count,
    lockoutUntil: signals.circle_lockout_until,
  });

  if (!access.canJoin) {
    return NextResponse.json(
      { error: access.reason, gated: true },
      { status: 403 }
    );
  }
  if (access.maxMembers !== null && circle.member_count >= access.maxMembers) {
    return NextResponse.json(
      {
        error: `Your access level allows circles up to ${access.maxMembers} members. ${access.reason}`,
        gated: true,
      },
      { status: 403 }
    );
  }
  if (
    access.maxContribution !== null &&
    circle.contribution_amount > access.maxContribution
  ) {
    return NextResponse.json(
      {
        error: `Your access level caps per-round contributions at ${access.maxContribution} ${circle.currency}. ${access.reason}`,
        gated: true,
      },
      { status: 403 }
    );
  }

  // Bond required = circle's base bond × risk surcharge (1× / 2× / 3×).
  const bond = round2(circle.required_bond * access.bondMultiplier);

  const wallet = await getUserWallet(supabase, user.id);
  let vaultAddress: string | null = null;
  if (isCircleConfigured()) {
    try {
      vaultAddress = (await ensureVault()).address;
    } catch {
      vaultAddress = null;
    }
  }

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  // Post the bond into the vault before recording membership.
  if (bond > 0) {
    const ledger = await recordLedgerEntry(supabase, {
      userId: user.id,
      kind: "bond",
      amount: bond,
      currency: circle.currency as ArcStablecoin,
      circleId: circle.id,
      destination: vaultAddress,
      note: `Bond for joining circle${
        access.bondMultiplier > 1
          ? ` (${access.bondMultiplier}× risk surcharge)`
          : ""
      }`,
    });

    if (isCircleConfigured() && wallet.walletId && vaultAddress) {
      try {
        const res = await sendUsdc({
          fromWalletId: wallet.walletId,
          toAddress: vaultAddress,
          amount: bond,
          idempotencyKey: ledger.id,
          refId: `bond:${circle.id}`,
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
              ? `Bond transfer not sent: ${err.message}`
              : "Bond transfer not sent.",
        });
      }
    } else {
      pending = true;
    }

    // Live USYC: keep the held bond productive by sweeping the vault's already-
    // settled idle USDC into USYC (the bond just sent is still pending, so a
    // later sweep picks it up once confirmed). Best-effort: a yield-sweep
    // failure must never block the member from joining.
    if (isUsycEnabled() && vaultAddress) {
      try {
        const idle = await getUsdcBalance(vaultAddress);
        const vaultWalletId = process.env.ARC_VAULT_WALLET_ID;
        if (idle > 0 && vaultWalletId) {
          await mintUsycFromUsdc({
            walletId: vaultWalletId,
            usdcAmount: idle,
            refId: `bond-sweep:${circle.id}`,
          });
        }
      } catch (sweepErr) {
        console.warn(
          `[usyc] bond idle-USDC sweep failed: ${
            sweepErr instanceof Error ? sweepErr.message : "unknown error"
          }`
        );
      }
    }
  }

  // Record membership with the bond held. A held bond is yield-bearing
  // (migration 0018): `bond_started_at` is when its principal begins accruing
  // USYC APY, computed on-read by lib/bond.ts. Only set it when a bond exists.
  const { error: joinError } = await supabase.from("circle_members").insert({
    circle_id: circle.id,
    user_id: user.id,
    role: "member",
    bond_amount: bond,
    bond_status: "held",
    bond_started_at: bond > 0 ? new Date().toISOString() : null,
  });

  if (joinError) {
    return NextResponse.json(
      {
        error: joinError.message,
        // The bond ledger entry stays pending for reconciliation if the join
        // itself failed after a transfer was attempted.
        bondPending: bond > 0,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    joined: true,
    bond,
    bondMultiplier: access.bondMultiplier,
    currency: circle.currency,
    transfer,
    pending,
    onChain: isCircleConfigured() && Boolean(wallet.walletId && vaultAddress),
  });
}
