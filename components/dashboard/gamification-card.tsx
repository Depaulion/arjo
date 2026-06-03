"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Trophy, Zap } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  BADGES,
  levelProgress,
  levelForXp,
  challengeProgress,
  type BadgeId,
} from "@/lib/gamification";
import type { Challenge } from "@/lib/types";
import { Button } from "@/components/ui/button";

function daysBetween(end: string) {
  const ms = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function GamificationCard({
  userId,
  xp,
  streakWeeks,
  badges,
  challenges,
}: {
  userId: string;
  xp: number;
  streakWeeks: number;
  badges: string[];
  challenges: Challenge[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const progress = levelProgress(xp);
  const earned = new Set(badges);
  const allBadgeIds = Object.keys(BADGES) as BadgeId[];

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [days, setDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeChallenges = challenges.filter((c) => c.status === "active");

  async function createChallenge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(target);
    const dur = Number(days);
    if (title.trim().length < 2) {
      setError("Give your challenge a title.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a target amount.");
      return;
    }
    const end = new Date();
    end.setDate(end.getDate() + (Number.isFinite(dur) && dur > 0 ? dur : 30));
    setLoading(true);
    const { error } = await supabase.from("challenges").insert({
      user_id: userId,
      title: title.trim(),
      target_amount: amount,
      end_date: end.toISOString().slice(0, 10),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTitle("");
    setTarget("");
    setDays("30");
    setAdding(false);
    router.refresh();
  }

  async function completeChallenge(c: Challenge) {
    setBusyId(c.id);
    setError(null);
    // Mark complete and credit the reward XP (RLS lets the owner update both).
    await supabase
      .from("challenges")
      .update({ status: "completed" })
      .eq("id", c.id);
    const newXp = xp + (c.reward_xp ?? 0);
    await supabase
      .from("profiles")
      .update({ xp: newXp, level: levelForXp(newXp) })
      .eq("id", userId);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Level + XP */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <span className="text-[10px] uppercase tracking-wide opacity-80">
            Level
          </span>
          <span className="text-2xl font-bold leading-none">
            {progress.level}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Zap className="h-4 w-4 text-primary" />
              {xp.toLocaleString()} XP
            </span>
            <span className="text-xs text-muted-foreground">
              {progress.intoLevel}/{progress.forNextLevel} to level{" "}
              {progress.level + 1}
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${Math.round(progress.ratio * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            🔥 {streakWeeks}-week streak ·{" "}
            {earned.size}/{allBadgeIds.length} badges unlocked
          </p>
        </div>
      </div>

      {/* Badges */}
      <div className="grid grid-cols-5 gap-2">
        {allBadgeIds.map((id) => {
          const b = BADGES[id];
          const unlocked = earned.has(id);
          return (
            <div
              key={id}
              title={`${b.label} — ${b.description}`}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors ${
                unlocked
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-secondary/20 opacity-40 grayscale"
              }`}
            >
              <span className="text-xl leading-none">{b.emoji}</span>
              <span className="text-[9px] font-medium leading-tight text-muted-foreground">
                {b.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Challenges */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-primary" />
          Savings challenges
        </p>

        {activeChallenges.length > 0 && (
          <ul className="space-y-2">
            {activeChallenges.map((c) => {
              const left = daysBetween(c.end_date);
              const prog = challengeProgress({
                target: c.target_amount,
                saved: 0,
                startDate: c.start_date,
                endDate: c.end_date,
              });
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-border bg-secondary/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.target_amount.toLocaleString()} {c.currency} ·{" "}
                        {left} day{left === 1 ? "" : "s"} left · +{c.reward_xp} XP
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === c.id}
                      onClick={() => completeChallenge(c)}
                    >
                      {busyId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Done
                    </Button>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                      style={{ width: `${Math.round(prog.ratio * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        {adding ? (
          <form
            onSubmit={createChallenge}
            className="mt-3 space-y-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="No-spend 30-day challenge"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="1"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target amount"
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="Days"
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Start challenge
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
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            New challenge
          </Button>
        )}
      </div>
    </div>
  );
}
