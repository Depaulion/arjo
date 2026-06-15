"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Creator-only switch for a circle's "private amounts" mode (privacy with
 * governed visibility). When on, the pot total stays visible to every member,
 * but each member's individual contribution figures are visible only to that
 * member and the creator. Posts to the privacy API, which calls the
 * creator-gated set_circle_privacy RPC (migration 0022).
 */
export function PrivacyToggle({
  circleId,
  initialPrivate,
}: {
  circleId: string;
  initialPrivate: boolean;
}) {
  const router = useRouter();
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !isPrivate;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/circles/${circleId}/privacy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ private: next }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Couldn't update privacy.");
      return;
    }
    setIsPrivate(json.private === true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isPrivate
              ? "bg-accent/15 text-accent"
              : "bg-secondary text-muted-foreground"
          )}
        >
          {isPrivate ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Private member amounts</p>
          <p className="text-xs text-muted-foreground">
            {isPrivate
              ? "On — the pot total stays visible to all, but each member's individual contributions are hidden from other members. You (the creator) and the member still see their own."
              : "Off — every member can see each other's individual contribution amounts. Turn on for privacy with governed visibility."}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        aria-label="Toggle private member amounts"
        disabled={loading}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
          isPrivate ? "bg-accent" : "bg-secondary"
        )}
      >
        {loading ? (
          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-foreground" />
        ) : (
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              isPrivate ? "translate-x-6" : "translate-x-1"
            )}
          />
        )}
      </button>
    </div>
  );
}
