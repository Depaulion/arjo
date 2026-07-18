import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ChevronLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUsdcBalance } from "@/lib/arc-onchain";
import type {
  Circle,
  CircleMember,
  CircleRole,
  Profile,
  SavingsPlan,
} from "@/lib/types";
import {
  WithdrawFlow,
  type WithdrawCircle,
  type WithdrawVault,
} from "@/components/dashboard/withdraw/withdraw-flow";

export const dynamic = "force-dynamic";

export default async function WithdrawPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/account/withdraw");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("arc_wallet_address, circle_wallet_id, preferred_stablecoin")
    .eq("id", user.id)
    .single<
      Pick<
        Profile,
        "arc_wallet_address" | "circle_wallet_id" | "preferred_stablecoin"
      >
    >();

  const walletAddress = profile?.arc_wallet_address ?? null;
  const currency = profile?.preferred_stablecoin ?? "USDC";

  // Liquid onchain balance (source of truth for cash-out limits).
  let balance: number | null = null;
  if (walletAddress) {
    try {
      balance = await getUsdcBalance(walletAddress);
    } catch {
      balance = null;
    }
  }

  // Active vaults the user can unlock, and circles they could request to leave.
  const [{ data: plans }, { data: createdCircles }, { data: memberships }] =
    await Promise.all([
      supabase
        .from("savings_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .returns<SavingsPlan[]>(),
      supabase
        .from("circles")
        .select("*")
        .eq("created_by", user.id)
        .returns<Circle[]>(),
      supabase
        .from("circle_members")
        .select("circle_id, role")
        .eq("user_id", user.id)
        .returns<Pick<CircleMember, "circle_id" | "role">[]>(),
    ]);

  const vaults: WithdrawVault[] = (plans ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    principal: p.principal,
    currency: p.currency,
    planType: p.plan_type,
    lockUntil: p.lock_until,
  }));

  // Build the member-circle list: created + joined, de-duped.
  const createdIds = new Set((createdCircles ?? []).map((c) => c.id));
  const roleByCircle = new Map<string, CircleRole>(
    (memberships ?? []).map((m) => [m.circle_id, m.role])
  );
  const joinedOnlyIds = (memberships ?? [])
    .map((m) => m.circle_id)
    .filter((id) => !createdIds.has(id));

  let joinedCircles: Circle[] = [];
  if (joinedOnlyIds.length > 0) {
    const { data } = await supabase
      .from("circles")
      .select("*")
      .in("id", joinedOnlyIds)
      .returns<Circle[]>();
    joinedCircles = data ?? [];
  }

  const circles: WithdrawCircle[] = [
    ...(createdCircles ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      role: "creator" as const,
      status: c.status,
    })),
    ...joinedCircles.map((c) => ({
      id: c.id,
      name: c.name,
      role: roleByCircle.get(c.id) ?? ("member" as const),
      status: c.status,
    })),
  ];

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
              <ArrowDownToLine className="h-5 w-5" />
            </span>
            Withdraw
          </div>
        </div>
      </header>

      <main className="container max-w-3xl space-y-5 py-6">
        <p className="text-sm text-muted-foreground">
          Move funds out of Arjo: cash out your wallet to any Arc address, unlock
          a SafeLock vault, or request to leave a savings circle.
        </p>
        <WithdrawFlow
          walletAddress={walletAddress}
          balance={balance}
          currency={currency}
          vaults={vaults}
          circles={circles}
          userId={user.id}
        />
      </main>
    </div>
  );
}
