"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Prominent top-of-dashboard notice shown when a signed-in user doesn't yet
 * have a wallet — i.e. automatic provisioning (OAuth callback + server
 * fallback) didn't complete. Lets them retry on demand so they're never stuck
 * without the wallet needed to claim test USDC and interact onchain.
 */
export function WalletSetupBanner({
  configured = true,
}: {
  /** False when Circle credentials are missing — retry can't help. */
  configured?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (!configured) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet", { method: "POST" });
      if (res.ok) {
        startTransition(() => router.refresh());
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(
        body.error ??
          (res.status === 503
            ? "Wallet provisioning isn't configured yet."
            : "Couldn't set up your wallet. Please try again.")
      );
    } catch {
      setError("Couldn't reach the wallet service. Please try again.");
    } finally {
      setRetrying(false);
    }
  }

  const busy = retrying || pending;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/10 to-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {error ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <Wallet className="h-5 w-5" />
          )}
        </span>
        <div>
          <p className="font-semibold">
            {error ? "Wallet setup didn't finish" : "Setting up your wallet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : configured ? (
              <>
                Your personal wallet is being created — it powers claiming test
                USDC and every onchain action. Tap retry if it doesn&apos;t
                appear.
              </>
            ) : (
              <>
                onchain wallets aren&apos;t enabled on this deployment yet.
                Add Circle credentials to provision wallets automatically.
              </>
            )}
          </p>
        </div>
      </div>
      {configured && (
        <div className="shrink-0">
          <Button size="sm" onClick={retry} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {error ? "Try again" : "Retry setup"}
          </Button>
        </div>
      )}
    </div>
  );
}
