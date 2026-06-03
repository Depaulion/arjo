"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Target, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ARC_STABLECOINS, type ArcStablecoin } from "@/lib/arc";
import type { SavingsGoal } from "@/lib/types";
import { Button } from "@/components/ui/button";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function estimateCompletion(
  remaining: number,
  weeklyRate: number,
  targetDate: string | null
): string {
  if (remaining <= 0) return "Goal reached 🎉";
  if (weeklyRate > 0) {
    const weeks = Math.ceil(remaining / weeklyRate);
    const date = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
    return `~${weeks} week${weeks === 1 ? "" : "s"} (${date.toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric", year: "numeric" }
    )})`;
  }
  if (targetDate) {
    return `Target ${new Date(targetDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return "Start contributing to project a date";
}

export function GoalTracker({
  userId,
  goals,
  balance,
  weeklyRate,
}: {
  userId: string;
  goals: SavingsGoal[];
  /** Current saved amount used to compute progress. */
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

  const totalTarget = useMemo(
    () => goals.reduce((s, g) => s + g.target_amount, 0),
    [goals]
  );

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

  return (
    <div className="space-y-4">
      {goals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Tracking {goals.length} goal{goals.length === 1 ? "" : "s"} worth{" "}
          <span className="font-semibold text-foreground">
            {fmt(totalTarget)} USDC
          </span>{" "}
          in total.
        </p>
      )}

      <ul className="space-y-3">
        {goals.map((goal) => {
          const pct = Math.min(
            100,
            Math.round((balance / goal.target_amount) * 100)
          );
          const remaining = Math.max(0, goal.target_amount - balance);
          return (
            <li
              key={goal.id}
              className="rounded-xl border border-border bg-secondary/30 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Target className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold">{goal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(balance)} / {fmt(goal.target_amount)} {goal.currency}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeGoal(goal.id)}
                  disabled={busyId === goal.id}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  title="Delete goal"
                >
                  {busyId === goal.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{pct}%</span>
                <span>
                  {remaining > 0
                    ? `${fmt(remaining)} ${goal.currency} to go`
                    : "Funded"}
                </span>
                <span>
                  {estimateCompletion(remaining, weeklyRate, goal.target_date)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {goals.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No goals yet. Set a target and the coach will project your finish date.
          </p>
        </div>
      )}

      {adding ? (
        <form
          onSubmit={createGoal}
          className="space-y-3 rounded-xl border border-border bg-background/40 p-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="goal-name" className="text-sm font-medium">
              Goal name
            </label>
            <input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergency fund"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
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
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          New goal
        </Button>
      )}
    </div>
  );
}
