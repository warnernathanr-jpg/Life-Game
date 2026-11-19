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

export const DAILY_COIN_CAP = 400; // public.daily_coin_cap()
export const MAX_CITY_SIZE = 30; // public.max_city_size()
export const MAX_STROKE_TILES = 200; // public.max_stroke_tiles()
export const REWARDS: Record<TaskDifficulty, number> = { easy: 10, medium: 25, hard: 50 }; // public.task_reward()

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
  { id: "work", label: "Work", icon: "💼", hint: "Career, projects, money" },
  { id: "learning", label: "Learning", icon: "📖", hint: "Reading, courses, practice" },
  { id: "home", label: "Home", icon: "🧹", hint: "Chores, errands, bills" },
  { id: "social", label: "Social", icon: "💬", hint: "Friends, family, community" },
];
export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<LifeArea, (typeof AREAS)[number]>;

export const DIFFICULTIES: { id: TaskDifficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];


export const CATEGORIES: { id: BuildingCategory; label: string; tile: string; chip: string }[] = [
  { id: "residential", label: "Residential", tile: "bg-orange-100 border-orange-300", chip: "bg-orange-100 text-orange-900" },
  { id: "commercial", label: "Commercial", tile: "bg-sky-100 border-sky-300", chip: "bg-sky-100 text-sky-900" },
  { id: "industrial", label: "Industrial", tile: "bg-stone-200 border-stone-400", chip: "bg-stone-200 text-stone-900" },
  { id: "service", label: "Services", tile: "bg-violet-100 border-violet-300", chip: "bg-violet-100 text-violet-900" },
  { id: "road", label: "Roads", tile: "bg-slate-500 border-slate-600", chip: "bg-slate-200 text-slate-900" },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<
  BuildingCategory,
  (typeof CATEGORIES)[number]
>;

export function areaCount(progress: ProgressRow | null, area: LifeArea): number {
  return progress ? Number(progress[area]) : 0;
}

/** How many more completions in its area a building needs (0 = unlocked). */
export function tasksToUnlock(type: BuildingTypeRow, progress: ProgressRow | null): number {
  if (!type.unlock_area || !type.unlock_count) return 0;
  return Math.max(0, type.unlock_count - areaCount(progress, type.unlock_area));
}

/** The next building each life area will unlock, for the "what's next" hints. */
export function nextUnlocks(types: BuildingTypeRow[], progress: ProgressRow | null) {
  return AREAS.map((area) => {
    const locked = types
      .filter((t) => t.unlock_area === area.id && tasksToUnlock(t, progress) > 0)
      .sort((a, b) => (a.unlock_count ?? 0) - (b.unlock_count ?? 0));
    const next = locked[0];
    return { area, done: areaCount(progress, area.id), next, remaining: next ? tasksToUnlock(next, progress) : 0 };
  });
}

export type CityStats = {
  population: number;
  jobs: number;
  employed: number;
  happiness: number;
  score: number;
  buildings: number;
  roads: number;
  /** Buildings that don't touch a road (they don't count yet). */
  unconnected: number;
  tips: string[];
};

/**
 * City stats from the placed buildings. Only buildings that touch a road count:
 * - population from homes, jobs from shops, industry and services;
 * - happiness starts at 50, plus each counted building's effect, minus 10 when fewer than half the
 *   residents have jobs, clamped to 0–100;
 * - score = population × happiness / 100 (rounded).
 */
export function cityStats(
  placed: Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y">[],
  types: BuildingTypeRow[],
): CityStats {
  const byId = new Map(types.map((t) => [t.id, t]));
  const lots = placed.map((b) => ({ ...b, size: byId.get(b.type_id)?.size ?? 1 }));
  const connected = connectedIds(lots);
  let population = 0;
  let jobs = 0;
  let effect = 0;
  let services = 0;
  let buildings = 0;
  let roads = 0;
  let unconnected = 0;
  for (const b of lots) {
    const t = byId.get(b.type_id);
    if (!t) continue;
    if (t.category === "road") {
      roads += 1;
      continue;
    }
    buildings += 1;
    if (!connected.has(b.id)) {
      unconnected += 1;
      continue;
    }
    population += t.population;
    jobs += t.jobs;
    effect += t.happiness;
    if (t.category === "service") services += 1;
  }
  const tips: string[] = [];
  let penalty = 0;
  if (unconnected > 0) {
    tips.push(
      unconnected === 1
        ? "1 building isn't next to a road, so it doesn't count yet. Build a road beside it."
        : `${unconnected} buildings aren't next to a road, so they don't count yet. Build roads beside them.`,
    );
  }
  if (population > 0 && jobs < population / 2) {
    penalty = 10;
    tips.push("Fewer than half your residents have jobs. Add shops, workshops or services.");
  }
  if (jobs > 0 && population < jobs / 2) {
    tips.push("Lots of jobs but few residents. Build homes so businesses can hire.");
  }
  if (population >= 20 && services === 0) {
    tips.push("Your city has no services yet. Parks, schools and clinics make people happier.");
  }
  if (lots.length === 0) {
    tips.push("Start with a short road, then a Cottage and a Corner Shop beside it. Finish tasks to earn more coins.");
  }
  const happiness = Math.max(0, Math.min(100, 50 + effect - penalty));
  return {
    population,
    jobs,
    employed: Math.min(population, jobs),
    happiness,
    score: Math.round((population * happiness) / 100),
    buildings,
    roads,
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
  placed: { id: string; x: number; y: number; size: number }[],
  exceptId?: string,
): boolean {
  if (lot.x < 0 || lot.y < 0 || lot.x + lot.size > citySize || lot.y + lot.size > citySize) return false;
  return !placed.some((b) => b.id !== exceptId && lotsOverlap(lot, b));
}

export function formatCoins(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
