// The badges a player can earn (ids match private.achievement_times() in the database). Once earned they're kept forever.

export type AchievementGroup = "Tasks & habits" | "Goals & focus" | "Your city";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  /** Lucide icon name (see ACHIEVEMENT_ICONS in the Achievements page). */
  icon: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_checkoff", title: "First step", description: "Check off your first task.", group: "Tasks & habits", icon: "check" },
  { id: "checkoffs_100", title: "Hundred club", description: "Check off 100 tasks.", group: "Tasks & habits", icon: "list-checks" },
  { id: "checkoffs_1000", title: "Unstoppable", description: "Check off 1,000 tasks.", group: "Tasks & habits", icon: "rocket" },
  { id: "habit_30", title: "30-day habit", description: "Check off one habit 30 times.", group: "Tasks & habits", icon: "calendar-check" },
  { id: "habit_100", title: "Second nature", description: "Check off one habit 100 times.", group: "Tasks & habits", icon: "repeat" },
  { id: "well_rounded", title: "Well-rounded", description: "Earn 250 points in all four life areas.", group: "Tasks & habits", icon: "compass" },
  { id: "goal_first", title: "Goal getter", description: "Reach your first goal.", group: "Goals & focus", icon: "target" },
  { id: "goals_5", title: "Dream big", description: "Reach 5 goals.", group: "Goals & focus", icon: "trophy" },
  { id: "focus_first", title: "In the zone", description: "Finish a focus session.", group: "Goals & focus", icon: "timer" },
  { id: "focus_10h", title: "Deep focus", description: "Focus for 10 hours in total.", group: "Goals & focus", icon: "hourglass" },
  { id: "getting_started", title: "Settled in", description: "Finish Getting started.", group: "Your city", icon: "sprout" },
  { id: "build_first", title: "Groundbreaker", description: "Put up your first building.", group: "Your city", icon: "hammer" },
  { id: "build_50", title: "Master builder", description: "Have 50 buildings in your city.", group: "Your city", icon: "building-2" },
  { id: "people_100", title: "Growing town", description: "Reach 100 people.", group: "Your city", icon: "users" },
  { id: "people_1000", title: "Big city", description: "Reach 1,000 people.", group: "Your city", icon: "landmark" },
  { id: "land_first", title: "Room to grow", description: "Buy more land.", group: "Your city", icon: "land-plot" },
  { id: "first_friend", title: "Good neighbor", description: "Become friends with another city.", group: "Your city", icon: "handshake" },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_GROUPS: AchievementGroup[] = ["Tasks & habits", "Goals & focus", "Your city"];
