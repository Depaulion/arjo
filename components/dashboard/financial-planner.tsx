"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

import { ARC_STABLECOINS, type ArcStablecoin } from "@/lib/arc";
import type { FinancialPlan, RiskAppetite } from "@/lib/financial-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const RISKS: { value: RiskAppetite; label: string }[] = [
  { value: "cautious", label: "Cautious" },
  { value: "balanced", label: "Balanced" },
  { value: "ambitious", label: "Ambitious" },
];

export function FinancialPlanner({
  currency = "USDC",
}: {
  currency?: ArcStablecoin;
}) {
  const router = useRouter();

  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState("");
  const [risk, setRisk] = useState<RiskAppetite>("balanced");
  const [cur, setCur] = useState<ArcStablecoin>(currency);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<FinancialPlan | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/planner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        monthlyIncome: Number(income),
        monthlyExpenses: Number(expenses),
        goalAmount: Number(goal),
        horizonMonths: horizon ? Number(horizon) : undefined,
        risk,
        currency: cur,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not build a plan.");
      return;
    }
    setPlan(json.plan as FinancialPlan);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={generate} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="fp-income" className="text-sm font-medium">
              Monthly income
            </label>
            <input
              id="fp-income"
              type="number"
              min="0"
              step="0.01"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="2000"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fp-expenses" className="text-sm font-medium">
              Monthly expenses
            </label>
            <input
              id="fp-expenses"
              type="number"
              min="0"
              step="0.01"
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
              placeholder="1200"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fp-goal" className="text-sm font-medium">
              Goal amount
            </label>
            <input
              id="fp-goal"
              type="number"
              min="1"
              step="0.01"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="10000"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fp-horizon" className="text-sm font-medium">
              Target months{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="fp-horizon"
              type="number"
              min="1"
              step="1"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              placeholder="12"
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Risk appetite</span>
            <div className="flex gap-1.5">
              {RISKS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRisk(r.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    risk === r.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fp-currency" className="text-sm font-medium">
              Currency
            </label>
            <select
              id="fp-currency"
              value={cur}
              onChange={(e) => setCur(e.target.value as ArcStablecoin)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ARC_STABLECOINS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Build my plan
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {plan && (
        <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Your plan
            </p>
            <Badge variant={plan.source === "ai" ? "accent" : "outline"}>
              {plan.source === "ai" ? "Claude" : "Smart engine"}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">{plan.summary}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-background/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Save / month</p>
              <p className="mt-1 text-lg font-bold">
                {fmt(plan.recommendedMonthly)}{" "}
                <span className="text-xs font-medium text-muted-foreground">
                  {plan.currency}
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-background/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Savings rate</p>
              <p className="mt-1 text-lg font-bold">
                {Math.round(plan.savingsRate * 100)}%
              </p>
            </div>
            <div className="rounded-xl bg-background/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Reach goal in</p>
              <p className="mt-1 text-lg font-bold">
                {plan.monthsToGoal || "—"}{" "}
                <span className="text-xs font-medium text-muted-foreground">
                  mo
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-background/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Bonus earned</p>
              <p className="mt-1 text-lg font-bold">
                {fmt(plan.projectedBonus)}{" "}
                <span className="text-xs font-medium text-muted-foreground">
                  {plan.currency}
                </span>
              </p>
            </div>
          </div>

          {/* Split */}
          <div className="space-y-2">
            {plan.split.map((s) => (
              <div key={s.bucket}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">
                    {fmt(s.monthly)} {plan.currency}/mo ·{" "}
                    {Math.round(s.share * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${Math.round(s.share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.rationale}
                </p>
              </div>
            ))}
          </div>

          {plan.recommendations.length > 0 && (
            <ul className="space-y-1.5">
              {plan.recommendations.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
