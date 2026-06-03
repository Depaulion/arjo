/**
 * Deterministic gamification engine — XP, levels, badges, streaks, challenges.
 *
 * Pure functions, no I/O, so they run on the server (to award XP after an
 * action) and on the client (to preview progress). XP is the single source of
 * truth; level is derived from XP.
 */

/** XP needed per level step. Level = 1 + floor(xp / XP_PER_LEVEL). */
export const XP_PER_LEVEL = 500;

/** XP awarded for each kind of saving action. */
export const XP_REWARDS = {
  contribution: 50,
  lock: 120,
  autosave: 30,
  goalCreated: 20,
  goalReached: 200,
  challengeCompleted: 100,
  streakWeek: 25,
} as const;

export type XpAction = keyof typeof XP_REWARDS;

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

/** Progress (0–1) through the current level and the XP bounds around it. */
export function levelProgress(xp: number): {
  level: number;
  intoLevel: number;
  forNextLevel: number;
  ratio: number;
} {
  const safe = Math.max(0, xp);
  const level = levelForXp(safe);
  const floor = (level - 1) * XP_PER_LEVEL;
  const intoLevel = safe - floor;
  return {
    level,
    intoLevel,
    forNextLevel: XP_PER_LEVEL,
    ratio: Math.min(1, intoLevel / XP_PER_LEVEL),
  };
}

export type BadgeId =
  | "first_save"
  | "first_lock"
  | "streak_4"
  | "streak_12"
  | "level_5"
  | "level_10"
  | "planner"
  | "circle_creator"
  | "goal_getter"
  | "challenger";

export type BadgeDef = {
  id: BadgeId;
  label: string;
  description: string;
  emoji: string;
};

export const BADGES: Record<BadgeId, BadgeDef> = {
  first_save: {
    id: "first_save",
    label: "First Save",
    description: "Made your first contribution.",
    emoji: "🌱",
  },
  first_lock: {
    id: "first_lock",
    label: "Vault Keeper",
    description: "Opened your first SafeLock vault.",
    emoji: "🔒",
  },
  streak_4: {
    id: "streak_4",
    label: "On a Roll",
    description: "Saved 4 weeks in a row.",
    emoji: "🔥",
  },
  streak_12: {
    id: "streak_12",
    label: "Unstoppable",
    description: "Saved 12 weeks in a row.",
    emoji: "⚡",
  },
  level_5: {
    id: "level_5",
    label: "Rising Saver",
    description: "Reached level 5.",
    emoji: "⭐",
  },
  level_10: {
    id: "level_10",
    label: "Savings Pro",
    description: "Reached level 10.",
    emoji: "🏆",
  },
  planner: {
    id: "planner",
    label: "Strategist",
    description: "Generated an AI financial plan.",
    emoji: "🧭",
  },
  circle_creator: {
    id: "circle_creator",
    label: "Community Builder",
    description: "Created a savings circle.",
    emoji: "🤝",
  },
  goal_getter: {
    id: "goal_getter",
    label: "Goal Getter",
    description: "Reached a savings goal.",
    emoji: "🎯",
  },
  challenger: {
    id: "challenger",
    label: "Challenger",
    description: "Completed a savings challenge.",
    emoji: "🥇",
  },
};

export type GamificationStats = {
  xp: number;
  level: number;
  streakWeeks: number;
  contributionCount: number;
  lockedPlans: number;
  goalsReached: number;
  circlesCreated: number;
  usedPlanner: boolean;
  challengesCompleted: number;
};

/**
 * Derive the full set of badges a user has earned from their stats. Pure, so
 * the result can be diffed against stored badges to detect newly-unlocked ones.
 */
export function earnedBadges(stats: GamificationStats): BadgeId[] {
  const out: BadgeId[] = [];
  if (stats.contributionCount > 0) out.push("first_save");
  if (stats.lockedPlans > 0) out.push("first_lock");
  if (stats.streakWeeks >= 4) out.push("streak_4");
  if (stats.streakWeeks >= 12) out.push("streak_12");
  if (stats.level >= 5) out.push("level_5");
  if (stats.level >= 10) out.push("level_10");
  if (stats.usedPlanner) out.push("planner");
  if (stats.circlesCreated > 0) out.push("circle_creator");
  if (stats.goalsReached > 0) out.push("goal_getter");
  if (stats.challengesCompleted > 0) out.push("challenger");
  return out;
}

/** Badges in `next` that are not in `current` — i.e. just unlocked. */
export function newlyUnlocked(
  current: readonly string[],
  next: readonly BadgeId[]
): BadgeId[] {
  const have = new Set(current);
  return next.filter((b) => !have.has(b));
}

export type ChallengeProgress = {
  /** 0–1 toward the target amount. */
  ratio: number;
  saved: number;
  remaining: number;
  daysLeft: number;
  /** Per-day amount still required to finish on time (0 if done/overdue). */
  perDayNeeded: number;
  onTrack: boolean;
};

/** Compute a challenge's progress from saved amount and its window. */
export function challengeProgress(input: {
  target: number;
  saved: number;
  startDate: string;
  endDate: string;
  now?: Date;
}): ChallengeProgress {
  const now = input.now ?? new Date();
  const end = new Date(input.endDate);
  const msLeft = end.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const saved = Math.max(0, input.saved);
  const remaining = Math.max(0, input.target - saved);
  const ratio = input.target > 0 ? Math.min(1, saved / input.target) : 0;
  const perDayNeeded =
    remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;

  // On track if the elapsed-time-expected amount has been met.
  const start = new Date(input.startDate);
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const elapsedRatio = Math.min(
    1,
    Math.max(0, (now.getTime() - start.getTime()) / totalMs)
  );
  const expected = input.target * elapsedRatio;
  const onTrack = saved + 1e-9 >= expected;

  return { ratio, saved, remaining, daysLeft, perDayNeeded, onTrack };
}
