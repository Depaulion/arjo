import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, LogOut, Plus, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ARC_TESTNET, arcAddressUrl } from "@/lib/arc";
import { getUsdcBalance } from "@/lib/arc-onchain";
import { CIRCLE_FREQUENCIES, type Circle, type Profile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/components/auth/profile-form";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { WalletProvisioner } from "@/components/wallet/wallet-provisioner";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  // Fallback in case the signup trigger hasn't populated the row yet.
  const safeProfile: Profile = profile ?? {
    id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    arc_wallet_address: null,
    circle_wallet_id: null,
    wallet_blockchain: "ARC-TESTNET",
    preferred_stablecoin: "USDC",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: circles } = await supabase
    .from("circles")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<Circle[]>();

  const frequencyLabel = (value: Circle["frequency"]) =>
    CIRCLE_FREQUENCIES.find((f) => f.value === value)?.label ?? value;

  // Live on-chain USDC balance (reflects funds claimed from the Circle faucet).
  let walletBalance: number | null = null;
  if (safeProfile.arc_wallet_address) {
    try {
      walletBalance = await getUsdcBalance(safeProfile.arc_wallet_address);
    } catch {
      walletBalance = null;
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            Arc<span className="text-primary">Ajo</span>
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="container max-w-3xl space-y-6 py-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
          <p className="mt-1 text-muted-foreground">
            Manage how you save and where your payouts settle on Arc.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Your Arc wallet</CardTitle>
                <CardDescription>
                  A Circle programmable wallet, created for you on{" "}
                  {safeProfile.wallet_blockchain}.
                </CardDescription>
              </div>
              <Badge variant="accent">{safeProfile.preferred_stablecoin}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {safeProfile.arc_wallet_address ? (
              <WalletPanel
                address={safeProfile.arc_wallet_address}
                balance={walletBalance}
                explorerUrl={arcAddressUrl(safeProfile.arc_wallet_address)}
              />
            ) : (
              <WalletProvisioner />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Your circles</CardTitle>
                <CardDescription>
                  Savings groups you&apos;ve created.
                </CardDescription>
              </div>
              <Button size="sm" asChild>
                <Link href="/circles/new">
                  <Plus className="h-4 w-4" />
                  New circle
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {circles && circles.length > 0 ? (
              <ul className="divide-y divide-border">
                {circles.map((circle) => (
                  <li key={circle.id} className="first:pt-0 last:pb-0">
                    <Link
                      href={`/circles/${circle.id}`}
                      className="-mx-3 flex items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{circle.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {circle.contribution_amount.toLocaleString()}{" "}
                          {circle.currency} · {frequencyLabel(circle.frequency)}{" "}
                          ·{" "}
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {circle.member_count}
                          </span>
                        </p>
                      </div>
                      <Badge
                        variant={
                          circle.status === "active" ? "default" : "outline"
                        }
                      >
                        {circle.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No circles yet. Start your first Ajo savings group.
                </p>
                <Button size="sm" className="mt-4" asChild>
                  <Link href="/circles/new">
                    <Plus className="h-4 w-4" />
                    Create a circle
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
            <CardDescription>
              Update your name, Arc wallet, and preferred stablecoin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={safeProfile} />
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Arc network</CardTitle>
              <Badge variant="accent">Testnet</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Network</p>
              <p className="font-medium">{ARC_TESTNET.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Chain ID</p>
              <p className="font-medium">{ARC_TESTNET.chainId}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Gas token</p>
              <p className="font-medium">
                {ARC_TESTNET.nativeCurrency.symbol} (
                {ARC_TESTNET.nativeCurrency.decimals} decimals)
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Explorer</p>
              <a
                href={ARC_TESTNET.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {ARC_TESTNET.explorerUrl.replace("https://", "")}
              </a>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
