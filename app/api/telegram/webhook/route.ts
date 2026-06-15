import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Any other message — gentle hint.
  await sendTelegramMessage(
    chatIdStr,
    "I send Arjo savings reminders. Connect your account from Arjo → Settings → Connect Telegram."
  );
  return NextResponse.json({ ok: true });
}
