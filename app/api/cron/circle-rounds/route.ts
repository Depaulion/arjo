import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { ensureVault } from "@/lib/vault";
import { sendUsdc } from "@/lib/circle-transfer";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Platform-wide circle round driver (Stage 3 — auto-debit).
 *
 * Designed to be hit by Vercel Cron on a schedule. Two passes:
 *
 *   1. UPCOMING — for members whose round is due within ~24h, send a one-time
 *      "auto-debit upcoming" heads-up so a pull is never a surprise.
 *   2. DUE — for members whose round is due now, pull the round's contribution
 *      from their OWN Circle wallet's USDC into the shared platform vault (the
 *      pot). A balance shortfall never silently defaults a member: we notify
 *      "auto-debit couldn't run" and leave the round unpaid, so the existing
 *      circle_missed_members / creator defaulter flow can pick it up.
 *
 * There is NO Supabase service-role key, so the cron carries no user session and
 * can't satisfy owner-scoped RLS. All cross-user reads/writes go through the
 * SECURITY DEFINER RPCs from migration 0021, each gated by the CRON secret
 * (verify_cron_secret), so an anon caller can't invoke them. The route also
 * checks the secret up front (Vercel Cron sends it as a Bearer token).
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const alt = request.headers.get("x-cron-secret") ?? "";
  return bearer === secret || alt === secret;
}

type DueRow = {
  circle_id: string;
  circle_name: string;
  round_number: number;
  user_id: string;
  wallet_id: string | null;
  wallet_address: string | null;
  amount: number | string | null;
  currency: string | null;
};

type UpcomingRow = {
  circle_id: string;
  circle_name: string;
  round_number: number;
  user_id: string;
  amount: number | string | null;
  currency: string | null;
  round_due_at: string | null;
};

type ChatIdRow = { user_id: string; chat_id: string | null };

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const secret = process.env.CRON_SECRET as string;
  const supabase = createClient();

  const summary = {
    upcomingNotified: 0,
    remindersNotified: 0,
    debited: 0,
    insufficient: 0,
    noWallet: 0,
    sendFailed: 0,
    skipped: 0,
    telegramSent: 0,
    onChain: false as boolean,
  };

  // Pull the three notification sources up front so we can resolve every
  // member's Telegram chat in a single round-trip before processing.
  const [upRes, remRes, dueRes] = await Promise.all([
    supabase.rpc("upcoming_auto_debits", { p_secret: secret }),
    supabase.rpc("due_round_reminders", { p_secret: secret }),
    supabase.rpc("due_auto_debits", { p_secret: secret }),
  ]);

  const upcoming = (
    !upRes.error && Array.isArray(upRes.data) ? upRes.data : []
  ) as UpcomingRow[];
  const reminders = (
    !remRes.error && Array.isArray(remRes.data) ? remRes.data : []
  ) as UpcomingRow[];
  if (dueRes.error) {
    return NextResponse.json(
      { error: dueRes.error.message, summary },
      { status: 500 }
    );
  }
  const due = (Array.isArray(dueRes.data) ? dueRes.data : []) as DueRow[];

  // Map user_id → linked Telegram chat for everyone involved this run.
  const chatById = new Map<string, string>();
  if (isTelegramConfigured()) {
    const ids = Array.from(
      new Set([
        ...upcoming.map((u) => u.user_id),
        ...reminders.map((r) => r.user_id),
        ...due.map((d) => d.user_id),
      ])
    );
    if (ids.length > 0) {
      const { data: chats } = await supabase.rpc("telegram_chat_ids", {
        p_secret: secret,
        p_user_ids: ids,
      });
      for (const c of (chats ?? []) as ChatIdRow[]) {
        if (c.chat_id) chatById.set(c.user_id, c.chat_id);
      }
    }
  }

  // Create an in-app notification and mirror it to Telegram when the member is
  // linked. Returns the RPC error (if any) so callers can count successes.
  const notify = async (
    userId: string,
    circleId: string,
    type: string,
    message: string
  ) => {
    const { error } = await supabase.rpc("notify_from_cron", {
      p_secret: secret,
      p_user_id: userId,
      p_circle_id: circleId,
      p_type: type,
      p_message: message,
    });
    const chat = chatById.get(userId);
    if (chat && (await sendTelegramMessage(chat, message))) {
      summary.telegramSent += 1;
    }
    return error;
  };

  // --- Pass 1: upcoming auto-debit heads-up ----------------------------------
  for (const u of upcoming) {
    const amt = round2(num(u.amount));
    const cur = u.currency ?? "USDC";
    const dueLabel = u.round_due_at
      ? new Date(u.round_due_at).toLocaleDateString()
      : "soon";
    const msg = `Your ${amt} ${cur} contribution to "${u.circle_name}" will be auto-debited around ${dueLabel} (round ${u.round_number}). Keep enough USDC in your wallet.`;
    if (!(await notify(u.user_id, u.circle_id, "auto_debit_upcoming", msg))) {
      summary.upcomingNotified += 1;
    }
  }

  // --- Pass 1b: round-due reminders (members NOT on auto-debit) --------------
  for (const r of reminders) {
    const amt = round2(num(r.amount));
    const cur = r.currency ?? "USDC";
    const dueLabel = r.round_due_at
      ? new Date(r.round_due_at).toLocaleDateString()
      : "soon";
    const msg = `Reminder: your ${amt} ${cur} contribution to "${r.circle_name}" (round ${r.round_number}) is due ${dueLabel}. Open Arjo to contribute and keep your circle on track.`;
    if (!(await notify(r.user_id, r.circle_id, "round_reminder", msg))) {
      summary.remindersNotified += 1;
    }
  }

  // --- Pass 2: due debits -----------------------------------------------------
  // Resolve the pot = the shared platform vault. Funds are pulled INTO it.
  let potAddress: string | null = null;
  const configured = isCircleConfigured();
  if (configured) {
    try {
      potAddress = (await ensureVault()).address;
    } catch {
      potAddress = null;
    }
  }
  summary.onChain = configured && Boolean(potAddress);

  for (const d of (due ?? []) as DueRow[]) {
    const amount = round2(num(d.amount));
    const currency = d.currency ?? "USDC";
    const round = d.round_number;

    const notifyDue = (type: string, message: string) =>
      notify(d.user_id, d.circle_id, type, message);

    const record = (status: string, txHash: string | null) =>
      supabase.rpc("record_auto_debit", {
        p_secret: secret,
        p_circle_id: d.circle_id,
        p_user_id: d.user_id,
        p_amount: amount,
        p_currency: currency,
        p_round: round,
        p_destination: potAddress,
        p_status: status,
        p_tx_hash: txHash,
        p_note: `Auto-debit contribution to "${d.circle_name}" (round ${round})`,
      });

    if (amount <= 0) {
      summary.skipped += 1;
      continue;
    }

    // Simulated mode (no Circle config / no vault / member has no wallet id):
    // record a pending contribution so the round is marked paid — mirrors the
    // user-initiated contribute route's behaviour when onchain is unavailable.
    if (!summary.onChain || !d.wallet_id || !d.wallet_address) {
      if (!d.wallet_address || !d.wallet_id) {
        // Member opted in but never linked a wallet — can't pull. Notify, skip.
        await notifyDue(
          "auto_debit_failed",
          `Auto-debit for "${d.circle_name}" couldn't run — link an Arc wallet to enable automatic contributions.`
        );
        summary.noWallet += 1;
        continue;
      }
      await record("pending", null);
      await notifyDue(
        "auto_debit_paid",
        `Recorded your ${amount} ${currency} contribution to "${d.circle_name}" (round ${round}). It will settle onchain once payments are live.`
      );
      summary.debited += 1;
      continue;
    }

    // onchain: verify the member holds enough before attempting the pull.
    let balance: number;
    try {
      balance = await getUsdcBalance(d.wallet_address);
    } catch {
      // Couldn't read balance this run — leave unpaid and retry next run.
      summary.skipped += 1;
      continue;
    }

    if (round2(balance) < amount) {
      await notifyDue(
        "auto_debit_failed",
        `Auto-debit for "${d.circle_name}" couldn't run — your wallet holds ${round2(balance)} ${currency}, below the ${amount} ${currency} due for round ${round}. Top up to stay in good standing.`
      );
      summary.insufficient += 1;
      continue;
    }

    // Pull the contribution from the member's wallet into the vault. A stable
    // idempotency key (per circle/round/member) makes a retry safe even if the
    // ledger write below fails after Circle accepted the transfer.
    try {
      const res = await sendUsdc({
        fromWalletId: d.wallet_id,
        toAddress: potAddress as string,
        amount,
        idempotencyKey: `autodebit:${d.circle_id}:${round}:${d.user_id}`,
        refId: `autodebit:${d.circle_id}`,
      });
      await record("pending", res.txHash);
      await notifyDue(
        "auto_debit_paid",
        `We auto-debited ${amount} ${currency} from your wallet for "${d.circle_name}" (round ${round}).`
      );
      summary.debited += 1;
    } catch {
      // Send rejected — leave the round unpaid so it retries next run.
      await notifyDue(
        "auto_debit_failed",
        `Auto-debit for "${d.circle_name}" couldn't be sent onchain. We'll retry on the next run.`
      );
      summary.sendFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
