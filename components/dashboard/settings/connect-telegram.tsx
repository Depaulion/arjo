"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Connect / disconnect Telegram notifications. Connecting mints a one-time code
 * (POST /api/telegram/link) and opens the bot deep link — the user taps Start in
 * Telegram and the bot webhook links the chat. Disconnecting clears it (DELETE).
 */
export function ConnectTelegram({
  initialLinked,
}: {
  initialLinked: boolean;
}) {
  const router = useRouter();
  const [linked, setLinked] = useState(initialLinked);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function connect() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/telegram/link", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || !json.deepLink) {
      setError(json.error ?? "Couldn't start linking. Try again.");
      return;
    }
    // Open Telegram with the one-time start code; the webhook completes linking.
    window.open(json.deepLink, "_blank", "noopener,noreferrer");
    setOpened(true);
  }

  async function disconnect() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/telegram/link", { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Couldn't disconnect. Try again.");
      return;
    }
    setLinked(false);
    setOpened(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
          <Send className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Telegram reminders</p>
          <p className="text-xs text-muted-foreground">
            {linked
              ? "Connected — you'll get contribution reminders, auto-debit receipts and payout alerts on Telegram."
              : opened
                ? "Tap Start in the Telegram chat that just opened to finish connecting, then refresh."
                : "Get your circle reminders and payout alerts as Telegram messages."}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      {linked ? (
        <Button
          size="sm"
          variant="outline"
          onClick={disconnect}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Disconnect
        </Button>
      ) : opened ? (
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          <Check className="h-4 w-4" />
          I&apos;ve connected
        </Button>
      ) : (
        <Button size="sm" onClick={connect} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Connect
        </Button>
      )}
    </div>
  );
}
