"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Vault,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ARC_STABLECOINS, type ArcStablecoin } from "@/lib/arc";
import type { SavingsGoal, SavingsPlan } from "@/lib/types";
import {
  USYC_BASE_APY,
  daysBetween,
  formatYieldAmount,
  projectYield,
} from "@/lib/yield-engine";
import { goalFunding } from "@/lib/goals";
import { goalEmoji } from "@/components/dashboard/home/primary-goal-card";
import { Button } from "@/components/ui/button";

/** SafeLock APY a goal earns when funded into a locked, Treasury-backed vault. */
const GOAL_LOCK_APY = USYC_BASE_APY; // 0.08

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Project a finish date from the weekly savings rate, or fall back to the target date. */
function estimateCompletion(
  remaining: number,
  weeklyRate: number,
  targetDate: string | null
): string {
  if (remaining <= 0) return "Reached 🎉";
  if (weeklyRate > 0) {
    const weeks = Math.ceil(remaining / weeklyRate);
    const date = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
    return `~${weeks} wk${weeks === 1 ? "" : "s"} · ${date.toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" }
    )}`;
  }
  if (targetDate) {
    return `By ${new Date(targetDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return "Save to forecast";
}

/**
 * The Goals tab: an aggregate progress hero plus a card per goal (with a
 * friendly category emoji and projected finish), and an inline create form.
 *
 * Progress is the REAL money set aside for each goal — the principal (plus
 * accrued USYC yield) of the SafeLock / savings vaults linked to it — not the
 * user's whole liquid wallet. A goal therefore only advances once funds are
 * genuinely committed to it, and grows as that money earns yield.
 */
export function GoalsView({
  userId,
  goals,
  plans = [],
  balance,
  weeklyRate,
}: {
  userId: string;
  goals: SavingsGoal[];
  /** Savings plans; those linked to a goal fund its progress. */
  plans?: SavingsPlan[];
  /** Liquid wallet balance (shown as "available to allocate"). */
  balance: number;
  /** Projected USDC saved per week, from the coach. */
  weeklyRate: number;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ArcStablecoin>("USDC");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
    // Funded per goal = real linked-vault money, capped at each target.
    let totalSaved = 0;
    let totalEarned = 0;
    let totalToday = 0;
    let totalThisWeek = 0;
    let reached = 0;
    for (const g of goals) {
      const { funded, earned, earnedToday, earnedThisWeek } = goalFunding(
        g.id,
        plans
      );
      totalSaved += Math.min(funded, g.target_amount);
      totalEarned += earned;
      totalToday += earnedToday;
      totalThisWeek += earnedThisWeek;
      if (funded >= g.target_amount) reached += 1;
    }
    const pct =
      totalTarget > 0
        ? Math.min(100, Math.round((totalSaved / totalTarget) * 100))
        : 0;
    return {
      totalTarget,
      totalSaved,
      totalEarned,
      totalToday,
      totalThisWeek,
      reached,
      pct,
    };
  }, [goals, plans]);

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const target = Number(amount);
    if (name.trim().length < 2) {
      setError("Give your goal a name.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setError("Enter a target amount greater than zero.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("savings_goals").insert({
      user_id: userId,
      name: name.trim(),
      target_amount: target,
      currency,
      target_date: targetDate || null,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setAmount("");
    setTargetDate("");
    setAdding(false);
    router.refresh();
  }

  async function removeGoal(id: string) {
    setBusyId(id);
    await supabase.from("savings_goals").delete().eq("id", id);
    setBusyId(null);
    router.refresh();
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Goals</h2>
            <p className="text-sm text-muted-foreground">
              What you&apos;re saving for, and how close you are.
            </p>
          </div>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            New goal
          </Button>
        )}
      </div>

      {/* Aggregate progress hero */}
      {goals.length > 0 && (
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-br from-card to-accent/5 p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total progress
              </p>
              <p className="mt-1 text-3xl font-bold tracking-tight">
                {fmt(summary.totalSaved)}
                <span className="text-base font-medium text-muted-foreground">
                  {" "}
                  / {fmt(summary.totalTarget)} USDC
                </span>
              </p>
            </div>
            <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
              {summary.pct}%
            </span>
          </div>
          <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-primary transition-all"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Tracking {goals.length} goal{goals.length === 1 ? "" : "s"}
            {summary.reached > 0 && ` · ${summary.reached} reached`}
            {summary.totalEarned > 0 && (
              <span className="font-semibold text-emerald-500">
                · +{fmt(summary.totalEarned)} USDC yield earned
              </span>
            )}
            <span>· {fmt(balance)} USDC available to allocate</span>
          </p>
          {summary.totalToday > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-medium text-emerald-500">
                +{formatYieldAmount(summary.totalToday)} USDC today
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                +{formatYieldAmount(summary.totalThisWeek)} USDC this week
              </span>
            </p>
          )}
          <p className="mt-2 text-xs text-emerald-500">
            Fund a goal with a SafeLock to earn up to 8% APY, Treasury-backed by
            USYC — your savings grow while you reach it.
          </p>
        </div>
      )}

      {/* Create form */}
      {adding && (
        <form
          onSubmit={createGoal}
          className="space-y-3 rounded-2xl border border-primary/30 bg-background/40 p-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="goal-name" className="text-sm font-medium">
              Goal name
            </label>
            <input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New laptop"
              className={fieldClass}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="goal-amount" className="text-sm font-medium">
                Target
              </label>
              <input
                id="goal-amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="goal-currency" className="text-sm font-medium">
                Currency
              </label>
              <select
                id="goal-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as ArcStablecoin)}
                className={fieldClass}
              >
                {ARC_STABLECOINS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="goal-date" className="text-sm font-medium">
                Target date
              </label>
              <input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save goal
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
      )}

      {/* Goal cards */}
      {goals.length === 0 && !adding ? (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-accent">
            <Target className="h-6 w-6" />
          </span>
          <p className="mt-3 text-base font-semibold">No goals yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Name what you&apos;re saving for and we&apos;ll track your progress
            and forecast a finish date.
          </p>
          <Button className="mt-4" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((goal) => {
            // Real money committed to this goal (linked vault principal + yield).
            const { funded, earned, earnedToday, earnedThisWeek, count } =
              goalFunding(goal.id, plans);
            // The actual vaults funding it — shown so the goal feels like a
            // real, backed savings bucket rather than a number.
            const linkedPlans = plans.filter(
              (p) => p.goal_id === goal.id && p.status === "active"
            );
            const pct = Math.min(
              100,
              Math.round((funded / goal.target_amount) * 100)
            );
            const remaining = Math.max(0, goal.target_amount - funded);
            const done = remaining <= 0;
            // What locking the remaining amount in a SafeLock until the target
            // date would earn (daily-compounded USYC) — the incentive to fund.
            const lockDays = goal.target_date
              ? daysBetween(new Date(), goal.target_date)
              : 365;
            const projectedYield = projectYield({
              principal: remaining,
              days: lockDays,
              apy: GOAL_LOCK_APY,
            });
            return (
              <div
                key={goal.id}
                className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-xl">
                      {goalEmoji(goal.name)}
                    </span>
                    <div>
                      <p className="font-semibold leading-tight">{goal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(Math.min(funded, goal.target_amount))} /{" "}
                        {fmt(goal.target_amount)} {goal.currency}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeGoal(goal.id)}
                    disabled={busyId === goal.id}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    title="Delete goal"
                    aria-label={`Delete ${goal.name}`}
                  >
                    {busyId === goal.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs">
                  <span
                    className={
                      done
                        ? "font-semibold text-accent"
                        : "font-semibold text-foreground"
                    }
                  >
                    {pct}%
                  </span>
                  <span className="text-muted-foreground">
                    {done ? "Funded" : `${fmt(remaining)} ${goal.currency} to go`}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {estimateCompletion(remaining, weeklyRate, goal.target_date)}
                  </span>
                  {count > 0 ? (
                    <span>
                      Funded by {count} vault{count === 1 ? "" : "s"}
                      {earned > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-emerald-500">
                            +{fmt(earned)} {goal.currency} yield
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span>Not funded yet</span>
                  )}
                </div>

                {earnedToday > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-emerald-500">
                      +{formatYieldAmount(earnedToday)} {goal.currency} today
                    </span>
                    <span>·</span>
                    <span>
                      +{formatYieldAmount(earnedThisWeek)} {goal.currency} this
                      week
                    </span>
                  </p>
                )}

                {linkedPlans.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                    {linkedPlans.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Vault className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{p.name}</span>
                          {p.apy_bonus > 0 && (
                            <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-500">
                              {p.apy_bonus}%
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {fmt(p.principal)} {p.currency}
                          {p.plan_type === "locked" && p.lock_until && (
                            <>
                              {" · "}
                              {new Date(p.lock_until).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!done && projectedYield > 0 && (
                  <a
                    href="#save"
                    className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 transition-colors hover:bg-emerald-500/10"
                  >
                    <span className="text-xs leading-tight text-muted-foreground">
                      {count > 0 ? "Lock the rest" : "Open a SafeLock"} and earn{" "}
                      <span className="font-semibold text-emerald-500">
                        +{fmt(projectedYield)} {goal.currency}
                      </span>{" "}
                      {goal.target_date ? "by your target date" : "in a year"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-emerald-500">
                      Save →
                    </span>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
