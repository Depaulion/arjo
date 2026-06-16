import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { telegramBotUsername } from "@/lib/telegram";

export const runtime = "nodejs";

/**
 * Telegram account linking, user-facing.
 *
 *   POST   → mint a one-time code (RPC generate_telegram_link_code) and return a
 *            t.me/<bot>?start=<code> deep link the user taps to connect.
 *   DELETE → disconnect (RPC unlink_telegram).
 *
 * Both RPCs are auth.uid()-scoped, so a user can only ever link/unlink their own
 * account. The bot username comes from NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const bot = telegramBotUsername();
  if (!bot) {
    return NextResponse.json(
      { error: "Telegram isn't configured yet." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc("generate_telegram_link_code");
  if (error || typeof data !== "string") {
    return NextResponse.json(
      { error: error?.message ?? "Could not start linking." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    code: data,
    deepLink: `https://t.me/${bot}?start=${data}`,
    // Manual fallback: if the user already started the bot, Telegram won't show
    // the START button, so the deep link can't auto-send /start <code>. Sending
    // this command by hand always works.
    startCommand: `/start ${data}`,
  });
}

/** Linked-status poll: lets the Connect UI flip to "Connected" automatically
 *  once the user sends /start to the bot, without a manual refresh. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", user.id)
    .maybeSingle<{ telegram_chat_id: string | null }>();

  return NextResponse.json({ linked: Boolean(data?.telegram_chat_id) });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase.rpc("unlink_telegram");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
