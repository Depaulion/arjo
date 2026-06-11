import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  PiggyBank,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

import {
  arcAddressUrl,
  arcTxUrl,
  isEvmAddress,
  shortenHex,
} from "@/lib/arc";
import {
  getCircleLedger,
  getCircleLedgerFromDb,
  type CircleLedgerInput,
} from "@/lib/circle-ledger";
import { knownVaultAddress } from "@/lib/vault";
import { createClient } from "@/lib/supabase/server";
import { CIRCLE_FREQUENCIES, type Circle } from "@/lib/types";
import type { AnalysisMember } from "@/lib/circle-analysis";
import { getGovernanceData, type GovernanceData } from "@/lib/governance";
import { CircleInsights } from "@/components/circles/circle-insights";
import { CircleTabs } from "@/components/circles/circle-tabs";
import { ContributeButton } from "@/components/circles/contribute-button";
import { AutoDebitToggle } from "@/components/circles/auto-debit-toggle";
import { GovernancePanel } from "@/components/circles/governance-panel";
import { PayoutButton } from "@/components/circles/payout-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function formatUsdc(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addressInitials(address: string) {
  return address.slice(2, 4).toUpperCase();
}

function demoAddress(): string | null {
  const candidate = process.env.ARC_DEMO_ADDRESS;
  return candidate && isEvmAddress(candidate) ? candidate.toLowerCase() : null;
}

/**
 * Resolve which Arc wallet acts as this circle's pot:
 *  1. the route id itself, if it's an EVM address (view any address directly);
 *  2. the shared platform vault — the pot now lives there, not in the creator's
 *     wallet, so members never trust the creator to custody the pool;
 *  3. an optional ARC_DEMO_ADDRESS fallback for local exploration.
 */
async function resolveCircle(id: string): Promise<CircleLedgerInput> {
  if (isEvmAddress(id)) {
    return { id, name: "Arc circle", address: id.toLowerCase() };
  }

  try {
    const supabase = createClient();
    const { data: circle } = await supabase
      .from("circles")
      .select("*")
      .eq("id", id)
      .single<Circle>();

    if (circle) {
      return {
        id,
        name: circle.name,
        address: knownVaultAddress() ?? demoAddress(),
        currency: circle.currency,
        contributionAmount: circle.contribution_amount,
        frequency: circle.frequency,
        memberCount: circle.member_count,
        currentRound: circle.current_round ?? null,
        totalRounds: circle.total_rounds ?? null,
        roundDueAt: circle.round_due_at ?? null,
      };
    }
  } catch {
    // Supabase unavailable (e.g. placeholder creds) — fall through to demo.
  }

  return { id, name: "Demo circle", address: demoAddress() };
}

export default async function CircleDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  const input = await resolveCircle(params.id);
  const isRealCircle = !isEvmAddress(params.id);

  // Real circles read pot/contributors/activity from the ledger (per-circle
  // attribution in the shared vault); raw-address views still scan on-chain.
  const data = isRealCircle
    ? await getCircleLedgerFromDb(createClient(), input)
    : await getCircleLedger(input);

  // Is the current viewer the circle's creator (the pot owner)? Only they can
  // trigger a rotating payout. Skipped for raw-address views. Also load the
  // governance data (members, proposals, votes) for the Governance tab.
  let isCreator = false;
  let userId: string | null = null;
  let governance: GovernanceData | null = null;
  let isMember = false;
  let myAutoDebit = false;
  if (isRealCircle) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      if (user) {
        const { data: row } = await supabase
          .from("circles")
          .select("created_by")
          .eq("id", params.id)
          .single<{ created_by: string }>();
        isCreator = row?.created_by === user.id;

        // The viewer's own membership drives the auto-debit opt-in control.
        const { data: myMember } = await supabase
          .from("circle_members")
          .select("auto_debit")
          .eq("circle_id", params.id)
          .eq("user_id", user.id)
          .maybeSingle<{ auto_debit: boolean }>();
        isMember = Boolean(myMember);
        myAutoDebit = myMember?.auto_debit ?? false;
      }
      governance = await getGovernanceData(supabase, params.id, userId);
    } catch {
      // Supabase unavailable — treat as non-creator (hide payout control).
    }
  }

  const frequencyLabel = data.frequency
    ? CIRCLE_FREQUENCIES.find((f) => f.value === data.frequency)?.label ??
      data.frequency
    : null;

  const targetPot =
    data.contributionAmount && data.memberCount
      ? data.contributionAmount * data.memberCount
      : null;
  const potPct = targetPot
    ? Math.min(100, Math.round((data.potBalance / targetPot) * 100))
    : null;

  // Derive payment-reliability data for the AI analysis from on-chain
  // contributors: rounds elapsed ≈ the most active contributor's transfer
  // count, and each contributor's reliability = their transfers / rounds.
  const roundsElapsed = data.contributors.reduce(
    (max, c) => Math.max(max, c.count),
    0
  );
  const analysisMembers: AnalysisMember[] = data.contributors.map((c) => ({
    id: shortenHex(c.address),
    contribution: data.contributionAmount ?? (c.count > 0 ? c.total / c.count : 0),
    paidCount: c.count,
    totalRounds: roundsElapsed,
  }));

  // The "Overview" panel — the live on-chain dashboard. Shared by both the
  // tabbed (real circle) and plain (raw-address) layouts.
  // Rotation round status (migration 0020). Shown for real circles that carry
  // round data; raw-address views leave these null.
  const roundDue = data.roundDueAt ? new Date(data.roundDueAt) : null;
  const roundOverdue = roundDue ? roundDue.getTime() < Date.now() : false;

  const overviewBody = (
    <>
      {/* Current rotation round + contribution deadline */}
      {isRealCircle && data.currentRound && data.totalRounds && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm ${
            roundOverdue
              ? "border-destructive/40 bg-destructive/5"
              : "border-border bg-secondary/40"
          }`}
        >
          <span className="font-medium">
            Round {data.currentRound} of {data.totalRounds}
          </span>
          {roundDue && (
            <span
              className={
                roundOverdue ? "text-destructive" : "text-muted-foreground"
              }
            >
              {roundOverdue ? "Contributions overdue · " : "Contributions due "}
              {formatDateTime(data.roundDueAt)}
            </span>
          )}
        </div>
      )}

      {/* Contribute to the pot (only for real circles, not raw-address views) */}
      {isRealCircle && (
        <div className="space-y-3">
          <ContributeButton
            circleId={params.id}
            defaultAmount={data.contributionAmount}
            currency={data.currency}
          />
          {/* Members can opt into automatic per-round contributions. */}
          {isMember && (
            <AutoDebitToggle
              circleId={params.id}
              initialEnabled={myAutoDebit}
            />
          )}
          {/* The rotating payout — the defining Ajo action, creator only. */}
          {isCreator && (
            <PayoutButton
              circleId={params.id}
              potTarget={targetPot}
              currency={data.currency}
            />
          )}
        </div>
      )}

      {/* Not configured / RPC error banners */}
      {!data.configured && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No Arc wallet is linked to this circle yet. Once the creator&apos;s
            Circle wallet is provisioned, contributions made in USDC on Arc
            Testnet will appear here automatically.
          </CardContent>
        </Card>
      )}
      {data.configured && !data.rpcOk && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 text-center text-sm text-destructive">
            Couldn&apos;t reach the Arc Testnet RPC to load on-chain activity.
            Try refreshing in a moment.
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Current pot */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current pot</span>
              <PiggyBank className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">
              {formatUsdc(data.potBalance)}{" "}
              <span className="text-base font-medium text-muted-foreground">
                {data.currency}
              </span>
            </p>
            {potPct !== null ? (
              <>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${potPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {potPct}% of {formatUsdc(targetPot ?? 0)} {data.currency} target
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Live on-chain USDC balance
              </p>
            )}
          </CardContent>
        </Card>

        {/* Contributors */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Contributors
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">
              {data.contributors.length}
            </p>
            {data.contributors.length > 0 ? (
              <div className="mt-3 flex -space-x-2">
                {data.contributors.slice(0, 6).map((c) => (
                  <span
                    key={c.address}
                    title={c.address}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary/15 text-[10px] font-bold text-primary"
                  >
                    {addressInitials(c.address)}
                  </span>
                ))}
                {data.contributors.length > 6 && (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold text-muted-foreground">
                    +{data.contributors.length - 6}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Unique addresses funding the pot
              </p>
            )}
          </CardContent>
        </Card>

        {/* Contributions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Contributions
              </span>
              <ArrowDownLeft className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">
              {data.contributionCount}
              <span className="text-base font-medium text-muted-foreground">
                {" "}
                in
              </span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatUsdc(data.totalContributed)} {data.currency} received
            </p>
          </CardContent>
        </Card>

        {/* Last payout */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last payout</span>
              <Trophy className="h-4 w-4 text-accent" />
            </div>
            {data.lastPayout ? (
              <>
                <p className="mt-2 truncate font-mono text-xl font-bold">
                  {shortenHex(data.lastPayout.counterparty)}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatUsdc(data.lastPayout.amount)} {data.currency} ·{" "}
                  {formatDateTime(data.lastPayout.timestamp)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-bold">—</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  No payouts sent yet
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent USDC transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent USDC transactions</CardTitle>
          <CardDescription>
            Live USDC transfers on Arc Testnet for this circle&apos;s pot
            wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.transfers.length > 0 ? (
            <ul className="divide-y divide-border">
              {data.transfers.map((t) => {
                const incoming = t.direction === "in";
                return (
                  <li
                    key={`${t.txHash}-${t.logIndex}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          incoming
                            ? "bg-primary/10 text-primary"
                            : "bg-accent/15 text-accent-foreground"
                        }`}
                      >
                        {incoming ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <p className="font-medium">
                          {incoming ? "Contribution" : "Payout"}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {incoming ? "from" : "to"}{" "}
                            {shortenHex(t.counterparty)}
                          </span>
                        </p>
                        <a
                          href={arcTxUrl(t.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          {formatDateTime(t.timestamp)} · {shortenHex(t.txHash)}
                        </a>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        incoming ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {incoming ? "+" : "−"}
                      {formatUsdc(t.amount)} {data.currency}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {data.configured && data.rpcOk
                  ? "No USDC activity found in the scanned window yet."
                  : "No on-chain activity to show."}
              </p>
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Get testnet USDC from the Circle faucet →
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI insights */}
      <CircleInsights
        members={analysisMembers}
        currency={data.currency}
        name={data.name}
      />

      <p className="text-center text-xs text-muted-foreground">
        {data.rpcOk && data.scannedFromBlock !== null
          ? `Live data from Arc Testnet · scanned blocks ${data.scannedFromBlock.toLocaleString()}–${data.latestBlock?.toLocaleString()}.`
          : "Connect a funded Arc wallet to see live USDC contributions."}
      </p>
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            <span className="tracking-tight">
              Ar<span className="text-primary">jo</span>
            </span>
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to account
          </Link>
        </div>
      </header>

      <main className="container max-w-5xl space-y-6 py-10">
        {/* Title */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              {data.address ? (
                <a
                  href={arcAddressUrl(data.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {shortenHex(data.address, 10, 8)}
                </a>
              ) : (
                <span className="text-sm">No pot wallet linked yet</span>
              )}
              {frequencyLabel && (
                <span className="text-sm">
                  · {formatUsdc(data.contributionAmount ?? 0)} {data.currency} ·{" "}
                  {frequencyLabel} · {data.memberCount} members
                </span>
              )}
            </p>
          </div>
          <Badge variant={data.rpcOk ? "accent" : "outline"}>
            {data.rpcOk ? "Live · Arc Testnet" : "Arc Testnet"}
          </Badge>
        </div>

        {isRealCircle && governance ? (
          <CircleTabs
            proposalCount={governance.proposals.length}
            overview={<div className="space-y-6">{overviewBody}</div>}
            governance={
              <GovernancePanel
                circleId={params.id}
                currentUserId={userId}
                members={governance.members}
                proposals={governance.proposals}
                isMember={governance.isMember}
                isCreator={governance.isCreator}
                currency={data.currency}
                contributionAmount={data.contributionAmount ?? 0}
              />
            }
          />
        ) : (
          <div className="space-y-6">{overviewBody}</div>
        )}
      </main>
    </div>
  );
}
