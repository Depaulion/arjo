import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, RefreshCw } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { ARC_TESTNET } from "@/lib/arc";
import type { Profile } from "@/lib/types";
import { RampFlow } from "@/components/dashboard/ramp/ramp-flow";

export const dynamic = "force-dynamic";

export default async function RampPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account/ramp");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("arc_wallet_address, preferred_stablecoin")
    .eq("id", user.id)
    .single<Pick<Profile, "arc_wallet_address" | "preferred_stablecoin">>();

  const walletAddress = profile?.arc_wallet_address ?? null;
  const currency = profile?.preferred_stablecoin ?? "USDC";

  let balance: number | null = null;
  if (walletAddress) {
    try {
      balance = await getUsdcBalance(walletAddress);
    } catch {
      balance = null;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 max-w-3xl items-center gap-3">
          <Link
            href="/account"
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <RefreshCw className="h-5 w-5" />
            </span>
            Add &amp; cash out
          </div>
        </div>
      </header>

      <main className="container max-w-3xl space-y-5 py-6">
        <p className="text-sm text-muted-foreground">
          Move between your local currency and {currency}. Add money to fund your
          wallet, or cash out to your bank or mobile-money account. On Arc Testnet
          no real money moves — funding is a faucet claim and cash-outs are
          recorded as payout requests.
        </p>
        <RampFlow
          walletAddress={walletAddress}
          balance={balance}
          currency={currency}
          faucetUrl={ARC_TESTNET.faucetUrl}
        />
      </main>
    </div>
  );
}
