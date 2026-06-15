import "server-only";

/**
 * Telegram Bot API — the thin server-side sender for Arjo notifications.
 *
 * The bot token is a secret (set TELEGRAM_BOT_TOKEN in the env, never in git),
 * so all of this is server-only. Sends are best-effort: a Telegram failure must
 * never break the flow that triggered it (the in-app notification is always the
 * source of truth; Telegram is a bonus channel).
 */

const API_BASE = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/** The bot username (without @), used to build t.me deep links in the UI. */
export function telegramBotUsername(): string | null {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? null;
}

/**
 * Send a plain-text message to a chat. Returns true on success, false on any
 * failure (network, bad token, user blocked the bot, …) — callers treat a false
 * as "Telegram not delivered" and carry on; they never throw on it.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // Disable link previews so contribution reminders stay compact.
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
