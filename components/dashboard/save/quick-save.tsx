"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PiggyBank, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const PRESETS = [5, 10, 20] as const;

/**
 * Quick Save — one-tap deposits into a flexible (no-lock) vault. The fastest
 * path to "save a little right now": pick +5/+10/+20 or a custom amount and the
 * funds move from the user's Arc wallet into the flex vault on-chain (via the
 * existing /api/savings/lock flex plan, ledger-first).
 */
export function QuickSave({
  balance,
  currency,
  onChainEnabled,
}: {
  balance: number | null;
  currency: string;
  onChainEnabled: boolean;
}) {
  const router = useRouter();

  const [preset, setPreset] = useState<number | null>(10);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amount = custom ? Number(custom) : preset ?? 0;
  const overBalance = balance != null && amount > balance;
  const canSave = Number.isFinite(amount) && amount > 0 && !overBalance;

  async function save() {
    setError(null);
    setNotice(null);
    if (!canSave) {
      setError(
        overBalance
          ? "That's more than your available balance."
          : "Choose an amount to save."
      );
      return;
    }
    setLoading(true);
    const res = await fetch("/api/savings/lock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Quick save",
        planType: "flex",
        amount,
        currency,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save right now.");
      return;
    }
    setNotice(
      json.pending
        ? `Saved ${fmt(amount)} ${currency} — transfer pending until your wallet is funded.`
        : `Saved ${fmt(amount)} ${currency} into your flex vault. 🎉`
    );
    setCustom("");
    router.refresh();
  }

  return (
    <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold leading-tight">Quick Save</p>
            <p className="text-xs text-muted-foreground">
              Stash a little into your flex vault — no lock, withdraw anytime.
            </p>
          </div>
        </div>
        {balance != null && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Available
            </p>
            <p className="text-sm font-semibold">
              {fmt(balance)} {currency}
            </p>
          </div>
        )}
      </div>

      {/* Amount presets */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        {PRESETS.map((p) => {
          const active = !custom && preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPreset(p);
                setCustom("");
                setError(null);
              }}
              className={`rounded-2xl border px-2 py-3 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-foreground hover:border-primary/40"
              }`}
            >
              +{p}
            </button>
          );
        })}
        <input
          inputMode="decimal"
          type="number"
          min="0.01"
          step="0.01"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setPreset(null);
            setError(null);
          }}
          placeholder="Custom"
          aria-label="Custom amount"
          className="w-full rounded-2xl border border-border/60 bg-card px-3 py-3 text-center text-sm font-semibold focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Button
        className="mt-4 w-full"
        size="lg"
        onClick={save}
        disabled={loading || !canSave}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PiggyBank className="h-4 w-4" />
        )}
        {amount > 0 ? `Save ${fmt(amount)} ${currency}` : "Save"}
      </Button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Flex vault stays liquid at 0% APY.{" "}
        <span className="font-semibold text-emerald-500">
          Open a SafeLock below to earn up to 8% APY, Treasury-backed.
        </span>
      </p>

      {!onChainEnabled && (
        <p className="mt-3 text-xs text-muted-foreground">
          On-chain transfers are off — saves are tracked and settle once a funded
          Arc wallet is connected.
        </p>
      )}
      {notice && <p className="mt-3 text-xs font-medium text-primary">{notice}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
