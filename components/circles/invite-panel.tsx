"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2, RefreshCw, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Creator-only invite panel for a circle (shown mainly for private circles,
 * which are otherwise un-joinable). Generates a shareable invite link, with
 * copy / share-to-Telegram / rotate / revoke. Posts to the invite API, which
 * goes through creator-gated RPCs (migration 0027).
 */
export function InvitePanel({
  circleId,
  initialLink,
}: {
  circleId: string;
  /** Existing invite link if the circle already has a code. */
  initialLink: string | null;
}) {
  const [link, setLink] = useState<string | null>(initialLink);
  const [loading, setLoading] = useState<"create" | "rotate" | "revoke" | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(regenerate: boolean) {
    setLoading(regenerate ? "rotate" : "create");
    setError(null);
    const res = await fetch(`/api/circles/${circleId}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerate }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok || !json.link) {
      setError(json.error ?? "Couldn't create the invite.");
      return;
    }
    setLink(json.link);
  }

  async function revoke() {
    setLoading("revoke");
    setError(null);
    const res = await fetch(`/api/circles/${circleId}/invite`, {
      method: "DELETE",
    });
    setLoading(null);
    if (!res.ok) {
      setError("Couldn't revoke the invite.");
      return;
    }
    setLink(null);
    setCopied(false);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — link is still shown for manual copy */
    }
  }

  const telegramShare = link
    ? `https://t.me/share/url?url=${encodeURIComponent(
        link
      )}&text=${encodeURIComponent("Join my savings circle on Arjo")}`
    : "#";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Invite people</p>
          <p className="text-xs text-muted-foreground">
            Share a link so others can join — the only way into a private
            circle. Anyone with the link can join (still subject to the bond and
            member limit). Rotate or revoke it anytime to kill old links.
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {link ? (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-secondary px-2 py-1.5 font-mono text-xs">
              {link}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <a href={telegramShare} target="_blank" rel="noreferrer">
                <Send className="h-3.5 w-3.5" />
                Share to Telegram
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => create(true)}
              disabled={loading !== null}
            >
              {loading === "rotate" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              New link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={revoke}
              disabled={loading !== null}
            >
              {loading === "revoke" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Revoke
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          onClick={() => create(false)}
          disabled={loading !== null}
        >
          {loading === "create" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Create invite link
        </Button>
      )}
    </div>
  );
}
