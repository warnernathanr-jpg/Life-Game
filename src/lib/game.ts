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

export const MAX_CITY_SIZE = 50; // public.max_city_size()
/** The whole world is MAX_CITY_SIZE across; your land sits in its middle (each land purchase adds a ring of one tile). */
export function worldOffset(size: number) {
  return Math.max(0, Math.floor((MAX_CITY_SIZE - size) / 2));
}
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
  return Math.round((300 * Math.pow(1.35, purchases)) / 10) * 10;
}

/** public.sell_refund(): half of what was paid (integer coins). */
export function sellRefund(pricePaid: number): number {
  return Math.floor(pricePaid / 2);
}

export const AREAS: { id: LifeArea; label: string; hint: string }[] = [
  { id: "health", label: "Health", hint: "Exercise, sleep, eating well" },
  { id: "work", label: "Work", hint: "Homework, jobs, projects" },
  { id: "knowledge", label: "Knowledge", hint: "Reading, studying, new skills" },
  { id: "personal", label: "Personal", hint: "Friends, family, hobbies, home" },
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
  { id: "road", label: "Roads", tile: "bg-slate-300 border-slate-500", chip: "bg-slate-200 text-slate-900" },
  { id: "landscape", label: "Landscape", tile: "bg-emerald-200 border-emerald-400", chip: "bg-emerald-100 text-emerald-900" },
];
/** Parks (places people visit to relax), part of Recreation. */
export const PARK_IDS = new Set(["park", "court", "garden", "central_park"]);
/** Services by menu group (all have category "service" in the database). */
export const KNOWLEDGE_IDS = new Set(["school", "high_school", "university", "library"]);
export const RECREATION_IDS = new Set([...PARK_IDS, "community", "gym", "pool", "stadium", "golf", "museum", "zoo"]);
export const TRANSPORT_IDS = new Set(["gas_station", "bus_station", "parking", "airport"]);
export const LANDMARK_IDS = new Set(["monument", "welcome_arch", "clock_tower", "fountain", "founders_statue", "observation_tower", "crystal_spire"]);

/**
 * Population milestones (mirrors public.city_milestone_bonus): a one-time coin bonus, and a landmark that can't be bought
 * (placed free, one each, once the city has that many people).
 */
export const CITY_MILESTONES = [
  { population: 50, bonus: 100, landmark: "welcome_arch" },
  { population: 100, bonus: 200, landmark: "fountain" },
  { population: 250, bonus: 400, landmark: "clock_tower" },
  { population: 500, bonus: 750, landmark: "monument" },
  { population: 1000, bonus: 1500, landmark: "founders_statue" },
  { population: 2500, bonus: 3000, landmark: "observation_tower" },
  { population: 5000, bonus: 6000, landmark: "crystal_spire" },
] as const;

/** The milestone a landmark belongs to (undefined for ordinary buildings). */
export const milestoneFor = (typeId: string) => CITY_MILESTONES.find((m) => m.landmark === typeId);

/**
 * Build menu order inside a group: the ones you'll reach first come first. Landmarks by the population that unlocks them,
 * everything else by the area points needed, then by price.
 */
export function byUnlockOrder(a: Pick<BuildingTypeRow, "id" | "unlock_points" | "cost">, b: Pick<BuildingTypeRow, "id" | "unlock_points" | "cost">) {
  const ma = milestoneFor(a.id)?.population ?? 0;
  const mb = milestoneFor(b.id)?.population ?? 0;
  if (ma !== mb) return ma - mb;
  const pa = ma ? 0 : (a.unlock_points ?? 0);
  const pb = mb ? 0 : (b.unlock_points ?? 0);
  return pa - pb || a.cost - b.cost;
}
/** Schools children (and students) attend. */
export const SCHOOL_IDS = new Set(["school", "high_school", "university"]);

export type BuildGroupId =
  | "residential"
  | "commercial"
  | "industrial"
  | "service"
  | "knowledge"
  | "recreation"
  | "transport"
  | "landmark"
  | "road"
  | "landscape";

/** The build menu's groups, in menu order (icons: GroupIcon). Bridges are drawn with the road tool, not picked. */
// Roads first: a new city starts with a road, and buildings only count beside one.
export const BUILD_GROUPS: { id: BuildGroupId; label: string; tile: string }[] = [
  { id: "road", label: "Roads", tile: "bg-slate-300 border-slate-500" },
  { id: "residential", label: "Residential", tile: "bg-orange-100 border-orange-300" },
  { id: "commercial", label: "Commercial", tile: "bg-sky-100 border-sky-300" },
  { id: "industrial", label: "Industrial", tile: "bg-stone-200 border-stone-400" },
  { id: "service", label: "Services", tile: "bg-violet-100 border-violet-300" },
  { id: "knowledge", label: "Knowledge", tile: "bg-amber-100 border-amber-300" },
  { id: "recreation", label: "Recreation", tile: "bg-lime-100 border-lime-400" },
  { id: "transport", label: "Transport", tile: "bg-cyan-100 border-cyan-300" },
  { id: "landmark", label: "Landmarks", tile: "bg-teal-100 border-teal-300" },
  { id: "landscape", label: "Landscape", tile: "bg-emerald-200 border-emerald-400" },
];

export function buildGroupOf(t: Pick<BuildingTypeRow, "id" | "category">): BuildGroupId | null {
  if (t.id === "bridge") return null;
  if (KNOWLEDGE_IDS.has(t.id)) return "knowledge";
  if (RECREATION_IDS.has(t.id)) return "recreation";
  if (TRANSPORT_IDS.has(t.id)) return "transport";
  if (LANDMARK_IDS.has(t.id)) return "landmark";
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
  if (milestoneFor(type.id)) return 0; // milestone landmarks unlock by population, not points
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
  placed: (Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y"> & { rotated?: boolean })[],
  types: BuildingTypeRow[],
  progress: ProgressRow | null = null,
  /** What residents live with (from layers.ts cityExposure): pollution at their homes and traffic jams, 0 … 1. */
  exposure?: { pollution: number; traffic: number },
): CityStats {
  const byId = new Map(types.map((t) => [t.id, t]));
  const lots = placed.map((b) => ({ ...b, ...footprint(byId.get(b.type_id), b.rotated) }));
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
  if (exposure) {
    // Pollution and noise where people actually live (spreads from industry, gas stations and the airport).
    const p = -Math.round(exposure.pollution * 20);
    if (p !== 0) {
      add({
        key: "pollution",
        label: "Pollution & noise near homes",
        value: p,
        tip: p <= -4 ? "Homes are close to factories or other noisy places. Move industry away, or put parks and trees between." : undefined,
      });
    }
    const jam = -Math.round(exposure.traffic * 12);
    if (jam !== 0) {
      add({
        key: "traffic",
        label: "Traffic jams",
        value: jam,
        tip: jam <= -3 ? "Roads are jammed. Upgrade busy roads to 2- or 4-lane, and add more routes so traffic spreads out." : undefined,
      });
    }
  } else if (pollution !== 0) {
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
      label: "Buildings without road access",
      value: -Math.min(10, unconnected * 2),
      tip: `${unconnected} building${unconnected === 1 ? " isn't" : "s aren't"} on a road joined to the rest of town, so ${unconnected === 1 ? "it doesn't" : "they don't"} count yet. Build a road beside ${unconnected === 1 ? "it" : "them"} and connect it to your other roads.`,
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
type Rect = { x: number; y: number; w: number; h: number };

export function lotsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Footprint of a building type, turned (width and depth swapped) or not. Squares ignore turning. */
export function footprint(t: Pick<BuildingTypeRow, "w" | "d"> | undefined, rotated = false): { w: number; h: number } {
  const w = t?.w ?? 1;
  const d = t?.d ?? 1;
  return rotated && w !== d ? { w: d, h: w } : { w, h: d };
}

/** "2×1", "3×3"… */
export const sizeText = (t: Pick<BuildingTypeRow, "w" | "d">) => `${t.w}×${t.d}`;

/** Client-side mirror of private.lot_free() (the database re-checks). */
export function lotFree(
  citySize: number,
  lot: Rect,
  placed: (Rect & { id: string; type_id?: string })[],
  exceptId?: string,
): boolean {
  if (lot.x < 0 || lot.y < 0 || lot.x + lot.w > citySize || lot.y + lot.h > citySize) return false;
  // Trees never block: whatever is built on them clears them (as the database does).
  return !placed.some((b) => b.id !== exceptId && b.type_id !== "tree" && lotsOverlap(lot, b));
}

export function formatCoins(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * Stop signs and traffic lights for crossings (mirrors public.road_control_price). Shown in the Roads build group as
 * extra items; they're not building types (they sit on a road tile, in public.road_controls).
 */
export const ROAD_CONTROLS = [
  { kind: "stop", typeId: "stop_sign", name: "Stop Sign", cost: 10, description: "For a crossing: cars stop, look, then take turns. Eases jams a little." },
  { kind: "light", typeId: "traffic_light", name: "Traffic Light", cost: 40, description: "For a busy crossing: each direction gets a green in turn, so several cars cross at once." },
] as const;
export type RoadControlTypeId = (typeof ROAD_CONTROLS)[number]["typeId"];
export const controlByType = (id: string) => ROAD_CONTROLS.find((c) => c.typeId === id);

/** The two controls as build-menu items (category road, no unlock needed). */
export function roadControlTypes(): BuildingTypeRow[] {
  return ROAD_CONTROLS.map((c, i) => ({
    id: c.typeId, name: c.name, category: "road", icon: "", description: c.description, cost: c.cost, size: 1, w: 1, d: 1,
    population: 0, jobs: 0, happiness: 0, unlock_area: null, unlock_points: null, upgrades_to: null, sort_order: 9000 + i,
  }));
}
