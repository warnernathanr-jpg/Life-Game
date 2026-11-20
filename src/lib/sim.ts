// City simulation: named citizens who live in your homes, work in your businesses, go to school, shop and visit
// parks, travelling the road network by car or on foot. Everything here is worked out in the browser from the city
// itself (no database rows), seeded by building ids, so the same home always has the same people.

import type { BuildingTypeRow } from "./database.types";
import { RECREATION_IDS, SCHOOL_IDS } from "./game";
import { isRoadType, key, type Lot, type Tile } from "./roads";

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** FNV-1a hash of a string (stable seed from a building id). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded random number generator: returns numbers in [0, 1). */
export function rng(seed: number) {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ava", "Liam", "Maya", "Noah", "Zoe", "Ethan", "Lena", "Omar", "Priya", "Lucas", "Sofia", "Mateo", "Hana", "Jonah",
  "Amara", "Leo", "Nina", "Kai", "Ruby", "Theo", "Isla", "Diego", "Mei", "Felix", "Aisha", "Hugo", "Clara", "Ravi",
  "Elena", "Sam", "Nora", "Jamal", "Yuki", "Owen", "Lila", "Marco", "Freya", "Ben", "Tara", "Ivan", "Gwen", "Malik",
  "Iris", "Arjun", "June", "Pablo", "Sana", "Eli", "Rosa", "Finn", "Leah", "Tomas", "Ada", "Kofi", "Vera", "Rhys",
];
const LAST = [
  "Rivera", "Chen", "Okafor", "Nguyen", "Patel", "Kowalski", "Haddad", "Silva", "Johansson", "Kim", "Moreau",
  "Garcia", "Novak", "Mensah", "Tanaka", "Murphy", "Rossi", "Ali", "Schmidt", "Lopez", "Bennett", "Sato", "Costa",
  "Ivanova", "Brooks", "Adeyemi", "Fischer", "Park", "Dubois", "Ortiz", "Hughes", "Shah", "Larsen", "Reyes", "Wong",
  "Kaur", "Romero", "Walsh", "Yilmaz", "Baker", "Hart", "Diaz", "Sousa", "Lindqvist", "Abara", "Quinn", "Mori",
];
const SHIRTS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899", "#f8fafc", "#475569"];
const CARS = ["#ef4444", "#3b82f6", "#facc15", "#f8fafc", "#22c55e", "#a855f7", "#f97316", "#0f172a", "#64748b", "#0ea5e9"];

// ---------------------------------------------------------------------------
// Places and citizens
// ---------------------------------------------------------------------------

export type Place = {
  id: string;
  typeId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  homes: number; // residents
  jobs: number;
  shop: boolean;
  park: boolean;
  school: boolean;
  /** The road tile people use to come and go (null: no road beside it, nobody can get there). */
  entrance: Tile | null;
};

export type Citizen = {
  id: string;
  name: string;
  age: number;
  homeId: string;
  workId: string | null;
  schoolId: string | null;
  shirt: string;
  car: string;
  seed: number;
};

/** The most citizens simulated (the rest of a big city stays home off-screen). */
export const MAX_CITIZENS = 80;

/** A road tile touching the lot (prefer the middle of the longest road side). */
function entranceOf(l: Lot, roads: Set<string>): Tile | null {
  const options: Tile[] = [];
  for (let i = 0; i < l.w; i++) options.push({ x: l.x + i, y: l.y + l.h }, { x: l.x + i, y: l.y - 1 });
  for (let i = 0; i < l.h; i++) options.push({ x: l.x - 1, y: l.y + i }, { x: l.x + l.w, y: l.y + i });
  const touching = options.filter((t) => roads.has(key(t.x, t.y)));
  return touching.length ? touching[Math.floor(touching.length / 2)] : null;
}

export function placesFrom(lots: Lot[], types: Pick<BuildingTypeRow, "id" | "name" | "category" | "population" | "jobs">[]): Place[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  const roads = new Set(lots.filter((l) => isRoadType(l.type_id)).map((l) => key(l.x, l.y)));
  const out: Place[] = [];
  for (const l of lots) {
    const t = byId.get(l.type_id);
    if (!t || t.category === "road" || t.category === "landscape") continue;
    out.push({
      id: l.id,
      typeId: t.id,
      name: t.name,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      homes: t.category === "residential" ? t.population : 0,
      jobs: t.jobs,
      shop: t.category === "commercial",
      park: RECREATION_IDS.has(t.id),
      school: SCHOOL_IDS.has(t.id),
      entrance: entranceOf(l, roads),
    });
  }
  // Stable order (by position) so people and jobs don't reshuffle when unrelated things change.
  return out.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** Residents of every home (capped), with jobs at reachable workplaces and school places for children. */
export function citizensFrom(places: Place[]): Citizen[] {
  const homes = places.filter((p) => p.homes > 0);
  const workplaces = places.filter((p) => p.jobs > 0 && p.entrance);
  const schoolsOf = (id: string) => places.filter((p) => p.typeId === id && p.entrance);
  const elementary = schoolsOf("school");
  const high = schoolsOf("high_school");
  const universities = schoolsOf("university");
  const openJobs = new Map(workplaces.map((w) => [w.id, w.jobs]));
  const out: Citizen[] = [];
  const total = homes.reduce((s, h) => s + h.homes, 0);
  const share = total > MAX_CITIZENS ? MAX_CITIZENS / total : 1;
  for (const h of homes) {
    const r = rng(hashString(h.id));
    const n = Math.max(1, Math.round(h.homes * share));
    const family = LAST[Math.floor(r() * LAST.length)];
    for (let i = 0; i < n && out.length < MAX_CITIZENS; i++) {
      // Two adults, then children and the odd grandparent or roommate.
      const age = i < 2 ? 22 + Math.floor(r() * 45) : r() < 0.7 ? 5 + Math.floor(r() * 13) : 18 + Math.floor(r() * 70);
      const last = i < 3 || r() < 0.6 ? family : LAST[Math.floor(r() * LAST.length)];
      const seed = hashString(`${h.id}:${i}`);
      const c: Citizen = {
        id: `${h.id}:${i}`,
        name: `${FIRST[seed % FIRST.length]} ${last}`,
        age,
        homeId: h.id,
        workId: null,
        schoolId: null,
        shirt: SHIRTS[(seed >>> 4) % SHIRTS.length],
        car: CARS[(seed >>> 8) % CARS.length],
        seed,
      };
      // Children 5–13 go to elementary school, 14–17 to high school (elementary if there's none); some young adults study.
      const pickOf = (list: Place[]) => (list.length ? list[seed % list.length].id : null);
      if (age >= 5 && age < 14) c.schoolId = pickOf(elementary);
      else if (age >= 14 && age < 18) c.schoolId = pickOf(high) ?? pickOf(elementary);
      else if (age >= 18 && age < 23 && universities.length && seed % 2 === 0) c.schoolId = pickOf(universities);
      if (c.schoolId || age < 18) {
        // at school, or too young to work
      } else if (age >= 18 && age < 67 && h.entrance) {
        // The first workplace (starting from a seeded one) with an open job.
        for (let k = 0; k < workplaces.length; k++) {
          const w = workplaces[(seed + k) % workplaces.length];
          const left = openJobs.get(w.id) ?? 0;
          if (left > 0) {
            openJobs.set(w.id, left - 1);
            c.workId = w.id;
            break;
          }
        }
      }
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Shortest path between two road tiles over the road network (BFS), both ends included; null if not connected. */
export function roadPath(roads: Set<string>, from: Tile, to: Tile): Tile[] | null {
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  if (!roads.has(start) || !roads.has(goal)) return null;
  const prev = new Map<string, string | null>([[start, null]]);
  const queue: Tile[] = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const t = queue[qi];
    if (key(t.x, t.y) === goal) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      const k = key(n.x, n.y);
      if (!roads.has(k) || prev.has(k)) continue;
      prev.set(k, key(t.x, t.y));
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const path: Tile[] = [];
  for (let k: string | null = goal; k; k = prev.get(k) ?? null) {
    const [x, y] = k.split(",").map(Number);
    path.push({ x, y });
  }
  return path.reverse();
}

// ---------------------------------------------------------------------------
// Daily routine
// ---------------------------------------------------------------------------

/** Game minutes per real second (a game day lasts 6 real minutes). */
export const SIM_MINUTES_PER_SECOND = 4;
export const DAY = 24 * 60;

export type Purpose = "work" | "school" | "shop" | "park" | "visit" | "home";

export type Plan = { purpose: Purpose; toId: string } | { stayUntil: number };

const PURPOSE_WORDS: Record<Purpose, string> = { work: "work", school: "school", shop: "the shops", park: "the park", visit: "see a friend", home: "home" };
export const purposeWord = (p: Purpose) => PURPOSE_WORDS[p];

/** Minute of the day (0–1439) for a game time in minutes. */
export const minuteOfDay = (t: number) => ((t % DAY) + DAY) % DAY;

/** The next game time (after `t`) that's at minute-of-day `m`. */
export function nextAt(t: number, m: number): number {
  const day = Math.floor(t / DAY) * DAY;
  return day + m > t ? day + m : day + DAY + m;
}

/**
 * What a citizen does next, given where they are (`atId`) and the game time. Roughly: adults go to work in the
 * morning and leave around five, children go to school, and people go shopping or to the park in the day and evening,
 * always heading home in between. `r` is a random number source (so the day varies but stays plausible).
 */
export function decide(c: Citizen, atId: string, t: number, places: Map<string, Place>, r: () => number): Plan {
  const m = minuteOfDay(t);
  const day = Math.floor(t / DAY);
  const atHome = atId === c.homeId;
  const shops = [...places.values()].filter((p) => p.shop && p.entrance);
  const parks = [...places.values()].filter((p) => p.park && p.entrance);
  const pick = (list: Place[]) => list[Math.floor(r() * list.length)];
  // A small daily offset per person, so not everyone leaves at the same minute.
  const jitter = (c.seed >>> (day % 16)) % 50;

  if (!atHome) {
    const at = places.get(atId);
    if (at && atId === c.workId) {
      const leave = 16 * 60 + 30 + jitter; // 4:30–5:20 PM
      if (m < leave && m >= 6 * 60) return { stayUntil: t + (leave - m) };
      return shops.length && r() < 0.3 ? { purpose: "shop", toId: pick(shops).id } : { purpose: "home", toId: c.homeId };
    }
    if (at && atId === c.schoolId) {
      const leave = 15 * 60 + jitter / 2;
      if (m < leave && m >= 6 * 60) return { stayUntil: t + (leave - m) };
      return parks.length && r() < 0.35 ? { purpose: "park", toId: pick(parks).id } : { purpose: "home", toId: c.homeId };
    }
    return { purpose: "home", toId: c.homeId };
  }

  // At home.
  if (c.age < 5) return { stayUntil: t + 240 }; // little ones stay home with family
  // Night owls (about 1 adult in 6) are still out and about until midnight.
  const owl = c.age >= 18 && c.seed % 6 === 0;
  if (owl && m >= 21 * 60 + 30 && m < 23 * 60 + 40 && r() < 0.5) return outing(c, places, r) ?? { stayUntil: t + 30 };
  if (m < 6 * 60 + 30 || m >= 21 * 60 + 30) return { stayUntil: nextAt(t, 6 * 60 + 30 + jitter) }; // night: sleep
  const goWork = 7 * 60 + jitter; // 7:00–7:50 AM
  if (c.workId && m < 15 * 60) {
    if (m >= goWork) return { purpose: "work", toId: c.workId };
    return { stayUntil: t + (goWork - m) };
  }
  const goSchool = 7 * 60 + 30 + jitter / 2;
  if (c.schoolId && m < 14 * 60) {
    if (m >= goSchool) return { purpose: "school", toId: c.schoolId };
    return { stayUntil: t + (goSchool - m) };
  }
  // Free time: often out (errands, the park, friends), otherwise stay in a little while.
  if (r() < 0.7) {
    const out = outing(c, places, r);
    if (out) return out;
  }
  return { stayUntil: t + 20 + Math.floor(r() * 70) };
}

/** An outing from home: the shops, the park, or a friend's home (whatever the city has). */
export function outing(c: Citizen, places: Map<string, Place>, r: () => number): { purpose: Purpose; toId: string } | null {
  const all = [...places.values()].filter((p) => p.entrance);
  const choices: { purpose: Purpose; list: Place[]; weight: number }[] = [
    { purpose: "shop", list: all.filter((p) => p.shop), weight: 0.4 },
    { purpose: "park", list: all.filter((p) => p.park), weight: 0.35 },
    { purpose: "visit", list: all.filter((p) => p.homes > 0 && p.id !== c.homeId), weight: 0.25 },
  ];
  const options = choices.filter((o) => o.list.length > 0);
  if (options.length === 0) return null;
  const total = options.reduce((s, o) => s + o.weight, 0);
  let roll = r() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return { purpose: o.purpose, toId: o.list[Math.floor(r() * o.list.length)].id };
  }
  const o = options[options.length - 1];
  return { purpose: o.purpose, toId: o.list[Math.floor(r() * o.list.length)].id };
}

/** How long someone stays at a shop or park before heading home (game minutes). */
export function dwellMinutes(purpose: Purpose, r: () => number): number {
  if (purpose === "shop") return 20 + Math.floor(r() * 30);
  if (purpose === "park") return 30 + Math.floor(r() * 60);
  if (purpose === "visit") return 30 + Math.floor(r() * 60);
  return 0;
}

/** Short trips are on foot (and a walk to the park is a bit longer); everything else is by car. */
export function travelMode(pathLength: number, purpose: Purpose, age: number): "walk" | "car" {
  if (age < 16) return "walk";
  if (pathLength <= 4) return "walk";
  if (purpose === "park" && pathLength <= 7) return "walk";
  return "car";
}

/** "7:05 AM" for a game time in minutes. */
export function clockText(t: number): string {
  const m = minuteOfDay(Math.floor(t));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** Who a citizen is, in a few words: "Works at Corner Shop", "Student at School", "Retired"… */
export function roleText(c: Citizen, places: Map<string, Place>): string {
  if (c.workId) return `Works at ${places.get(c.workId)?.name ?? "a business"}`;
  if (c.age < 5) return "Little one";
  if (c.schoolId) return `Student at ${places.get(c.schoolId)?.name ?? "school"}`;
  if (c.age < 18) return "No school nearby yet";
  if (c.age >= 67) return "Retired";
  return "Looking for work";
}
