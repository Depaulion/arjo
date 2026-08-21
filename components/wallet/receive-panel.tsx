"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowDownToLine, Check, Copy, ExternalLink } from "lucide-react";

import { ARC_TESTNET, arcAddressUrl } from "@/lib/arc";

/**
 * Receive / deposit panel — fund the Arjo wallet from ANY external wallet or
 * exchange. Shows the user's Arc wallet address as a scannable QR plus a
 * copyable string, so no custom wallet-connect integration is needed: any wallet
 * that can send USDC on Arc can top this up. Withdrawing to an external address
 * is handled separately by the withdraw flow.
 */
export function ReceivePanel({
  address,
  currency = "USDC",
}: {
  address: string | null;
  currency?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the address is still shown for manual copy */
    }
  }

  if (!address) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-sm">
        Your wallet is still being set up — the deposit address will appear here
        once it&apos;s ready.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ArrowDownToLine className="h-5 w-5" />
        </span>
        <div>
          <p className="text-base font-bold leading-tight">
            Your Arjo savings account
          </p>
          <p className="text-xs text-muted-foreground">
            Fund it with {currency} from any external wallet or exchange.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* QR — on a white tile so any camera can scan it in dark mode. */}
        <div className="shrink-0 rounded-2xl bg-white p-3">
          <QRCodeSVG value={address} size={132} marginSize={0} />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Arjo wallet · deposit address ({ARC_TESTNET.name})
            </p>
            <p className="mt-1 break-all rounded-xl bg-secondary/60 px-3 py-2 font-mono text-xs">
              {address}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy address
                </>
              )}
            </button>
            <a
              href={arcAddressUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View on explorer
            </a>
          </div>
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
        Send only <span className="font-semibold">{currency} on {ARC_TESTNET.name}</span>{" "}
        to this address. Sending other assets, or on another network, may lose
        them permanently.
      </p>
    </div>
  );
}
