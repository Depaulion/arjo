"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, ZapOff } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Opt in/out of automatic per-round contributions for a circle. When on, the
 * platform scheduler pulls each round's contribution from the member's Circle
 * wallet on the due date (with a heads-up beforehand and a notice if the wallet
 * balance is short — never a silent default). Posts to the auto-debit API.
 */
export function AutoDebitToggle({
  circleId,
  initialEnabled,
}: {
  circleId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/circles/${circleId}/auto-debit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Couldn't update auto-debit.");
      return;
    }
    setEnabled(json.autoDebit === true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            enabled
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-muted-foreground"
          )}
        >
          {enabled ? (
            <Zap className="h-4 w-4" />
          ) : (
            <ZapOff className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Auto-debit my contribution</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "Each round is pulled from your wallet on the due date. You'll be warned first if your balance is short."
              : "Turn on to contribute automatically each round from your Circle wallet."}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle auto-debit"
        disabled={loading}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
          enabled ? "bg-primary" : "bg-secondary"
        )}
      >
        {loading ? (
          <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-foreground" />
        ) : (
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
              enabled ? "translate-x-6" : "translate-x-1"
            )}
          />
        )}
      </button>
    </div>
  );
}
