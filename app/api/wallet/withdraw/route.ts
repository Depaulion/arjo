import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { getUserWallet } from "@/lib/savings-actions";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { sendUsdc } from "@/lib/circle-transfer";
import { recordLedgerEntry, settleLedgerEntry } from "@/lib/ledger";
import { shortenHex } from "@/lib/arc";

export const runtime = "nodejs";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Cash-out: send USDC from the user's own wallet to an external address.
 *
 * Unlike a SafeLock withdrawal (vault → wallet) or a circle payout (pot →
 * member), this moves the user's liquid balance off-platform. The wallet is
 * developer-controlled, so the backend signs the transfer — which makes the
 * confirmation UX and the onchain balance check the real safeguards here.
 *
 * Follows the ledger-first pattern: record the row, attempt the send, then
 * settle it pending. A failed send leaves the row pending for reconciliation;
 * the onchain balance stays authoritative.
 */
export async function POST(request: Request) {
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

  const toAddress =
    typeof body.toAddress === "string" ? body.toAddress.trim() : "";
  if (!ADDRESS_RE.test(toAddress)) {
    return NextResponse.json(
      { error: "Enter a valid Arc address (0x followed by 40 hex characters)." },
      { status: 400 }
    );
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero." },
      { status: 400 }
    );
  }

  const wallet = await getUserWallet(supabase, user.id);
  if (!wallet.walletId || !wallet.address) {
    return NextResponse.json(
      { error: "Your wallet isn't ready yet. Try again in a moment." },
      { status: 409 }
    );
  }

  if (!isCircleConfigured()) {
    return NextResponse.json(
      { error: "onchain transfers aren't available right now." },
      { status: 503 }
    );
  }

  // Guard against overdrawing — the onchain balance is the source of truth.
  let balance: number;
  try {
    balance = await getUsdcBalance(wallet.address);
  } catch {
    return NextResponse.json(
      { error: "Couldn't read your wallet balance. Try again shortly." },
      { status: 502 }
    );
  }
  if (amount > balance) {
    return NextResponse.json(
      {
        error: `You can withdraw at most ${balance} ${wallet.currency}.`,
        balance,
      },
      { status: 400 }
    );
  }

  // Don't let the user send to their own wallet (no-op that still costs fees).
  if (toAddress.toLowerCase() === wallet.address.toLowerCase()) {
    return NextResponse.json(
      { error: "That's your own wallet address — choose a different destination." },
      { status: 400 }
    );
  }

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "withdraw",
    amount,
    currency: wallet.currency,
    destination: toAddress,
    note: `Cash-out to ${shortenHex(toAddress)}`,
  });

  let transfer: { state: string | null; txHash: string | null } | null = null;
  let pending = false;

  try {
    const res = await sendUsdc({
      fromWalletId: wallet.walletId,
      toAddress,
      amount,
      idempotencyKey: ledger.id,
      refId: "cashout",
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
          ? `Withdrawal not sent: ${err.message}`
          : "Withdrawal not sent.",
    });
  }

  return NextResponse.json({
    ledgerId: ledger.id,
    amount,
    currency: wallet.currency,
    destination: toAddress,
    transfer,
    pending,
    onChain: true,
  });
}
