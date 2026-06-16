"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Connect / disconnect Telegram notifications.
 *
 * Connecting mints a one-time code (POST /api/telegram/link). We open the bot
 * deep link AND show the copyable "/start <code>" command — the command is the
 * reliable path, because Telegram only auto-sends the deep-link code on a user's
 * FIRST contact with the bot; returning users must send it themselves. Once
 * opened, we poll the link-status endpoint so the UI flips to "Connected" on its
 * own the moment the bot links the chat — no manual refresh.
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
  const [startCommand, setStartCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for linked status while waiting for the user to send /start to the bot.
  useEffect(() => {
    if (!opened || linked) return;
    let stopped = false;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/telegram/link", { method: "GET" });
        const json = await res.json().catch(() => ({}));
        if (!stopped && json.linked) {
          setLinked(true);
          setOpened(false);
          router.refresh();
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [opened, linked, router]);

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
    setStartCommand(json.startCommand ?? null);
    setOpened(true);
  }

  async function copyStart() {
    if (!startCommand) return;
    try {
      await navigator.clipboard.writeText(startCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the command is still shown for manual copy */
    }
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
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
                  ? "Almost there — send the command below to @Arjoobot. This page updates automatically once you do."
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
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting…
          </span>
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

      {/* Primary step: send this command to @Arjoobot. The deep link we opened
          only auto-sends it on a first-ever chat with the bot, so the copyable
          command is the path that always works. */}
      {!linked && opened && startCommand && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Send this message to{" "}
            <span className="font-medium text-foreground">@Arjoobot</span> (we
            opened it for you — tap <span className="font-medium">START</span> if
            you see it, otherwise paste this):
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-secondary px-2 py-1.5 font-mono text-xs">
              {startCommand}
            </code>
            <Button size="sm" variant="outline" onClick={copyStart}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
