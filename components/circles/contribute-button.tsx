"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Coins, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Contribute USDC to a circle's pot. Posts to the contribute API, which records
 * a ledger entry and (when Circle wallets are configured) moves USDC onchain
 * from the member's wallet to the pot.
 */
export function ContributeButton({
  circleId,
  defaultAmount,
  currency = "USDC",
}: {
  circleId: string;
  defaultAmount: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(
    defaultAmount ? String(defaultAmount) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function contribute(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/circles/${circleId}/contribute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: value }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Contribution failed.");
      return;
    }
    setNotice(
      json.pending
        ? `Recorded ${value} ${currency}. onchain transfer is pending — fund your Arc wallet to settle it.`
        : `Contributed ${value} ${currency} to the pot.`
    );
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button onClick={() => setOpen(true)}>
          <Coins className="h-4 w-4" />
          Contribute to pot
        </Button>
        {notice && <p className="text-xs text-primary">{notice}</p>}
      </div>
    );
  }

  return (
    <form
      onSubmit={contribute}
      className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-1.5">
        <label htmlFor="contribute-amount" className="text-sm font-medium">
          Amount ({currency})
        </label>
        <input
          id="contribute-amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
          Send
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
