import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ArcStablecoin } from "@/lib/arc";
import {
  XP_REWARDS,
  type XpAction,
  levelForXp,
  earnedBadges,
  type GamificationStats,
} from "@/lib/gamification";

/**
 * Shared server-side glue for savings actions: resolving a user's wallet and
 * applying gamification rewards. RLS runs against the cookie-session client.
 */

export type UserWallet = {
  walletId: string | null;
  address: string | null;
  currency: ArcStablecoin;
};

export async function getUserWallet(
  supabase: SupabaseClient,
  userId: string
): Promise<UserWallet> {
  const { data } = await supabase
    .from("profiles")
    .select("circle_wallet_id, arc_wallet_address, preferred_stablecoin")
    .eq("id", userId)
    .single<{
      circle_wallet_id: string | null;
      arc_wallet_address: string | null;
      preferred_stablecoin: ArcStablecoin | null;
    }>();

  return {
    walletId: data?.circle_wallet_id ?? null,
    address: data?.arc_wallet_address ?? null,
    currency: data?.preferred_stablecoin ?? "USDC",
  };
}

export type GamificationResult = {
  xp: number;
  level: number;
  newBadges: string[];
};

/**
 * Award XP for an action and recompute the user's level + badge set from their
 * current stats. Best-effort: failures are swallowed so a gamification glitch
 * never blocks a real savings action.
 */
export async function applyGamification(
  supabase: SupabaseClient,
  userId: string,
  action: XpAction,
  opts: { usedPlanner?: boolean } = {}
): Promise<GamificationResult | null> {
  try {
    const reward = XP_REWARDS[action] ?? 0;

    const { data: profile } = await supabase
      .from("profiles")
      .select("xp, badges, streak_weeks")
      .eq("id", userId)
      .single<{ xp: number | null; badges: string[] | null; streak_weeks: number | null }>();

    const currentXp = profile?.xp ?? 0;
    const currentBadges = profile?.badges ?? [];
    const newXp = currentXp + reward;
    const newLevel = levelForXp(newXp);

    // Gather the counts that drive badges (cheap head counts).
    const [contribCount, lockedCount, circlesCount, challengesDone] =
      await Promise.all([
        supabase
          .from("ledger_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .in("kind", ["contribution", "autosave"]),
        supabase
          .from("savings_plans")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("plan_type", "locked"),
        supabase
          .from("circles")
          .select("id", { count: "exact", head: true })
          .eq("created_by", userId),
        supabase
          .from("challenges")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed"),
      ]);

    const usedPlanner =
      opts.usedPlanner === true || currentBadges.includes("planner");

    const stats: GamificationStats = {
      xp: newXp,
      level: newLevel,
      streakWeeks: profile?.streak_weeks ?? 0,
      contributionCount: contribCount.count ?? 0,
      lockedPlans: lockedCount.count ?? 0,
      goalsReached: 0,
      circlesCreated: circlesCount.count ?? 0,
      usedPlanner,
      challengesCompleted: challengesDone.count ?? 0,
    };

    const computed = earnedBadges(stats);
    const merged = Array.from(new Set([...currentBadges, ...computed]));
    const newBadges = merged.filter((b) => !currentBadges.includes(b));

    await supabase
      .from("profiles")
      .update({ xp: newXp, level: newLevel, badges: merged })
      .eq("id", userId);

    return { xp: newXp, level: newLevel, newBadges };
  } catch {
    return null;
  }
}
