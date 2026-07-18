"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Droplet,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { ARC_TESTNET } from "@/lib/arc";
import { Button } from "@/components/ui/button";

function formatUsdc(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function WalletPanel({
  address,
  balance,
  explorerUrl,
  currency = "USDC",
}: {
  address: string;
  /** onchain USDC balance, or null if it couldn't be read. */
  balance: number | null;
  explorerUrl: string;
  currency?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [faucetCopied, setFaucetCopied] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  function copyAddress() {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Copy the address before sending the user to the faucet so they can paste it
  // straight in, and surface a confirmation so the silent copy is obvious.
  function handleFaucet() {
    navigator.clipboard?.writeText(address).then(() => {
      setFaucetCopied(true);
      setTimeout(() => setFaucetCopied(false), 4000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="text-3xl font-bold">
            {balance === null ? "—" : formatUsdc(balance)}{" "}
            <span className="text-base font-medium text-muted-foreground">
              {currency}
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startRefresh(() => router.refresh())}
          disabled={refreshing}
          title="Refresh balance"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Address */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <code className="break-all rounded-lg bg-secondary/60 px-3 py-2 font-mono text-sm">
          {address}
        </code>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyAddress}>
            {copied ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Explorer
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Faucet */}
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {faucetCopied ? (
            <span className="font-medium text-primary">
              Address copied — paste it into the Circle faucet, claim {currency},
              then hit Refresh.
            </span>
          ) : (
            <>
              Need test funds? Claim {currency} on {ARC_TESTNET.name} from the
              Circle faucet, then refresh.
            </>
          )}
        </p>
        <Button size="sm" variant="default" className="shrink-0" asChild>
          <a
            href={ARC_TESTNET.faucetUrl}
            target="_blank"
            rel="noreferrer"
            onClick={handleFaucet}
          >
            {faucetCopied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Droplet className="h-4 w-4" />
            )}
            Claim test {currency}
          </a>
        </Button>
      </div>
    </div>
  );
}
