"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Loader2,
  Lock,
  Plus,
  Repeat,
  Target,
  Unlock,
} from "lucide-react";

import { ARC_STABLECOINS, type ArcStablecoin } from "@/lib/arc";
import type {
  AutoCadence,
  SavingsGoal,
  SavingsPlan,
  SavingsPlanType,
} from "@/lib/types";
import {
  LOCK_TIERS,
  accrueYield,
  daysBetween,
  effectiveApy,
  formatYieldAmount,
  lockApyPct,
  periodYield,
  projectYield,
} from "@/lib/yield-engine";
import { goalEmoji } from "@/components/dashboard/home/primary-goal-card";
import { Button } from "@/components/ui/button";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Per-plan-type presentation. `apy` MUST match APY_BONUS in
 * app/api/savings/lock/route.ts (target 4 / auto 2 / flex 0) so the rate shown
 * at decision time is the rate actually credited. SafeLock is duration-tiered
 * (LOCK_TIERS); its entry here is the ladder's top rate for the type cards,
 * and the create-form preview recomputes from the chosen date.
 */
const PLAN_META: Record<
  SavingsPlanType,
  {
    label: string;
    icon: React.ReactNode;
    tint: string;
    apy: number;
    tagline: string;
    /** Cowrywise-style cover gradient for the plan card's header strip. */
    cover: string;
  }
> = {
  locked: {
    label: "SafeLock",
    icon: <Lock className="h-4 w-4" />,
    tint: "bg-primary/15 text-primary",
    apy: 8,
    tagline: "Highest yield · fixed term",
    cover: "from-primary/30 via-primary/15 to-accent/20",
  },
  target: {
    label: "Target",
    icon: <Target className="h-4 w-4" />,
    tint: "bg-accent/15 text-accent-foreground",
    apy: 4,
    tagline: "Save toward an amount",
    cover: "from-accent/30 via-accent/15 to-sky-500/20",
  },
  auto: {
    label: "Auto-save",
    icon: <Repeat className="h-4 w-4" />,
    tint: "bg-primary/15 text-primary",
    apy: 2,
    tagline: "Set-and-forget recurring",
    cover: "from-emerald-500/25 via-emerald-500/10 to-primary/15",
  },
  flex: {
    label: "Flexible",
    icon: <Unlock className="h-4 w-4" />,
    tint: "bg-secondary text-muted-foreground",
    apy: 0,
    tagline: "Withdraw anytime · no lock",
    cover: "from-secondary via-secondary/60 to-secondary/30",
  },
};

export function SavingsPlans({
  plans,
  goals = [],
  onChainEnabled,
}: {
  plans: SavingsPlan[];
  /** The user's goals — a new plan can be tagged to fund one. */
  goals?: SavingsGoal[];
  /** True when Circle wallets are configured + the user has a wallet. */
  onChainEnabled: boolean;
}) {
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [planType, setPlanType] = useState<SavingsPlanType>("locked");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ArcStablecoin>("USDC");
  const [lockUntil, setLockUntil] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [autoCadence, setAutoCadence] = useState<AutoCadence>("weekly");
  const [autoAmount, setAutoAmount] = useState("");
  const [goalId, setGoalId] = useState("");

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = plans.filter((p) => p.status === "active");

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (name.trim().length < 2) {
      setError("Give your plan a name.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/savings/lock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        planType,
        amount: Number(amount),
        currency,
        lockUntil: planType === "locked" ? lockUntil || null : null,
        targetAmount:
          planType === "target" && targetAmount ? Number(targetAmount) : null,
        autoCadence: planType === "auto" ? autoCadence : null,
        autoAmount: planType === "auto" ? Number(autoAmount) : null,
        goalId: goalId || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not create the plan.");
      return;
    }
    if (json.pending) {
      setNotice(
        "Plan created. onchain transfer is pending — fund your Arc wallet and it will settle."
      );
    } else if (json.transfer) {
      setNotice("Plan created and USDC moved onchain.");
    } else {
      setNotice("Plan created.");
    }
    setName("");
    setAmount("");
    setLockUntil("");
    setTargetAmount("");
    setAutoAmount("");
    setGoalId("");
    setAdding(false);
    router.refresh();
  }

  async function withdraw(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/savings/${id}/withdraw`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error ?? "Withdrawal failed.");
      return;
    }
    const parts: string[] = [`Withdrew ${fmt(json.payout)} ${json.plan?.currency ?? "USDC"}`];
    if (json.penalty > 0) parts.push(`(−${fmt(json.penalty)} early-exit penalty)`);
    if (json.bonus > 0) parts.push(`(+${fmt(json.bonus)} yield bonus)`);
    setNotice(parts.join(" "));
    router.refresh();
  }

  async function assignGoal(id: string, newGoalId: string) {
    setError(null);
    setNotice(null);
    setBusyId(id);
    const res = await fetch(`/api/savings/${id}/goal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goalId: newGoalId || null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error ?? "Could not update the goal link.");
      return;
    }
    const goalName = goals.find((g) => g.id === newGoalId)?.name;
    setNotice(
      newGoalId
        ? `Vault now funds "${goalName}".`
        : "Vault unlinked from its goal."
    );
    router.refresh();
  }

  async function runNow(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/savings/${id}/run`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error ?? "Auto-save run failed.");
      return;
    }
    setNotice(
      json.pending
        ? `Auto-saved ${fmt(json.amount)} — transfer pending.`
        : `Auto-saved ${fmt(json.amount)} into the vault.`
    );
    router.refresh();
  }

  const isDue = (p: SavingsPlan) =>
    p.plan_type === "auto" &&
    p.next_run_at !== null &&
    new Date(p.next_run_at) <= new Date();

  // Live earnings preview for the create form — shows the saver exactly what
  // their deposit is projected to earn before they commit. Uses the same
  // daily-compounded USYC model the vault credits on withdrawal.
  const previewMeta = PLAN_META[planType];
  const previewPrincipal =
    planType === "auto" ? Number(autoAmount) : Number(amount);
  // Horizon: SafeLock uses the chosen lock term; everything else projects 1 yr.
  const previewDays =
    planType === "locked" && lockUntil
      ? daysBetween(new Date(), lockUntil)
      : 365;
  // SafeLock rate depends on the chosen duration (LOCK_TIERS ladder).
  const previewApyPct =
    planType === "locked"
      ? lockUntil
        ? lockApyPct(previewDays)
        : 0
      : previewMeta.apy;
  const previewApy = effectiveApy(previewApyPct);
  const previewYield =
    previewApyPct > 0 &&
    Number.isFinite(previewPrincipal) &&
    previewPrincipal > 0
      ? projectYield({
          principal: previewPrincipal,
          days: previewDays,
          apy: previewApy,
        })
      : 0;

  return (
    <div className="space-y-4">
      {!onChainEnabled && (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          onchain transfers are off (no wallet or Circle keys). Plans are still
          tracked; deposits stay pending until a funded Arc wallet is connected.
        </p>
      )}

      {active.length > 0 && (
        <ul className="space-y-3">
          {active.map((p) => {
            const meta = PLAN_META[p.plan_type];
            const due = isDue(p);
            const apy = effectiveApy(p.apy_bonus);
            // Live, daily-compounded yield earned so far on this principal.
            const earnedSoFar =
              p.apy_bonus > 0 && p.principal > 0
                ? accrueYield({ principal: p.principal, from: p.created_at, apy })
                : 0;
            // Per-period detail: what this vault made today / over the last week.
            const earnedToday =
              p.apy_bonus > 0 && p.principal > 0
                ? periodYield({
                    principal: p.principal,
                    from: p.created_at,
                    windowDays: 1,
                    apy,
                  })
                : 0;
            const earnedWeek =
              p.apy_bonus > 0 && p.principal > 0
                ? periodYield({
                    principal: p.principal,
                    from: p.created_at,
                    windowDays: 7,
                    apy,
                  })
                : 0;
            // For a fixed-term SafeLock, the projected yield at maturity.
            const projectedAtMaturity =
              p.plan_type === "locked" && p.lock_until && p.principal > 0
                ? projectYield({
                    principal: p.principal,
                    days: daysBetween(p.created_at, p.lock_until),
                    apy,
                  })
                : 0;
            // SafeLock term progress: how far through the lock the saver is.
            const termDays =
              p.plan_type === "locked" && p.lock_until
                ? daysBetween(p.created_at, p.lock_until)
                : 0;
            const termElapsed =
              p.plan_type === "locked" && p.lock_until
                ? daysBetween(p.created_at)
                : 0;
            const termPct =
              termDays > 0
                ? Math.min(100, Math.round((termElapsed / termDays) * 100))
                : 0;
            const daysLeft =
              termDays > 0 ? Math.max(0, Math.ceil(termDays - termElapsed)) : 0;
            // Target progress: balance vs the amount being saved toward.
            const targetPct =
              p.plan_type === "target" && p.target_amount && p.target_amount > 0
                ? Math.min(
                    100,
                    Math.round((p.principal / p.target_amount) * 100)
                  )
                : 0;
            return (
              <li
                key={p.id}
                className="overflow-hidden rounded-2xl border border-border bg-secondary/30"
              >
                {/* Cover strip — Cowrywise-style plan identity at a glance. */}
                <div
                  className={`flex items-center justify-between gap-3 bg-gradient-to-r px-4 py-3 ${meta.cover}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/60 text-xl backdrop-blur-sm">
                      {goalEmoji(p.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{p.name}</p>
                        {p.apy_bonus > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                            {p.apy_bonus}% APY
                          </span>
                        )}
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {meta.icon}
                        {meta.label} · {fmt(p.principal)} {p.currency}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {p.plan_type === "auto" ? (
                      <Button
                        size="sm"
                        variant={due ? "default" : "outline"}
                        disabled={busyId === p.id || !due}
                        onClick={() => runNow(p.id)}
                      >
                        {busyId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Repeat className="h-4 w-4" />
                        )}
                        {due ? "Run now" : "Scheduled"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === p.id}
                        onClick={() => withdraw(p.id)}
                      >
                        {busyId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlock className="h-4 w-4" />
                        )}
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>

                <div className="p-4 pt-3">
                {/* SafeLock: progress through the lock term. */}
                {p.plan_type === "locked" && termDays > 0 && (
                  <div className="mb-3 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                        style={{ width: `${termPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {termPct}% through the lock ·{" "}
                      {daysLeft > 0 ? `${daysLeft} days to maturity` : "matured 🎉"}
                    </p>
                  </div>
                )}
                {/* Target: progress toward the amount. */}
                {p.plan_type === "target" && (p.target_amount ?? 0) > 0 && (
                  <div className="mb-3 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-sky-400 transition-all"
                        style={{ width: `${targetPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {targetPct}% of {fmt(p.target_amount ?? 0)} {p.currency}
                      {targetPct >= 100 ? " — target reached 🎉" : ""}
                    </p>
                  </div>
                )}
                {p.apy_bonus > 0 && (
                  <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Yield earned so far
                        </p>
                        <p className="text-sm font-semibold text-emerald-500">
                          +{fmt(earnedSoFar)} {p.currency}
                        </p>
                      </div>
                      {projectedAtMaturity > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Projected at maturity
                          </p>
                          <p className="text-sm font-semibold">
                            {fmt(p.principal + projectedAtMaturity)} {p.currency}
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Per-period detail — what this vault made today / this week. */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-emerald-500/10 pt-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-emerald-500">
                        +{formatYieldAmount(earnedToday)} {p.currency} today
                      </span>
                      <span>·</span>
                      <span>
                        +{formatYieldAmount(earnedWeek)} {p.currency} this week
                      </span>
                    </p>
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {p.plan_type === "locked" && p.lock_until && (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Locked until{" "}
                      {formatDate(p.lock_until)}
                    </span>
                  )}
                  {p.plan_type === "auto" && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {fmt(p.auto_amount ?? 0)} {p.currency} {p.auto_cadence} ·
                      next {formatDate(p.next_run_at)}
                    </span>
                  )}
                  {p.plan_type === "target" && p.target_amount && (
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3 w-3" /> Target{" "}
                      {fmt(p.target_amount)} {p.currency}
                    </span>
                  )}
                </div>

                {goals.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <label htmlFor={`goal-${p.id}`} className="sr-only">
                      Fund a goal
                    </label>
                    <select
                      id={`goal-${p.id}`}
                      value={p.goal_id ?? ""}
                      disabled={busyId === p.id}
                      onChange={(e) => assignGoal(p.id, e.target.value)}
                      className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">Not funding a goal</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          Funds: {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {active.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No savings plans yet. Open a SafeLock vault to earn a yield bonus, or
            automate weekly savings.
          </p>
        </div>
      )}

      {notice && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {adding ? (
        <form
          onSubmit={createPlan}
          className="space-y-3 rounded-xl border border-border bg-background/40 p-4"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["locked", "target", "auto", "flex"] as SavingsPlanType[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPlanType(t)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                    planType === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {PLAN_META[t].icon}
                  {PLAN_META[t].label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold ${
                      PLAN_META[t].apy > 0
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {t === "locked"
                      ? "up to 8% APY"
                      : PLAN_META[t].apy > 0
                      ? `${PLAN_META[t].apy}% APY`
                      : "0% APY"}
                  </span>
                </button>
              )
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="plan-name" className="text-sm font-medium">
              Plan name
            </label>
            <input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                planType === "auto" ? "Weekly auto-save" : "House deposit vault"
              }
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {goals.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="plan-goal" className="text-sm font-medium">
                Fund a goal{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <select
                id="plan-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No goal — just save</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · target {fmt(g.target_amount)} {g.currency}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Tagging a goal counts this vault toward it, so progress reflects
                money actually set aside and earning yield.
              </p>
            </div>
          )}

          {planType === "auto" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="auto-amount" className="text-sm font-medium">
                  Amount
                </label>
                <input
                  id="auto-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={autoAmount}
                  onChange={(e) => setAutoAmount(e.target.value)}
                  placeholder="25"
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="auto-cadence" className="text-sm font-medium">
                  Every
                </label>
                <select
                  id="auto-cadence"
                  value={autoCadence}
                  onChange={(e) =>
                    setAutoCadence(e.target.value as AutoCadence)
                  }
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="auto-currency" className="text-sm font-medium">
                  Currency
                </label>
                <select
                  id="auto-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as ArcStablecoin)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ARC_STABLECOINS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="plan-amount" className="text-sm font-medium">
                  Deposit
                </label>
                <input
                  id="plan-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="plan-currency" className="text-sm font-medium">
                  Currency
                </label>
                <select
                  id="plan-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as ArcStablecoin)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ARC_STABLECOINS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {planType === "locked" && (
                <div className="space-y-1.5">
                  <label htmlFor="lock-until" className="text-sm font-medium">
                    Lock until
                  </label>
                  <input
                    id="lock-until"
                    type="date"
                    value={lockUntil}
                    onChange={(e) => setLockUntil(e.target.value)}
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
              {planType === "target" && (
                <div className="space-y-1.5">
                  <label htmlFor="target-amount" className="text-sm font-medium">
                    Target
                  </label>
                  <input
                    id="target-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    placeholder="1000"
                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          )}

          {/* SafeLock rate ladder — longer lock, higher pass-through. */}
          {planType === "locked" && (
            <div className="grid grid-cols-4 gap-1.5">
              {[...LOCK_TIERS].reverse().map((tier) => {
                const active =
                  Boolean(lockUntil) && lockApyPct(previewDays) === tier.apyPct;
                return (
                  <div
                    key={tier.minDays}
                    className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                      active
                        ? "border-emerald-500/60 bg-emerald-500/10"
                        : "border-border/60 bg-card"
                    }`}
                  >
                    <p
                      className={`text-sm font-bold ${
                        active ? "text-emerald-500" : "text-foreground"
                      }`}
                    >
                      {tier.apyPct}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {tier.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live earnings preview — what this deposit is projected to earn. */}
          {previewMeta.apy > 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {previewMeta.label} earns
                </span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                  {planType === "locked"
                    ? lockUntil
                      ? `${previewApyPct}% APY · USYC`
                      : "5–8% APY · pick a date"
                    : `${previewMeta.apy}% APY · USYC`}
                </span>
              </div>
              {previewYield > 0 ? (
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {planType === "locked"
                        ? "Projected yield at maturity"
                        : planType === "auto"
                        ? "Projected yield (per contribution, 1 yr)"
                        : "Projected yield (1 yr)"}
                    </p>
                    <p className="text-lg font-bold text-emerald-500">
                      +{fmt(previewYield)} {currency}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Projected total
                    </p>
                    <p className="text-sm font-semibold">
                      {fmt(previewPrincipal + previewYield)} {currency}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {planType === "locked"
                    ? "Enter a deposit and lock-until date to preview your Treasury-backed yield."
                    : "Enter a deposit to preview your Treasury-backed yield."}
                </p>
              )}
              {planType === "locked" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Yield is daily-compounded and paid on maturity. Early
                  withdrawal forfeits the bonus and incurs a 10% penalty.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Flexible savings stays fully liquid and earns 0% APY. Choose
              SafeLock to earn up to 8% APY, Treasury-backed by USYC.
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create plan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          New savings plan
        </Button>
      )}
    </div>
  );
}
