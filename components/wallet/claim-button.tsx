"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Droplet, ExternalLink, Loader2 } from "lucide-react";

import { ARC_TESTNET } from "@/lib/arc";
import { Button } from "@/components/ui/button";

/**
 * Prominent "Claim test USDC" call-to-action for the top of the dashboard.
 *
 * Circle's faucet API isn't available to this API key, so claiming happens on
 * Circle's hosted faucet. To make that one-click-smooth we copy the user's Arc
 * address to the clipboard and open the faucet in a new tab, so they only have
 * to paste + claim. A Refresh button re-reads the onchain balance afterward.
 */
export function ClaimButton({
  address,
  balance,
  currency = "USDC",
}: {
  address: string;
  /** Current onchain balance, or null if unknown — drives the copy. */
  balance: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const empty = balance === null || balance <= 0;

  function handleClaim() {
  claim();
  setTimeout(() => {
    startRefresh(() => router.refresh());
  }, 15000);
}

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/10 to-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Droplet className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold">
            {empty
              ? `Fund your wallet to start saving`
              : `Need more test ${currency}?`}
          </p>
          <p className="text-sm text-muted-foreground">
            {copied ? (
              <span className="font-medium text-primary">
                Address copied — paste it into the Circle faucet, claim{" "}
                {currency}, then hit Refresh.
              </span>
            ) : (
              <>
                Claim free {currency} on {ARC_TESTNET.name} — we&apos;ll copy
                your address and open the Circle faucet.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={refreshing}
          title="Refresh balance"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : copied ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          Refresh
        </Button>
        <Button size="sm" onClick={handleClaim}>
          <Droplet className="h-4 w-4" />
          Claim test {currency}
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
