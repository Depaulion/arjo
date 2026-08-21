import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  Coins,
  Compass,
  Gamepad2,
  History,
  Lock,
  ShieldCheck,
  User as UserIcon,
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
import { computeBenefits } from "@/lib/benefits";
import { goalFunding } from "@/lib/goals";
import { effectiveApy, periodYield } from "@/lib/yield-engine";
import { isUsycEnabled } from "@/lib/usyc";
import { getPersistedNotifications } from "@/lib/notifications";
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
import { ConnectTelegram } from "@/components/dashboard/settings/connect-telegram";
import { AskArjo } from "@/components/dashboard/ask-arjo";
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
import { MyCircles } from "@/components/dashboard/circles/my-circles";
import { GoalsView } from "@/components/dashboard/goals/goals-view";
import { SavingsPlans } from "@/components/dashboard/savings-plans";
import { QuickSave } from "@/components/dashboard/save/quick-save";
import { SavingsAgent } from "@/components/dashboard/savings-agent";
import { GamificationCard } from "@/components/dashboard/gamification-card";
import { FinancialPlanner } from "@/components/dashboard/financial-planner";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import {
  NotificationBell,
  type AppNotification,
} from "@/components/dashboard/notification-bell";
import {
  SavingsCharts,
  type ActivityBar,
  type AllocationSlice,
} from "@/components/dashboard/savings-charts";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BalanceCard } from "@/components/dashboard/home/balance-card";
import { BenefitsDashboard } from "@/components/dashboard/benefits/benefits-dashboard";
import {
  PrimaryGoalCard,
  PrimaryGoalEmpty,
} from "@/components/dashboard/home/primary-goal-card";
import { AICoachTip } from "@/components/dashboard/home/ai-coach-tip";
import { QuickActions } from "@/components/dashboard/home/quick-actions";
import { ArcScoreCard } from "@/components/dashboard/home/arc-score-card";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
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
    is_admin: false,
    xp: 0,
    level: 1,
    streak_weeks: 0,
    badges: [],
    default_count: 0,
    last_default_date: null,
    circle_lockout_until: null,
    is_flagged: false,
    default_status: "none",
    missed_payments: 0,
    withdrawal_attempts: 0,
    reinstatement_circles_completed: 0,
    ai_risk_score: "low",
    reputation_history: [],
    telegram_chat_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Fallback auto-provisioning: guarantee every signed-in user has their own
  // wallet — even if the OAuth-callback attempt failed (Circle slow/down at
  // sign-in). Idempotent: returns the existing wallet if one already exists, so
  // this is a no-op on every load after the first. The wallet is what powers
  // claiming test USDC from the Circle faucet and all onchain interactions.
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

  // What those vaults earned in the last 24h — shown live on the balance card
  // so the saver sees their money working every day, not just at maturity.
  const earnedToday = allPlans
    .filter((p) => p.status === "active" && p.apy_bonus > 0 && p.principal > 0)
    .reduce(
      (s, p) =>
        s +
        periodYield({
          principal: p.principal,
          from: p.created_at,
          windowDays: 1,
          apy: effectiveApy(p.apy_bonus),
        }),
      0
    );

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

  // Single onchain scan powers the overview, coach and analytics.
  const snapshot = await getDashboardSnapshot({
    walletAddress: safeProfile.arc_wallet_address,
    activeCircles: myCircles.length,
    goalCount: (goals ?? []).length,
    defaultCount: safeProfile.default_count,
    isFlagged: safeProfile.is_flagged,
    missedPayments: safeProfile.missed_payments,
    withdrawalAttempts: safeProfile.withdrawal_attempts,
  });

  // Liquid, spendable USDC sitting in the user's wallet right now.
  const availableBalance =
    snapshot.walletBalance === null ? null : snapshot.walletBalance;

  // Benefits Dashboard: aggregate realised yield, contributions and bonds from
  // the full ledger (the 20-row feed above is only the recent activity list).
  const { data: benefitLedger } = await supabase
    .from("ledger_entries")
    .select("kind, amount, status")
    .eq("user_id", user.id)
    .limit(1000)
    .returns<Pick<LedgerEntry, "kind" | "amount" | "status">[]>();

  const benefits = computeBenefits({
    currency: safeProfile.preferred_stablecoin,
    plans: allPlans,
    ledger: benefitLedger ?? [],
    activeCircles: activeCount,
    xp: safeProfile.xp ?? 0,
    level: safeProfile.level ?? 1,
    streakWeeks: Math.max(safeProfile.streak_weeks ?? 0, snapshot.streakWeeks),
    badges: safeProfile.badges ?? [],
    usycLive: isUsycEnabled(),
  });

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

  // --- Home hero figures ---
  // Total savings = liquid wallet balance + everything locked in vaults.
  const total = (availableBalance ?? 0) + vaultLocked;

  // Net inflow this calendar month, for the "+X this month" pill.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthDelta = ledgerEntries.reduce((s, e) => {
    if (e.status === "failed" || !inflowKinds.has(e.kind)) return s;
    return new Date(e.created_at) >= monthStart ? s + e.amount : s;
  }, 0);

  // The user's primary goal (most recent) drives the "Current goal" card.
  const primaryGoal = (goals ?? [])[0] ?? null;
  // Real money committed to it = principal + accrued yield of its linked vaults
  // (not the liquid wallet balance), so the card never overstates progress.
  const primaryGoalFunded = primaryGoal
    ? goalFunding(primaryGoal.id, allPlans).funded
    : 0;

  // Time-of-day greeting (server time).
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Personalised notifications: a welcome greeting plus gentle, state-derived
  // reminders. Computed here so the bell stays a presentational client widget.
  const firstName = safeProfile.full_name?.split(" ")[0] ?? null;
  // Durable alerts (defaults, slashed bonds, restructure votes, etc.) take
  // priority — surface them right after the welcome greeting.
  const persistedNotifications = await getPersistedNotifications(
    supabase,
    user.id
  );

  const notifications: AppNotification[] = [
    {
      id: "welcome",
      title: firstName ? `Welcome back, ${firstName}!` : "Welcome back!",
      body: "Here's what's happening with your savings today.",
      icon: "welcome",
      tone: "welcome",
    },
    ...persistedNotifications,
  ];

  if (!safeProfile.arc_wallet_address) {
    notifications.push({
      id: "wallet-setup",
      title: "Finish setting up your wallet",
      body: "Your Arc Testnet wallet is being provisioned so you can save onchain.",
      icon: "wallet",
      tone: "reminder",
      href: "#overview",
    });
  } else if (!availableBalance) {
    notifications.push({
      id: "faucet",
      title: "Claim free test USDC",
      body: "Top up your wallet from the faucet to start contributing.",
      icon: "faucet",
      tone: "reminder",
      href: "#overview",
    });
  }

  if (snapshot.streakWeeks > 0) {
    notifications.push({
      id: "streak",
      title: `You're on a ${snapshot.streakWeeks}-week streak`,
      body: "Contribute again this week to keep the momentum going.",
      icon: "streak",
      tone: "reminder",
      href: "#overview",
    });
  } else {
    notifications.push({
      id: "first-contribution",
      title: "Make your first contribution",
      body: "Add to a circle or open a SafeLock vault to begin your streak.",
      icon: "spark",
      tone: "reminder",
      href: "#save",
    });
  }

  if (hasPending) {
    notifications.push({
      id: "pending",
      title: "Transactions awaiting settlement",
      body: "Open Recent activity and tap Sync status to refresh them.",
      icon: "sync",
      tone: "reminder",
      href: "#activity",
    });
  }

  if (myCircles.length === 0) {
    notifications.push({
      id: "join-circle",
      title: "Join a savings circle",
      body: "Explore community circles or start your own to save together.",
      icon: "members",
      tone: "info",
      href: "#community",
    });
  } else if (myCircles.length - activeCount > 0) {
    notifications.push({
      id: "forming",
      title: `${myCircles.length - activeCount} circle${
        myCircles.length - activeCount === 1 ? "" : "s"
      } still forming`,
      body: "Invite members so your circle can activate and start payouts.",
      icon: "members",
      tone: "info",
      href: "#overview",
    });
  }

  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            <span className="tracking-tight">
              Ar<span className="text-primary">jo</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {/* Profile avatar — links to account settings to change the photo. */}
            <Link
              href="#settings"
              aria-label="Profile"
              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-secondary/60 text-muted-foreground transition-colors hover:border-primary/40"
            >
              {safeProfile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeProfile.avatar_url}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
            </Link>
            <ThemeToggle />
            <NotificationBell notifications={notifications} />
            <DashboardNav
              walletAddress={safeProfile.arc_wallet_address}
              currency={safeProfile.preferred_stablecoin}
              isAdmin={safeProfile.is_admin}
            />
          </div>
        </div>
      </header>

      <DashboardTabs
        home={
        /* 1. Home hero — answers "how much do I have / what am I saving for /
            what next" before any deeper analytics. */
        <section id="overview" className="scroll-mt-24 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{greeting},</p>
              <h1 className="text-2xl font-bold tracking-tight">
                {firstName ?? "there"} 👋
              </h1>
            </div>
            <Badge variant={snapshot.rpcOk ? "accent" : "outline"}>
              {snapshot.rpcOk ? "Live · Arc Testnet" : "Arc Testnet"}
            </Badge>
          </div>

          <BalanceCard
            total={total}
            available={availableBalance ?? 0}
            locked={vaultLocked}
            monthDelta={monthDelta}
            earnedToday={earnedToday}
            currency={safeProfile.preferred_stablecoin}
          />

          {/* Claim CTA when the wallet is ready; otherwise a setup notice. */}
          {safeProfile.arc_wallet_address ? (
            <ClaimButton
              address={safeProfile.arc_wallet_address}
              balance={snapshot.walletBalance}
              currency={safeProfile.preferred_stablecoin}
            />
          ) : (
            <WalletSetupBanner configured={isCircleConfigured()} />
          )}

          <QuickActions />

          {primaryGoal ? (
            <PrimaryGoalCard
              name={primaryGoal.name}
              saved={Math.min(primaryGoalFunded, primaryGoal.target_amount)}
              target={primaryGoal.target_amount}
              targetDate={primaryGoal.target_date}
              currency={primaryGoal.currency}
            />
          ) : (
            <PrimaryGoalEmpty />
          )}

          <AICoachTip
            monthlyProjection={snapshot.coach.monthlyProjection}
            weeklyProjection={snapshot.coach.weeklyProjection}
            recommendation={snapshot.coach.recommendations[0] ?? snapshot.coach.summary}
            currency={safeProfile.preferred_stablecoin}
          />

          <ArcScoreCard
            score={snapshot.coach.healthScore}
            label={snapshot.coach.healthLabel}
            factors={snapshot.coach.factors}
            riskTier={snapshot.riskTier}
          />
        </section>
        }
        goals={
        <section id="goals" className="scroll-mt-24">
          <GoalsView
            userId={user.id}
            goals={goals ?? []}
            plans={allPlans}
            balance={snapshot.walletBalance ?? 0}
            weeklyRate={snapshot.coach.weeklyProjection}
          />
        </section>
        }
        stats={
        <>
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
        </>
        }
        save={
        <>
        {/* Quick Save — one-tap flex-vault deposits */}
        <section id="save" className="scroll-mt-24">
          <QuickSave
            balance={availableBalance}
            currency={safeProfile.preferred_stablecoin}
            onChainEnabled={onChainEnabled}
          />
        </section>

        {/* Savings Agent — auto-sweep idle cash into yield (agentic) */}
        <section className="scroll-mt-24">
          <SavingsAgent currency={safeProfile.preferred_stablecoin} />
        </section>

        {/* Smart savings: SafeLock vaults + gamification */}
        <section className="grid gap-6 lg:grid-cols-2">
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
              <SavingsPlans
                plans={allPlans}
                goals={goals ?? []}
                onChainEnabled={onChainEnabled}
              />
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

        {/* Arc economy / programmable wallet */}
        <section>
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
        </>
        }
        benefits={
        <section id="benefits" className="scroll-mt-24">
          <BenefitsDashboard
            benefits={benefits}
            currency={safeProfile.preferred_stablecoin}
          />
        </section>
        }
        activity={
        <>
        {/* onchain activity feed */}
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
        </>
        }
        circles={
        <>
        {/* Your circles — rich cards linking to each dashboard */}
        <section id="my-circles" className="scroll-mt-24">
          <MyCircles circles={myCircles} />
        </section>

        {/* Community Circles marketplace */}
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
        </>
        }
        settings={
        <>
        {/* Account settings */}
        <section id="settings" className="scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account settings</CardTitle>
              <CardDescription>
                Update your name, wallet, and preferred stablecoin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm profile={safeProfile} />
            </CardContent>
          </Card>
        </section>

        {/* Notifications */}
        <section className="scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notifications</CardTitle>
              <CardDescription>
                Get circle reminders and payout alerts where you already are.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectTelegram
                initialLinked={Boolean(safeProfile.telegram_chat_id)}
              />
            </CardContent>
          </Card>
        </section>
        </>
        }
      />
      <AskArjo />
    </div>
  );
}
