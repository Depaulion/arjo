"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Loader2 } from "lucide-react";

import { lockApyPct } from "@/lib/yield-engine";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LOCK_OPTIONS = [30, 90, 180] as const;

/**
 * Savings Agent — an opt-in agent that keeps the wallet at a liquid floor and
 * autonomously sweeps surplus USDC into a SafeLock (yield) each day. The floor
 * is the spending policy the agent must respect (never sweeps below it), mirror-
 * ing Circle Agent Stack's model. Reads/writes the policy via /api/agent.
 */
export function SavingsAgent({ currency = "USDC" }: { currency?: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [floor, setFloor] = useState("20");
  const [lockDays, setLockDays] = useState<number>(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then((j) => {
        setEnabled(Boolean(j.enabled));
        if (typeof j.liquidFloor === "number") setFloor(String(j.liquidFloor));
        if (typeof j.lockDays === "number") setLockDays(j.lockDays);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const apy = lockApyPct(lockDays);

  async function save(nextEnabled: boolean) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: nextEnabled,
        liquidFloor: Number(floor) || 0,
        lockDays,
        minSweep: 1,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      return;
    }
    setEnabled(nextEnabled);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  return (
    <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold leading-tight">Savings Agent</p>
            <p className="text-xs text-muted-foreground">
              Auto-invests your idle cash so it never sits still.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            enabled
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-secondary text-muted-foreground"
          )}
        >
          {enabled ? "On" : "Off"}
        </span>
      </div>

      {loaded ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Each day, the agent keeps{" "}
            <span className="font-semibold text-foreground">
              {Number(floor) || 0} {currency}
            </span>{" "}
            liquid in your wallet and moves any surplus into a{" "}
            <span className="font-semibold text-emerald-500">
              {apy}% APY SafeLock
            </span>
            . It never touches your floor — and it automatically{" "}
            <span className="font-medium text-foreground">
              reserves for upcoming circle contributions
            </span>{" "}
            too, so it won&apos;t lock money you&apos;ll need to pay in.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="agent-floor" className="text-sm font-medium">
                Keep liquid ({currency})
              </label>
              <input
                id="agent-floor"
                type="number"
                min="0"
                step="1"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lock swept funds for</label>
              <div className="flex gap-2">
                {LOCK_OPTIONS.map((d) => {
                  const active = lockDays === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setLockDays(d)}
                      className={cn(
                        "flex-1 rounded-xl border px-2 py-2 text-center text-xs font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      <div>{d < 90 ? `${d}d` : `${d / 30}mo`}</div>
                      <div className="text-[10px] text-emerald-500">
                        {lockApyPct(d)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          <div className="mt-4 flex items-center gap-2">
            {enabled ? (
              <>
                <Button size="sm" onClick={() => save(true)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  Save changes
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => save(false)}
                  disabled={saving}
                >
                  Turn off
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => save(true)} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                Turn on agent
              </Button>
            )}
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            You stay in control: the agent only acts within the floor you set,
            every action is logged and notified, and you can turn it off anytime.
          </p>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your agent…
        </div>
      )}
    </div>
  );
}
