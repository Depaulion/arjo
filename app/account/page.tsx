import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  BarChart3,
  Coins,
  Compass,
  Flame,
  Gamepad2,
  History,
  Lock,
  ShieldCheck,
  Target,
  Users,
  Vault,
  Wallet,
  Wand2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  ARC_TESTNET_BLOCKCHAIN,
  isCircleConfigured,
  provisionWalletForUser,
} from "@/lib/circle";
import { ARC_TESTNET, arcAddressUrl } from "@/lib/arc";
import { getDashboardSnapshot } from "@/lib/dashboard";
import {
  type Challenge,
  type Circle,
  type CircleMember,
  type CircleRole,
  type LedgerEntry,
  type Profile,
  type SavingsGoal,
  type SavingsPlan,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
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
import { ClaimButton } from "@/components/wallet/claim-button";
import { WalletSetupBanner } from "@/components/wallet/wallet-setup-banner";
import { SavingsCoachCard } from "@/components/dashboard/savings-coach-card";
import {
  CommunitySavings,
  type MarketplaceCircle,
} from "@/components/dashboard/community-savings";
import {
  CircleHealth,
  type HealthCircle,
} from "@/components/dashboard/circle-health";
import { GoalTracker } from "@/components/dashboard/goal-tracker";
import { SavingsPlans } from "@/components/dashboard/savings-plans";
import { GamificationCard } from "@/components/dashboard/gamification-card";
import { FinancialPlanner } from "@/components/dashboard/financial-planner";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import {
  SavingsCharts,
  type ActivityBar,
  type AllocationSlice,
} from "@/components/dashboard/savings-charts";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        accent ? "border-primary/30 bg-gradient-to-br from-card to-primary/10" : ""
      }
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-primary">{icon}</span>
        </div>
        <p className="mt-2 text-3xl font-bold">
          {value}
          {unit && (
            <span className="ml-1 text-base font-medium text-muted-foreground">
              {unit}
            </span>
          )}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

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

  const safeProfile: Profile = profile ?? {
    id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string) ?? null,
    arc_wallet_address: null,
    circle_wallet_id: null,
    wallet_blockchain: "ARC-TESTNET",
    preferred_stablecoin: "USDC",
    xp: 0,
    level: 1,
    streak_weeks: 0,
    badges: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Fallback auto-provisioning: guarantee every signed-in user has their own
  // Arc wallet — even if the OAuth-callback attempt failed (Circle slow/down at
  // sign-in). Idempotent: returns the existing wallet if one already exists, so
  // this is a no-op on every load after the first. The wallet is what powers
  // claiming test USDC from the Circle faucet and all on-chain interactions.
  if (!safeProfile.arc_wallet_address && isCircleConfigured()) {
    try {
      const wallet = await provisionWalletForUser(supabase, user.id);
      safeProfile.arc_wallet_address = wallet.address;
      safeProfile.circle_wallet_id = wallet.walletId;
      safeProfile.wallet_blockchain = ARC_TESTNET_BLOCKCHAIN;
    } catch (err) {
      console.error("[account] fallback wallet provisioning failed:", err);
    }
  }

  // Circles the member created + circles they joined (via membership rows),
  // plus personal goals, savings plans and challenges.
  const [
    { data: createdCircles },
    { data: memberships },
    { data: goals },
    { data: plans },
    { data: challenges },
    { data: ledger },
  ] = await Promise.all([
    supabase
      .from("circles")
      .select("*")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .returns<Circle[]>(),
    supabase
      .from("circle_members")
      .select("circle_id, role")
      .eq("user_id", user.id)
      .returns<Pick<CircleMember, "circle_id" | "role">[]>(),
    supabase
      .from("savings_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<SavingsGoal[]>(),
    supabase
      .from("savings_plans")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<SavingsPlan[]>(),
    supabase
      .from("challenges")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<Challenge[]>(),
    supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<LedgerEntry[]>(),
  ]);

  const membershipRows = memberships ?? [];
  const joinedIds = membershipRows.map((m) => m.circle_id);
  const roleByCircle = new Map<string, CircleRole>(
    membershipRows.map((m) => [m.circle_id, m.role])
  );

  // Fetch circles joined that the member didn't create (RLS lets members read
  // circles they belong to).
  const createdIds = new Set((createdCircles ?? []).map((c) => c.id));
  const joinedOnlyIds = joinedIds.filter((id) => !createdIds.has(id));
  let joinedCircles: Circle[] = [];
  if (joinedOnlyIds.length > 0) {
    const { data } = await supabase
      .from("circles")
      .select("*")
      .in("id", joinedOnlyIds)
      .returns<Circle[]>();
    joinedCircles = data ?? [];
  }

  const myCircles: HealthCircle[] = [
    ...(createdCircles ?? []).map((c) => ({ ...c, role: "creator" as const })),
    ...joinedCircles.map((c) => ({
      ...c,
      role: roleByCircle.get(c.id) ?? ("member" as const),
    })),
  ];

  const activeCount = myCircles.filter((c) => c.status === "active").length;

  const allPlans = plans ?? [];
  const allChallenges = challenges ?? [];
  // Principal committed across active SafeLock / target / auto vault plans.
  const vaultLocked = allPlans
    .filter((p) => p.status === "active")
    .reduce((s, p) => s + p.principal, 0);

  const onChainEnabled =
    isCircleConfigured() &&
    Boolean(safeProfile.arc_wallet_address && safeProfile.circle_wallet_id);

  const ledgerEntries = ledger ?? [];
  const hasPending = ledgerEntries.some(
    (e) => e.status === "pending" && Boolean(e.circle_tx_id)
  );

  // Public marketplace: public circles the member didn't create.
  const { data: publicCircles } = await supabase
    .from("circles")
    .select("*")
    .eq("is_public", true)
    .neq("created_by", user.id)
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<Circle[]>();

  const marketplaceCircles: MarketplaceCircle[] = (publicCircles ?? []).map(
    (c) => ({ ...c, creatorName: null })
  );

  // Single on-chain scan powers the overview, coach and analytics.
  const snapshot = await getDashboardSnapshot({
    walletAddress: safeProfile.arc_wallet_address,
    activeCircles: myCircles.length,
    goalCount: (goals ?? []).length,
  });

  // Liquid, spendable USDC sitting in the user's wallet right now.
  const availableBalance =
    snapshot.walletBalance === null ? null : snapshot.walletBalance;

  // --- Analytics chart data (derived, no extra queries) ---
  // Donut: held assets split between the liquid wallet and locked vaults.
  const allocation: AllocationSlice[] = [
    {
      label: "Available",
      value: availableBalance ?? 0,
      color: "hsl(var(--primary))",
    },
    {
      label: "Locked in vaults",
      value: vaultLocked,
      color: "hsl(var(--accent))",
    },
  ];

  // Bars: net savings inflow per week over the last 8 weeks, from the ledger.
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const inflowKinds = new Set(["contribution", "lock", "autosave", "bonus"]);
  const weekBuckets = Array.from({ length: 8 }, () => 0);
  for (const e of ledgerEntries) {
    if (e.status === "failed" || !inflowKinds.has(e.kind)) continue;
    const k = Math.floor((nowMs - new Date(e.created_at).getTime()) / MS_WEEK);
    if (k >= 0 && k < 8) weekBuckets[k] += e.amount;
  }
  const activity: ActivityBar[] = weekBuckets
    .map((value, k) => {
      const d = new Date(nowMs - k * MS_WEEK);
      return {
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        value: Math.round(value * 100) / 100,
      };
    })
    .reverse();

  return (
    <div className="dark min-h-screen scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            Arc<span className="text-primary">Ajo</span>
          </Link>
          <DashboardNav />
        </div>
      </header>

      <main className="container max-w-6xl space-y-8 py-10 pb-28">
        {/* Greeting */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome back
              {safeProfile.full_name ? `, ${safeProfile.full_name}` : ""}
            </h1>
            <p className="mt-1 text-muted-foreground">
              Your social savings dashboard on {ARC_TESTNET.name}.
            </p>
          </div>
          <Badge variant={snapshot.rpcOk ? "accent" : "outline"}>
            {snapshot.rpcOk ? "Live · Arc Testnet" : "Arc Testnet"}
          </Badge>
        </div>

        {/* Prominent claim CTA when the wallet is ready; otherwise a setup
            notice so the user knows their wallet is provisioning / can retry. */}
        {safeProfile.arc_wallet_address ? (
          <ClaimButton
            address={safeProfile.arc_wallet_address}
            balance={snapshot.walletBalance}
            currency={safeProfile.preferred_stablecoin}
          />
        ) : (
          <WalletSetupBanner configured={isCircleConfigured()} />
        )}

        {/* 1. Savings Overview */}
        <section
          id="overview"
          className="grid scroll-mt-24 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatTile
            label="Available balance"
            value={availableBalance === null ? "—" : fmt(availableBalance)}
            unit={availableBalance === null ? undefined : "USDC"}
            sub="Liquid USDC in your wallet"
            icon={<Wallet className="h-4 w-4" />}
            accent
          />
          <StatTile
            label="Contribution streak"
            value={String(snapshot.streakWeeks)}
            unit={snapshot.streakWeeks === 1 ? "week" : "weeks"}
            sub={
              snapshot.lastContributionAt
                ? "Keep it going this week"
                : "Make your first contribution"
            }
            icon={<Flame className="h-4 w-4" />}
          />
          <StatTile
            label="Active circles"
            value={String(myCircles.length)}
            sub={`${activeCount} active · ${
              myCircles.length - activeCount
            } forming`}
            icon={<Users className="h-4 w-4" />}
          />
          <StatTile
            label="Reputation"
            value={String(snapshot.reputationScore)}
            unit="/100"
            sub={snapshot.reputationLabel}
            icon={<Award className="h-4 w-4" />}
          />
        </section>

        {/* Analytics: allocation donut + weekly activity bars */}
        <section id="analytics" className="scroll-mt-24">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Savings analytics</CardTitle>
                  <CardDescription>
                    How your funds are allocated and your weekly momentum.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SavingsCharts
                allocation={allocation}
                activity={activity}
                currency={safeProfile.preferred_stablecoin}
              />
            </CardContent>
          </Card>
        </section>

        {/* 2 + 4. Coach and Circle Health side by side */}
        <section className="grid gap-6 lg:grid-cols-2">
          <SavingsCoachCard
            coach={snapshot.coach}
            currency={safeProfile.preferred_stablecoin}
          />
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Circle health analytics</CardTitle>
                  <CardDescription>
                    Consistency, stability and per-circle insights.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CircleHealth
                circles={myCircles}
                consistency={snapshot.coach.factors.consistency}
              />
            </CardContent>
          </Card>
        </section>

        {/* Smart savings: SafeLock vaults + gamification */}
        <section id="save" className="grid scroll-mt-24 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Vault className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">SafeLock &amp; auto-save</CardTitle>
                  <CardDescription>
                    Lock funds for a yield bonus or automate recurring savings.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SavingsPlans plans={allPlans} onChainEnabled={onChainEnabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Gamepad2 className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Rewards &amp; streaks</CardTitle>
                  <CardDescription>
                    Earn XP, level up, and unlock badges as you save.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GamificationCard
                userId={user.id}
                xp={safeProfile.xp ?? 0}
                streakWeeks={Math.max(
                  safeProfile.streak_weeks ?? 0,
                  snapshot.streakWeeks
                )}
                badges={safeProfile.badges ?? []}
                challenges={allChallenges}
              />
            </CardContent>
          </Card>
        </section>

        {/* AI Financial Planner */}
        <section>
          <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Wand2 className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">AI financial planner</CardTitle>
                  <CardDescription>
                    Tell us your numbers and get a personalised savings plan and
                    timeline.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <FinancialPlanner currency={safeProfile.preferred_stablecoin} />
            </CardContent>
          </Card>
        </section>

        {/* On-chain activity feed */}
        <section id="activity" className="scroll-mt-24">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <History className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Recent activity</CardTitle>
                  <CardDescription>
                    Every USDC action, settled on {ARC_TESTNET.name}.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ActivityFeed entries={ledgerEntries} hasPending={hasPending} />
            </CardContent>
          </Card>
        </section>

        {/* 3. Community Circles marketplace */}
        <section id="community" className="scroll-mt-24">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Compass className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Community savings</CardTitle>
                  <CardDescription>
                    Discover public savings circles and join one.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CommunitySavings
                circles={marketplaceCircles}
                joinedIds={joinedIds}
                userId={user.id}
              />
            </CardContent>
          </Card>
        </section>

        {/* 5 + 6. Goals and Arc economy */}
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Target className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Goal tracking</CardTitle>
                  <CardDescription>
                    Set targets and watch your progress and finish date.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GoalTracker
                userId={user.id}
                goals={goals ?? []}
                balance={snapshot.walletBalance ?? 0}
                weeklyRate={snapshot.coach.weeklyProjection}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Wallet className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg">Arc Testnet economy</CardTitle>
                    <CardDescription>
                      Your programmable wallet on {safeProfile.wallet_blockchain}.
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="accent">{safeProfile.preferred_stablecoin}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary/40 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Coins className="h-3.5 w-3.5 text-primary" />
                    Test USDC balance
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {snapshot.walletBalance === null
                      ? "—"
                      : fmt(snapshot.walletBalance)}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    Locked in vaults
                  </p>
                  <p className="mt-1 text-2xl font-bold">{fmt(vaultLocked)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Across SafeLock plans
                  </p>
                </div>
              </div>

              {safeProfile.arc_wallet_address ? (
                <WalletPanel
                  address={safeProfile.arc_wallet_address}
                  balance={snapshot.walletBalance}
                  explorerUrl={arcAddressUrl(safeProfile.arc_wallet_address)}
                  currency={safeProfile.preferred_stablecoin}
                />
              ) : (
                <WalletProvisioner />
              )}
            </CardContent>
          </Card>
        </section>

        {/* Account settings */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account settings</CardTitle>
              <CardDescription>
                Update your name, Arc wallet, and preferred stablecoin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm profile={safeProfile} />
            </CardContent>
          </Card>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
