import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sendTelegramMessage, type TelegramButton } from "@/lib/telegram";
import { getUsdcBalance } from "@/lib/arc-onchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** App base URL for deep links back into the logged-in app. */
function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://arc-ajo.vercel.app"
  );
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

/**
 * Telegram bot webhook. Telegram POSTs updates here. We authenticate the request
 * by the secret token Telegram echoes in the `X-Telegram-Bot-Api-Secret-Token`
 * header (set when registering the webhook), matched against TELEGRAM_WEBHOOK_
 * SECRET. The same secret gates the DB-side link RPC, so an unauthenticated
 * caller can neither be accepted here nor link anyone.
 *
 * Only one interaction matters for v1: `/start <code>` links the chat to the
 * Arjo account that minted <code> in-app. Anything else gets a short hint.
 */
type TgUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
};

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || secret.length < 16) {
    // Misconfigured — accept (200) so Telegram doesn't spam retries, but do
    // nothing. We never want the webhook URL to leak whether it's live.
    return NextResponse.json({ ok: true });
  }
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (header !== secret) {
    return NextResponse.json({ ok: true });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").trim();
  if (chatId === undefined || chatId === null) {
    return NextResponse.json({ ok: true });
  }
  const chatIdStr = String(chatId);

  // /start <code> — link this chat to the account that minted <code>.
  const startMatch = text.match(/^\/start(?:\s+(\S+))?/i);
  if (startMatch) {
    const code = startMatch[1];
    if (!code) {
      await sendTelegramMessage(
        chatIdStr,
        "👋 Welcome to Arjo. To connect this chat to your account, open Arjo → Settings → Connect Telegram, and tap the link there."
      );
      return NextResponse.json({ ok: true });
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("link_telegram_by_code", {
      p_secret: secret,
      p_code: code,
      p_chat_id: chatIdStr,
    });

    if (!error && typeof data === "string" && data.length > 0) {
      await sendTelegramMessage(
        chatIdStr,
        `✅ Connected, ${data}! You'll now get Arjo reminders here — contribution due dates, auto-debit receipts, and payout alerts. Manage this anytime in Settings.`
      );
    } else {
      await sendTelegramMessage(
        chatIdStr,
        "That link has expired. Open Arjo → Settings → Connect Telegram for a fresh link."
      );
    }
    return NextResponse.json({ ok: true });
  }

  // --- Command router --------------------------------------------------------
  const site = siteUrl();
  const command = text.split(/\s+/)[0]?.toLowerCase() ?? "";
  const supabase = createClient();

  const openAppButton: TelegramButton[][] = [
    [{ text: "Open Arjo", url: `${site}/account` }],
  ];

  if (command === "/balance") {
    const { data } = await supabase.rpc("bot_user_summary", {
      p_secret: secret,
      p_chat_id: chatIdStr,
    });
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      await sendTelegramMessage(
        chatIdStr,
        "I couldn't find your account. Connect it from Arjo → Settings → Connect Telegram.",
        openAppButton
      );
      return NextResponse.json({ ok: true });
    }
    let walletLine = "";
    if (row.wallet_address) {
      try {
        const bal = await getUsdcBalance(row.wallet_address);
        walletLine = `💵 Wallet: ${fmt(bal)} USDC\n`;
      } catch {
        /* onchain read failed — omit the wallet line */
      }
    }
    await sendTelegramMessage(
      chatIdStr,
      `📊 Your Arjo summary\n\n${walletLine}🔒 Locked in vaults: ${fmt(
        Number(row.total_locked ?? 0)
      )} USDC (${row.active_plans ?? 0} plan${
        Number(row.active_plans) === 1 ? "" : "s"
      })\n👥 Circles: ${row.active_circles ?? 0}`,
      [
        [{ text: "💰 Save", url: `${site}/account#save` }],
        [{ text: "Open Arjo", url: `${site}/account` }],
      ]
    );
    return NextResponse.json({ ok: true });
  }

  if (command === "/circles" || command === "/mycircles") {
    const { data } = await supabase.rpc("bot_my_circles", {
      p_secret: secret,
      p_chat_id: chatIdStr,
    });
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      await sendTelegramMessage(
        chatIdStr,
        "You're not in any circles yet. Browse community circles with /discover.",
        [[{ text: "🔎 Discover circles", url: `${site}/account#community` }]]
      );
      return NextResponse.json({ ok: true });
    }
    const lines = rows.map((c: Record<string, unknown>) => {
      const round =
        c.current_round && c.total_rounds
          ? ` · round ${c.current_round}/${c.total_rounds}`
          : "";
      const due = c.round_due_at
        ? ` · due ${fmtDate(c.round_due_at as string)}`
        : "";
      return `• ${c.name} — ${fmt(Number(c.contribution_amount ?? 0))} ${
        c.currency ?? "USDC"
      }${round}${due}`;
    });
    const buttons: TelegramButton[][] = rows
      .slice(0, 6)
      .map((c: Record<string, unknown>) => [
        { text: `Open ${c.name}`, url: `${site}/circles/${c.circle_id}` },
      ]);
    await sendTelegramMessage(
      chatIdStr,
      `👥 Your circles\n\n${lines.join("\n")}`,
      buttons
    );
    return NextResponse.json({ ok: true });
  }

  if (command === "/discover" || command === "/community") {
    const { data } = await supabase.rpc("bot_discover_circles", {
      p_secret: secret,
      p_chat_id: chatIdStr,
    });
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      await sendTelegramMessage(
        chatIdStr,
        "No open community circles to join right now. Check back soon, or start your own.",
        [[{ text: "➕ Start a circle", url: `${site}/circles/new` }]]
      );
      return NextResponse.json({ ok: true });
    }
    const lines = rows.map((c: Record<string, unknown>) => {
      const bond =
        Number(c.required_bond ?? 0) > 0
          ? ` · bond ${fmt(Number(c.required_bond))}`
          : "";
      return `• ${c.name} — ${fmt(Number(c.contribution_amount ?? 0))} ${
        c.currency ?? "USDC"
      } ${c.frequency ?? ""}${bond}`;
    });
    const buttons: TelegramButton[][] = rows
      .slice(0, 6)
      .map((c: Record<string, unknown>) => [
        { text: `Join ${c.name}`, url: `${site}/circles/${c.circle_id}` },
      ]);
    await sendTelegramMessage(
      chatIdStr,
      `🔎 Community circles you can join\n\n${lines.join(
        "\n"
      )}\n\nTap one to review and join in the app.`,
      buttons
    );
    return NextResponse.json({ ok: true });
  }

  if (command === "/save") {
    await sendTelegramMessage(
      chatIdStr,
      "💰 Open your Save tab to lock funds into a SafeLock (up to 8% APY, Treasury-backed) or stash into a flexible vault.",
      [[{ text: "💰 Save in Arjo", url: `${site}/account#save` }]]
    );
    return NextResponse.json({ ok: true });
  }

  // /help, /menu, or anything else — show what the bot can do.
  await sendTelegramMessage(
    chatIdStr,
    "🤖 Arjo bot — here's what I can do:\n\n/balance — your wallet, savings & circles\n/circles — your circles and what's due\n/discover — community circles to join\n/save — open your Save tab\n\nI'll also DM you contribution reminders, auto-debit receipts and payout alerts. Money moves always happen in the app, where you confirm them securely.",
    openAppButton
  );
  return NextResponse.json({ ok: true });
}
