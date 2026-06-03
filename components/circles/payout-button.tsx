"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Send the next rotating payout from the pot to the next member in line. Only
 * rendered for the circle creator (the pot owner). Posts to the payout API,
 * which records a `payout` ledger entry and moves USDC on-chain from the
 * creator's wallet to the recipient when Circle wallets are configured.
 */
export function PayoutButton({
  circleId,
  potTarget,
  currency = "USDC",
}: {
  circleId: string;
  /** Suggested payout = full round pot (contribution × members). */
  potTarget: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function payout() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/circles/${circleId}/payout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: potTarget ? JSON.stringify({ amount: potTarget }) : "{}",
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Payout failed.");
      return;
    }

    if (json.done) {
      setNotice(json.message ?? "All members have been paid.");
    } else if (json.pending) {
      setNotice(
        `Payout of ${json.amount} ${currency} recorded — the on-chain transfer is pending. Fund the pot wallet to settle it.`
      );
    } else {
      const short = json.recipient?.address
        ? `${json.recipient.address.slice(0, 6)}…${json.recipient.address.slice(-4)}`
        : "the next member";
      setNotice(
        `Sent ${json.amount} ${currency} to ${short} (position ${json.recipient?.position}).` +
          (json.completed
            ? " That was the final round — the circle is complete! 🎉"
            : ` ${json.remaining} member${json.remaining === 1 ? "" : "s"} left in the rotation.`)
      );
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
          <Trophy className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Send the rotation payout</p>
          <p className="text-xs text-muted-foreground">
            Pay the pot to the next member in line
            {potTarget
              ? ` — about ${potTarget.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })} ${currency}.`
              : "."}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          {notice && <p className="mt-1 text-xs text-primary">{notice}</p>}
        </div>
      </div>
      <Button
        onClick={payout}
        disabled={loading}
        variant="default"
        className="shrink-0"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Gift className="h-4 w-4" />
        )}
        Pay out
      </Button>
    </div>
  );
}
