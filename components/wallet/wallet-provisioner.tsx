"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Fallback that auto-provisions a Circle wallet on first account visit if the
// callback didn't (e.g. password signup that skipped the OAuth callback).
export function WalletProvisioner() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/wallet", { method: "POST" });
        if (res.ok) {
          router.refresh();
          return;
        }
        if (res.status === 503) {
          setError(
            "Wallet provisioning is not configured yet. Add Circle credentials to enable it."
          );
          return;
        }
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not create your wallet.");
      } catch {
        setError("Could not create your wallet.");
      }
    })();
  }, [router]);

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Setting up your Arc wallet…
    </p>
  );
}
