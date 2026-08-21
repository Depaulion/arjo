"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2, Wallet } from "lucide-react";

import { shortenHex } from "@/lib/arc";
import { Button } from "@/components/ui/button";

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getProvider(): EthProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  return eth ?? null;
}

/**
 * Connect & verify an external self-custody wallet (MetaMask etc.) by signing a
 * one-time nonce — proving ownership without granting any spending permission.
 * The verified address is saved as a trusted withdrawal/identity address. Uses
 * the browser's injected provider directly; posts to /api/wallet/connect.
 */
export function ConnectWallet({
  initialConnected,
}: {
  initialConnected: string | null;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState<string | null>(initialConnected);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const provider = getProvider();
    if (!provider) {
      setError(
        "No browser wallet detected. Install MetaMask (or another wallet) and try again."
      );
      return;
    }
    setLoading(true);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts?.[0];
      if (!address) {
        setError("No account selected.");
        return;
      }

      // Fetch a fresh nonce + the message template to sign.
      const chRes = await fetch("/api/wallet/connect");
      const chJson = (await chRes.json()) as { messageTemplate?: string };
      if (!chRes.ok || !chJson.messageTemplate) {
        setError("Couldn't start verification. Try again.");
        return;
      }
      const message = chJson.messageTemplate.replace("{address}", address);

      // Ask the wallet to sign it (no gas, no spending permission).
      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const res = await fetch("/api/wallet/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Verification failed.");
        return;
      }
      setConnected(json.connected ?? address);
      router.refresh();
    } catch (e) {
      // 4001 = user rejected the request in their wallet.
      const code = (e as { code?: number })?.code;
      setError(code === 4001 ? "You cancelled the request." : "Wallet error — try again.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/wallet/connect", { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Couldn't disconnect. Try again.");
      return;
    }
    setConnected(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          {connected ? <BadgeCheck className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">External wallet</p>
          <p className="text-xs text-muted-foreground">
            {connected ? (
              <>
                Verified:{" "}
                <span className="font-mono text-foreground">
                  {shortenHex(connected)}
                </span>{" "}
                — a trusted address you can cash out to.
              </>
            ) : (
              "Connect a self-custody wallet (e.g. MetaMask) and sign to prove ownership — no gas, no spending permission."
            )}
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      {connected ? (
        <Button size="sm" variant="outline" onClick={disconnect} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Disconnect
        </Button>
      ) : (
        <Button size="sm" onClick={connect} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          Connect wallet
        </Button>
      )}
    </div>
  );
}
