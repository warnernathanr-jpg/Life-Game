// The badges a player can earn (ids match private.achievement_times() in the database). Once earned they're kept forever.

export type AchievementGroup = "Tasks & habits" | "Goals & focus" | "Your city";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  /** Lucide icon name (see ACHIEVEMENT_ICONS in the Achievements page). */
  icon: string;
  /** Coins for earning it, collected once (mirrors private.achievement_reward() in the database). */
  coins: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_checkoff", title: "First step", description: "Check off your first task.", group: "Tasks & habits", icon: "check", coins: 25 },
  { id: "checkoffs_100", title: "Hundred club", description: "Check off 100 tasks.", group: "Tasks & habits", icon: "list-checks", coins: 150 },
  { id: "checkoffs_1000", title: "Unstoppable", description: "Check off 1,000 tasks.", group: "Tasks & habits", icon: "rocket", coins: 750 },
  { id: "habit_30", title: "30-day habit", description: "Check off one habit 30 times.", group: "Tasks & habits", icon: "calendar-check", coins: 100 },
  { id: "habit_100", title: "Second nature", description: "Check off one habit 100 times.", group: "Tasks & habits", icon: "repeat", coins: 300 },
  { id: "tasks_10", title: "Planner", description: "Add 10 tasks.", group: "Tasks & habits", icon: "list-plus", coins: 50 },
  { id: "well_rounded", title: "Well-rounded", description: "Earn 250 points in all four life areas.", group: "Tasks & habits", icon: "compass", coins: 250 },
  { id: "goal_added", title: "Aim high", description: "Add a goal.", group: "Goals & focus", icon: "flag", coins: 25 },
  { id: "goal_first", title: "Goal getter", description: "Reach your first goal.", group: "Goals & focus", icon: "target", coins: 100 },
  { id: "goals_5", title: "Dream big", description: "Reach 5 goals.", group: "Goals & focus", icon: "trophy", coins: 300 },
  { id: "focus_first", title: "In the zone", description: "Finish a focus session.", group: "Goals & focus", icon: "timer", coins: 25 },
  { id: "focus_10h", title: "Deep focus", description: "Focus for 10 hours in total.", group: "Goals & focus", icon: "hourglass", coins: 200 },
  { id: "getting_started", title: "Settled in", description: "Finish Getting started.", group: "Your city", icon: "sprout", coins: 25 },
  { id: "build_first", title: "Groundbreaker", description: "Put up your first building.", group: "Your city", icon: "hammer", coins: 25 },
  { id: "build_50", title: "Master builder", description: "Have 50 buildings in your city.", group: "Your city", icon: "building-2", coins: 200 },
  { id: "people_100", title: "Growing town", description: "Reach 100 people.", group: "Your city", icon: "users", coins: 100 },
  { id: "people_1000", title: "Big city", description: "Reach 1,000 people.", group: "Your city", icon: "landmark", coins: 400 },
  { id: "land_first", title: "Room to grow", description: "Buy more land.", group: "Your city", icon: "land-plot", coins: 50 },
  { id: "invite_shared", title: "Spread the word", description: "Share your invite link with a friend.", group: "Your city", icon: "share-2", coins: 50 },
  { id: "first_friend", title: "Good neighbor", description: "Become friends with another city.", group: "Your city", icon: "handshake", coins: 100 },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_GROUPS: AchievementGroup[] = ["Tasks & habits", "Goals & focus", "Your city"];

/** Coins waiting to be collected from earned badges (not collected yet). */
export function coinsToCollect(earned: { id: string; claimed_at: string | null }[]): { badges: number; coins: number } {
  const open = earned.filter((e) => !e.claimed_at && (ACHIEVEMENT_BY_ID.get(e.id)?.coins ?? 0) > 0);
  return { badges: open.length, coins: open.reduce((sum, e) => sum + (ACHIEVEMENT_BY_ID.get(e.id)?.coins ?? 0), 0) };
}
