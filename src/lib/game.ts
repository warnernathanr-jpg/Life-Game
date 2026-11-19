// Game rules and city maths shared by pages. The database enforces coins, unlocks
// and placement; this file mirrors the numbers for display and works out city stats.
import type {
  BuildingCategory,
  BuildingTypeRow,
  LifeArea,
  PlacedBuildingRow,
  ProgressRow,
  TaskDifficulty,
} from "./database.types";
import { connectedIds } from "./roads";

export const MAX_CITY_SIZE = 30; // public.max_city_size()
export const MAX_STROKE_TILES = 200; // public.max_stroke_tiles()
export const REWARDS: Record<TaskDifficulty, number> = { easy: 10, medium: 25, hard: 50, epic: 100 }; // public.task_reward()

/** public.milestone_bonus(): one-off bonuses at these total check-offs of a recurring task (kept forever). */
export const MILESTONES = [
  { at: 10, bonus: 25 },
  { at: 30, bonus: 75 },
  { at: 100, bonus: 250 },
  { at: 365, bonus: 500 },
] as const;

/** The next milestone after `total` check-offs (null once all are reached). */
export function nextMilestone(total: number) {
  return MILESTONES.find((m) => m.at > total) ?? null;
}

/** public.land_price(): 300 × 1.6ⁿ, rounded to the nearest 10. */
export function landPrice(purchases: number): number {
  return Math.round((300 * Math.pow(1.6, purchases)) / 10) * 10;
}

/** public.sell_refund(): half of what was paid (integer coins). */
export function sellRefund(pricePaid: number): number {
  return Math.floor(pricePaid / 2);
}

export const AREAS: { id: LifeArea; label: string; icon: string; hint: string }[] = [
  { id: "health", label: "Health", icon: "💪", hint: "Exercise, sleep, eating well" },
  { id: "work", label: "Work", icon: "💼", hint: "Homework, jobs, projects" },
  { id: "knowledge", label: "Knowledge", icon: "📖", hint: "Reading, studying, new skills" },
  { id: "personal", label: "Personal", icon: "🌱", hint: "Friends, family, hobbies, home" },
];
export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<LifeArea, (typeof AREAS)[number]>;

export const DIFFICULTIES: { id: TaskDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "epic", label: "Epic" },
];


export const CATEGORIES: { id: BuildingCategory; label: string; tile: string; chip: string }[] = [
  { id: "residential", label: "Residential", tile: "bg-orange-100 border-orange-300", chip: "bg-orange-100 text-orange-900" },
  { id: "commercial", label: "Commercial", tile: "bg-sky-100 border-sky-300", chip: "bg-sky-100 text-sky-900" },
  { id: "industrial", label: "Industrial", tile: "bg-stone-200 border-stone-400", chip: "bg-stone-200 text-stone-900" },
  { id: "service", label: "Services", tile: "bg-violet-100 border-violet-300", chip: "bg-violet-100 text-violet-900" },
  { id: "road", label: "Roads", tile: "bg-slate-500 border-slate-600", chip: "bg-slate-200 text-slate-900" },
  { id: "landscape", label: "Landscape", tile: "bg-emerald-200 border-emerald-400", chip: "bg-emerald-100 text-emerald-900" },
];
/** Parks are services, but the build menu gives them their own group (as it does Knowledge). */
export const PARK_IDS = new Set(["park", "court", "garden", "central_park"]);
/** Schools and libraries: services too, grouped as Knowledge in the build menu. */
export const KNOWLEDGE_IDS = new Set(["school", "library"]);

export type BuildGroupId = "residential" | "commercial" | "industrial" | "service" | "knowledge" | "road" | "park" | "landscape";

/** The build menu's groups (with icons), in menu order. Bridges are drawn with the road tool, not picked. */
export const BUILD_GROUPS: { id: BuildGroupId; label: string; icon: string; tile: string }[] = [
  { id: "residential", label: "Residential", icon: "🏠", tile: "bg-orange-100 border-orange-300" },
  { id: "commercial", label: "Commercial", icon: "🏪", tile: "bg-sky-100 border-sky-300" },
  { id: "industrial", label: "Industrial", icon: "🏭", tile: "bg-stone-200 border-stone-400" },
  { id: "service", label: "Services", icon: "🏛️", tile: "bg-violet-100 border-violet-300" },
  { id: "knowledge", label: "Knowledge", icon: "📚", tile: "bg-amber-100 border-amber-300" },
  { id: "road", label: "Roads", icon: "🛣️", tile: "bg-slate-300 border-slate-500" },
  { id: "park", label: "Parks", icon: "🌳", tile: "bg-lime-100 border-lime-400" },
  { id: "landscape", label: "Landscape", icon: "🌲", tile: "bg-emerald-200 border-emerald-400" },
];

export function buildGroupOf(t: Pick<BuildingTypeRow, "id" | "category">): BuildGroupId | null {
  if (t.id === "bridge") return null;
  if (PARK_IDS.has(t.id)) return "park";
  if (KNOWLEDGE_IDS.has(t.id)) return "knowledge";
  return t.category as BuildGroupId;
}

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  BuildingCategory,
  (typeof CATEGORIES)[number]
>;

/** Area points (earned with every check-off, never spent) from my_progress(). */
export function areaPoints(progress: ProgressRow | null, area: LifeArea): number {
  return progress ? Number(progress[area]) : 0;
}

/** How many more area points a building needs (0 = unlocked). */
export function pointsToUnlock(type: BuildingTypeRow, progress: ProgressRow | null): number {
  if (!type.unlock_area || !type.unlock_points) return 0;
  return Math.max(0, type.unlock_points - areaPoints(progress, type.unlock_area));
}

/** The next building each life area will unlock, for the "what's next" hints. */
export function nextUnlocks(types: BuildingTypeRow[], progress: ProgressRow | null) {
  return AREAS.map((area) => {
    const locked = types
      .filter((t) => t.unlock_area === area.id && pointsToUnlock(t, progress) > 0)
      .sort((a, b) => (a.unlock_points ?? 0) - (b.unlock_points ?? 0));
    const next = locked[0];
    return { area, points: areaPoints(progress, area.id), next, remaining: next ? pointsToUnlock(next, progress) : 0 };
  });
}

export type HappinessFactor = {
  key: string;
  label: string;
  /** Points added to (or taken from) happiness. */
  value: number;
  /** What to do about it, when there's something to do. */
  tip?: string;
};

export type CityStats = {
  population: number;
  jobs: number;
  employed: number;
  unemployed: number;
  /** Share of jobs that have a worker, 0–1 (1 when there are no jobs). */
  staffing: number;
  /** Shops and industry that are short of workers (all of them while staffing < 1). */
  understaffed: Set<string>;
  happiness: number;
  /** What makes up happiness, biggest effects first. */
  factors: HappinessFactor[];
  /** City health 0–100 and its parts (each 0–100). */
  health: number;
  healthLabel: string;
  healthParts: { key: string; label: string; value: number }[];
  score: number;
  buildings: number;
  roads: number;
  landscape: number;
  /** Buildings that don't touch a road (they don't count yet). */
  unconnected: number;
  /** The most useful things to do next, most important first. */
  tips: string[];
};

/** Most happiness trees and water can add. */
export const NATURE_CAP = 10;

/**
 * City stats from the placed buildings (display only; nothing here changes coins).
 * Only buildings that touch a road count. Landscape tiles (trees, water) never need a road.
 * - Population = homes' residents; jobs = shops, industry and services. Staffing = population / jobs (max 1).
 * - Happiness = 50 plus the factors below, clamped to 0–100.
 * - Health = average of happiness, employment balance, road connections and service coverage.
 */
export function cityStats(
  placed: Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y">[],
  types: BuildingTypeRow[],
  progress: ProgressRow | null = null,
): CityStats {
  const byId = new Map(types.map((t) => [t.id, t]));
  const lots = placed.map((b) => ({ ...b, size: byId.get(b.type_id)?.size ?? 1 }));
  const connected = connectedIds(lots);
  let population = 0;
  let jobs = 0;
  let services = 0;
  let servicePoints = 0;
  let shopsHappy = 0;
  let homesHappy = 0;
  let pollution = 0;
  let nature = 0;
  let buildings = 0;
  let roads = 0;
  let landscape = 0;
  let unconnected = 0;
  const jobBuildings: string[] = [];
  for (const b of lots) {
    const t = byId.get(b.type_id);
    if (!t) continue;
    if (t.category === "road") {
      roads += 1;
      continue;
    }
    if (t.category === "landscape") {
      landscape += 1;
      nature += t.happiness;
      continue;
    }
    buildings += 1;
    if (!connected.has(b.id)) {
      unconnected += 1;
      continue;
    }
    population += t.population;
    jobs += t.jobs;
    if (t.category === "service") {
      services += 1;
      servicePoints += Math.max(0, t.happiness);
    } else if (t.category === "commercial") {
      shopsHappy += t.happiness;
      jobBuildings.push(b.id);
    } else if (t.category === "industrial") {
      pollution += t.happiness;
      jobBuildings.push(b.id);
    } else if (t.category === "residential") {
      homesHappy += t.happiness;
    }
  }

  const employed = Math.min(population, jobs);
  const unemployed = Math.max(0, population - jobs);
  const staffing = jobs > 0 ? Math.min(1, population / jobs) : 1;
  const understaffed = new Set(staffing < 1 ? jobBuildings : []);

  const factors: HappinessFactor[] = [];
  const add = (f: HappinessFactor) => factors.push(f);
  add({
    key: "services",
    label: "Parks & services",
    value: servicePoints,
    tip: servicePoints === 0 && population > 0 ? "Build a park, school or clinic. Services make residents happier." : undefined,
  });
  if (shopsHappy !== 0) add({ key: "shops", label: "Shops & cafés", value: shopsHappy });
  if (homesHappy !== 0) add({ key: "homes", label: "Housing", value: homesHappy });
  if (pollution !== 0) {
    add({
      key: "pollution",
      label: "Industry noise & pollution",
      value: pollution,
      tip: pollution <= -6 ? "Balance industry with parks, trees or water." : undefined,
    });
  }
  const natureValue = Math.min(NATURE_CAP, nature);
  add({
    key: "nature",
    label: "Nature (trees & water)",
    value: natureValue,
    tip: natureValue < 3 && buildings > 0 ? "Plant trees or dig a pond for a little extra happiness." : undefined,
  });
  if (population > 0 && unemployed > 0) {
    add({
      key: "unemployment",
      label: "Unemployment",
      value: -Math.min(20, Math.round((unemployed / population) * 20)),
      tip: `${unemployed} resident${unemployed === 1 ? "" : "s"} can't find work. Build shops, offices or industry.`,
    });
  }
  if (jobs > population && jobs > 0) {
    add({
      key: "workers",
      label: "Not enough workers",
      value: -Math.min(10, Math.round(((jobs - population) / jobs) * 10)),
      tip: `Businesses are only ${Math.round(staffing * 100)}% staffed. Build homes so they can hire.`,
    });
  }
  if (population >= 20 && services === 0) {
    add({ key: "no_services", label: "No services", value: -10, tip: "A city this size needs services. Build a park, school or clinic." });
  }
  if (unconnected > 0) {
    add({
      key: "roads",
      label: "Buildings without roads",
      value: -Math.min(10, unconnected * 2),
      tip: `${unconnected} building${unconnected === 1 ? " isn't" : "s aren't"} next to a road, so ${unconnected === 1 ? "it doesn't" : "they don't"} count yet. Build a road beside ${unconnected === 1 ? "it" : "them"}.`,
    });
  }
  // Real life → city: points spread evenly across the four life areas make the city happier.
  const pts = AREAS.map((a) => ({ a, p: areaPoints(progress, a.id) }));
  const total = pts.reduce((sum, x) => sum + x.p, 0);
  if (progress) {
    const maxP = Math.max(...pts.map((x) => x.p));
    const lowest = pts.reduce((lo, x) => (x.p < lo.p ? x : lo), pts[0]);
    const balance = total > 0 && maxP > 0 ? lowest.p / maxP : 0;
    add({
      key: "balance",
      label: "Life balance",
      value: Math.round(balance * 10),
      tip: balance < 0.5 ? `Your ${lowest.a.label} points are lowest. A ${lowest.a.label.toLowerCase()} task lifts the whole city.` : undefined,
    });
  }

  const happiness = Math.max(0, Math.min(100, 50 + factors.reduce((sum, f) => sum + f.value, 0)));
  factors.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));

  const employmentHealth = population + jobs === 0 ? 100 : Math.round((Math.min(population, jobs) / Math.max(population, jobs)) * 100);
  const roadHealth = buildings === 0 ? 100 : Math.round(((buildings - unconnected) / buildings) * 100);
  const serviceHealth = population === 0 ? 100 : Math.round(Math.min(1, servicePoints / (population / 2)) * 100);
  const healthParts = [
    { key: "happiness", label: "Happiness", value: happiness },
    { key: "jobs", label: "Jobs balance", value: employmentHealth },
    { key: "roads", label: "Road connections", value: roadHealth },
    { key: "services", label: "Service coverage", value: serviceHealth },
  ];
  const health = buildings === 0 ? 0 : Math.round(healthParts.reduce((sum, h) => sum + h.value, 0) / healthParts.length);
  const healthLabel =
    buildings === 0 ? "Empty land" : health >= 80 ? "Thriving" : health >= 60 ? "Healthy" : health >= 40 ? "Struggling" : "Needs care";

  const tips = factors.filter((f) => f.tip && f.value <= 0).map((f) => f.tip!);
  for (const f of factors) if (f.tip && f.value > 0 && !tips.includes(f.tip)) tips.push(f.tip);
  if (lots.length === 0) {
    tips.unshift("Start with a short road, then a House and a Corner Shop beside it. Finish tasks to earn more coins.");
  }

  return {
    population,
    jobs,
    employed,
    unemployed,
    staffing,
    understaffed,
    happiness,
    factors,
    health,
    healthLabel,
    healthParts,
    score: Math.round((population * happiness) / 100),
    buildings,
    roads,
    landscape,
    unconnected,
    tips,
  };
}

/** Do two square lots overlap? (x, y = top-left tile.) */
export function lotsOverlap(
  a: { x: number; y: number; size: number },
  b: { x: number; y: number; size: number },
): boolean {
  return a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;
}

/** Client-side mirror of private.lot_free() (the database re-checks). */
export function lotFree(
  citySize: number,
  lot: { x: number; y: number; size: number },
  placed: { id: string; x: number; y: number; size: number; type_id?: string }[],
  exceptId?: string,
): boolean {
  if (lot.x < 0 || lot.y < 0 || lot.x + lot.size > citySize || lot.y + lot.size > citySize) return false;
  // Trees never block: whatever is built on them clears them (as the database does).
  return !placed.some((b) => b.id !== exceptId && b.type_id !== "tree" && lotsOverlap(lot, b));
}

export function formatCoins(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
