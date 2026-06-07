import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/savings-actions";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { recordLedgerEntry } from "@/lib/ledger";
import {
  quoteOffRamp,
  formatFiat,
  type FiatCurrency,
} from "@/lib/ramp";

export const runtime = "nodejs";

const FIAT_CODES: FiatCurrency[] = ["USD", "NGN", "GHS", "KES"];

/**
 * Off-ramp request (Problem 4): the user asks to cash USDC out to their bank or
 * mobile-money account. On Arc Testnet there is no live fiat rail, and moving
 * real money is never auto-executed here — so this records a PENDING settlement
 * request (reusing the ledger 'withdraw' kind, since it withdraws value) that a
 * payout provider would fulfil. No USDC is moved on-chain and no funds are sent;
 * the on-chain balance check only confirms the user could cover the request.
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

  const amount = Number(body.usdcAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero." },
      { status: 400 }
    );
  }

  const currency =
    typeof body.currency === "string" &&
    FIAT_CODES.includes(body.currency as FiatCurrency)
      ? (body.currency as FiatCurrency)
      : null;
  if (!currency) {
    return NextResponse.json(
      { error: "Choose a payout currency." },
      { status: 400 }
    );
  }

  const destination =
    typeof body.destination === "string" ? body.destination.trim() : "";
  if (destination.length < 4) {
    return NextResponse.json(
      { error: "Enter the bank or mobile-money account to receive the payout." },
      { status: 400 }
    );
  }

  const quote = quoteOffRamp(amount, currency);
  if (!quote) {
    return NextResponse.json({ error: "Couldn't price that amount." }, { status: 400 });
  }

  const wallet = await getUserWallet(supabase, user.id);
  if (!wallet.address) {
    return NextResponse.json(
      { error: "Your wallet isn't ready yet. Try again in a moment." },
      { status: 409 }
    );
  }

  // Confirm they could cover it — the on-chain balance stays authoritative. We
  // deliberately do NOT send the USDC; a settlement provider takes custody when
  // fulfilling the request, which is out of scope for the testnet build.
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
      { error: `You can cash out at most ${balance} ${wallet.currency}.`, balance },
      { status: 400 }
    );
  }

  const ledger = await recordLedgerEntry(supabase, {
    userId: user.id,
    kind: "withdraw",
    amount,
    currency: wallet.currency,
    destination,
    note: `Off-ramp to ${currency} (${destination}) — ${formatFiat(
      quote.fiatReceived,
      currency
    )} after fees. Pending provider settlement.`,
    status: "pending",
  });

  return NextResponse.json({
    ok: true,
    ledgerId: ledger.id,
    quote,
    destination,
    pending: true,
  });
}
