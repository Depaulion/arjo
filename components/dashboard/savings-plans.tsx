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
  SavingsPlan,
  SavingsPlanType,
} from "@/lib/types";
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

const PLAN_META: Record<
  SavingsPlanType,
  { label: string; icon: React.ReactNode; tint: string }
> = {
  locked: {
    label: "SafeLock",
    icon: <Lock className="h-4 w-4" />,
    tint: "bg-primary/15 text-primary",
  },
  target: {
    label: "Target",
    icon: <Target className="h-4 w-4" />,
    tint: "bg-accent/15 text-accent-foreground",
  },
  auto: {
    label: "Auto-save",
    icon: <Repeat className="h-4 w-4" />,
    tint: "bg-primary/15 text-primary",
  },
  flex: {
    label: "Flexible",
    icon: <Unlock className="h-4 w-4" />,
    tint: "bg-secondary text-muted-foreground",
  },
};

export function SavingsPlans({
  plans,
  onChainEnabled,
}: {
  plans: SavingsPlan[];
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
        "Plan created. On-chain transfer is pending — fund your Arc wallet and it will settle."
      );
    } else if (json.transfer) {
      setNotice("Plan created and USDC moved on-chain.");
    } else {
      setNotice("Plan created.");
    }
    setName("");
    setAmount("");
    setLockUntil("");
    setTargetAmount("");
    setAutoAmount("");
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

  return (
    <div className="space-y-4">
      {!onChainEnabled && (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          On-chain transfers are off (no wallet or Circle keys). Plans are still
          tracked; deposits stay pending until a funded Arc wallet is connected.
        </p>
      )}

      {active.length > 0 && (
        <ul className="space-y-3">
          {active.map((p) => {
            const meta = PLAN_META[p.plan_type];
            const due = isDue(p);
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-secondary/30 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.tint}`}
                    >
                      {meta.icon}
                    </span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {fmt(p.principal)} {p.currency}
                        {p.apy_bonus > 0 ? ` · ${p.apy_bonus}% bonus` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
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

          {planType === "locked" && (
            <p className="text-xs text-muted-foreground">
              SafeLock earns an 8% APY bonus on maturity. Early withdrawal incurs
              a 10% penalty.
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
