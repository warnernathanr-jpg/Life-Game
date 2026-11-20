// Map layers: for each building, road or patch of land, a value from 0 (good, green) to 1 (bad, red), worked out from the
// city's layout. Shown over the 3D map from the full-screen page's Layers button.

import type { BuildingTypeRow } from "./database.types";
import { RECREATION_IDS } from "./game";
import { isRoadType, key, type Lot, type Tile } from "./roads";
import { roadPath, type Citizen, type Place } from "./sim";

export type LayerId = "traffic" | "fire" | "crime" | "education" | "health" | "pollution" | "land_value";

export const LAYERS: { id: LayerId; label: string; good: string; bad: string; about: string }[] = [
  { id: "traffic", label: "Traffic", good: "Quiet", bad: "Jammed", about: "How busy each road is: daily trips compared with what the road can carry. Wider roads carry more." },
  { id: "fire", label: "Fire hazard", good: "Safe", bad: "Risky", about: "Factories and dense buildings are riskier. A fire station nearby brings it down." },
  { id: "crime", label: "Crime", good: "Safe", bad: "High", about: "Shops and dense housing see more crime. A police station nearby brings it down." },
  { id: "education", label: "Education", good: "Well served", bad: "No schools", about: "How well each home is served by schools, the high school, the university and libraries." },
  { id: "health", label: "Health care", good: "Close by", bad: "Far away", about: "How close each home is to a clinic or hospital." },
  { id: "pollution", label: "Pollution & noise", good: "Clean", bad: "Polluted", about: "Spreads from factories, warehouses, gas stations and the airport, fading with distance." },
  { id: "land_value", label: "Land value", good: "High", bad: "Low", about: "Parks, water, trees and landmarks raise it; pollution lowers it." },
];

/** One colored patch: a w × h area at (x, y) with value v (0 good … 1 bad). `raise` lifts it over a building. */
export type LayerCell = { x: number; y: number; w: number; h: number; v: number; raise?: boolean };

type TypeInfo = Pick<BuildingTypeRow, "id" | "category" | "population" | "jobs">;

const ROAD_CAPACITY: Record<string, number> = { dirt_road: 3, road: 8, bridge: 8, avenue: 20 };
const POLLUTERS: Record<string, number> = {
  factory: 1, distribution: 0.8, workshop: 0.6, small_factory: 0.5, warehouse: 0.4, gas_station: 0.35, airport: 1,
};

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Manhattan distance between the edges of two footprints (0 when touching or overlapping). */
function gap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return dx + dy;
}

/** 1 when a service of these types is right next door, fading to 0 at `radius` tiles away (best one counts). */
function coverage(lot: Lot, services: Lot[], radius: number) {
  let best = 0;
  for (const s of services) best = Math.max(best, 1 - gap(lot, s) / radius);
  return clamp(best);
}

export function computeLayer(
  layer: LayerId,
  lots: Lot[],
  types: TypeInfo[],
  extras: { size: number; places: Place[]; citizens: Citizen[]; connected: Set<string> },
): LayerCell[] {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const buildings = lots.filter((l) => {
    const c = typeOf.get(l.type_id)?.category;
    return c && c !== "road" && c !== "landscape";
  });
  const homes = buildings.filter((l) => (typeOf.get(l.type_id)?.population ?? 0) > 0);
  const ofTypes = (ids: string[]) => buildings.filter((l) => ids.includes(l.type_id));
  const cell = (l: Lot, v: number): LayerCell => ({ x: l.x, y: l.y, w: l.w, h: l.h, v: clamp(v), raise: true });

  switch (layer) {
    case "fire": {
      const stations = ofTypes(["fire_station"]);
      return buildings.map((l) => {
        const t = typeOf.get(l.type_id)!;
        const base = t.category === "industrial" ? 0.9 : t.category === "commercial" ? 0.6 : (t.population ?? 0) > 20 ? 0.7 : 0.45;
        return cell(l, base * (1 - 0.85 * coverage(l, stations, 9)));
      });
    }

    case "crime": {
      const police = ofTypes(["police"]);
      return buildings.map((l) => {
        const t = typeOf.get(l.type_id)!;
        const base = t.category === "commercial" ? 0.75 : (t.population ?? 0) > 20 ? 0.7 : t.category === "industrial" ? 0.55 : 0.45;
        return cell(l, base * (1 - 0.85 * coverage(l, police, 9)));
      });
    }

    case "education": {
      const elementary = ofTypes(["school"]);
      const high = ofTypes(["high_school"]);
      const uni = ofTypes(["university"]);
      const library = ofTypes(["library"]);
      return homes.map((l) => {
        const score = 0.45 * coverage(l, elementary, 8) + 0.3 * coverage(l, high, 12) + 0.15 * coverage(l, uni, 18) + 0.1 * coverage(l, library, 8);
        return cell(l, 1 - score / 1);
      });
    }

    case "health": {
      const clinics = ofTypes(["clinic"]);
      const hospitals = ofTypes(["hospital"]);
      return homes.map((l) => cell(l, 1 - Math.max(coverage(l, clinics, 7), coverage(l, hospitals, 14))));
    }

    case "pollution":
    case "land_value": {
      // A value for every land tile (not roads), from nearby polluters and nice things.
      const polluters = buildings.filter((l) => POLLUTERS[l.type_id]);
      const nice = buildings.filter((l) => RECREATION_IDS.has(l.type_id) || l.type_id === "monument");
      const water = lots.filter((l) => l.type_id === "water");
      const trees = lots.filter((l) => l.type_id === "tree");
      const roads = new Set(lots.filter((l) => isRoadType(l.type_id)).map((l) => key(l.x, l.y)));
      const out: LayerCell[] = [];
      for (let y = 0; y < extras.size; y++) {
        for (let x = 0; x < extras.size; x++) {
          if (roads.has(key(x, y))) continue;
          const t = { x, y, w: 1, h: 1 };
          let pollution = 0;
          for (const p of polluters) pollution += POLLUTERS[p.type_id] * clamp(1 - gap(t, p) / 6);
          pollution = clamp(pollution);
          if (layer === "pollution") {
            out.push({ x, y, w: 1, h: 1, v: pollution });
            continue;
          }
          let value = 0.35;
          for (const n of nice) value += 0.35 * clamp(1 - gap(t, n) / 5);
          for (const w of water) value += 0.08 * clamp(1 - gap(t, w) / 3);
          for (const tr of trees) value += 0.04 * clamp(1 - gap(t, tr) / 2);
          value = clamp(value) - 0.6 * pollution;
          out.push({ x, y, w: 1, h: 1, v: clamp(1 - value) });
        }
      }
      // Buildings sit on their tiles; show their own value on top of them too.
      return out;
    }

    case "traffic": {
      // Each citizen's daily trips (to work or school and back) counted on every road tile they use.
      const roads = new Set(lots.filter((l) => isRoadType(l.type_id)).map((l) => key(l.x, l.y)));
      const placeById = new Map(extras.places.map((p) => [p.id, p]));
      const counts = new Map<string, number>();
      const cache = new Map<string, Tile[] | null>();
      for (const c of extras.citizens) {
        const home = placeById.get(c.homeId);
        const dest = placeById.get(c.workId ?? c.schoolId ?? "");
        if (!home?.entrance || !dest?.entrance) continue;
        const k = `${key(home.entrance.x, home.entrance.y)}>${key(dest.entrance.x, dest.entrance.y)}`;
        if (!cache.has(k)) cache.set(k, roadPath(roads, home.entrance, dest.entrance));
        const path = cache.get(k);
        if (!path) continue;
        for (const t of path) counts.set(key(t.x, t.y), (counts.get(key(t.x, t.y)) ?? 0) + 2); // there and back
      }
      return lots
        .filter((l) => isRoadType(l.type_id))
        .map((l) => ({ x: l.x, y: l.y, w: 1, h: 1, v: clamp((counts.get(key(l.x, l.y)) ?? 0) / (ROAD_CAPACITY[l.type_id] ?? 8) / 2) }));
    }
  }
}

/** Green (0) → yellow (0.5) → red (1). */
export function layerColor(v: number): string {
  const c = clamp(v);
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const [r, g, b] =
    c < 0.5
      ? [lerp(0x22, 0xea, c * 2), lerp(0xc5, 0xb3, c * 2), lerp(0x5e, 0x08, c * 2)]
      : [lerp(0xea, 0xef, (c - 0.5) * 2), lerp(0xb3, 0x44, (c - 0.5) * 2), lerp(0x08, 0x44, (c - 0.5) * 2)];
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * What residents live with, for City Stats: average pollution at their homes (weighted by how many live there) and how
 * jammed the roads they use are (busier roads count more). Both 0 (fine) … 1 (terrible).
 */
export function cityExposure(
  lots: Lot[],
  types: TypeInfo[],
  extras: { size: number; places: Place[]; citizens: Citizen[]; connected: Set<string> },
): { pollution: number; traffic: number } {
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const pollutionAt = new Map(computeLayer("pollution", lots, types, extras).map((c) => [key(c.x, c.y), c.v]));
  let weight = 0;
  let pollution = 0;
  for (const l of lots) {
    const pop = typeOf.get(l.type_id)?.population ?? 0;
    if (pop <= 0 || !extras.connected.has(l.id)) continue;
    let sum = 0;
    for (let dx = 0; dx < l.w; dx++) for (let dy = 0; dy < l.h; dy++) sum += pollutionAt.get(key(l.x + dx, l.y + dy)) ?? 0;
    pollution += (sum / (l.w * l.h)) * pop;
    weight += pop;
  }
  const roads = computeLayer("traffic", lots, types, extras).map((c) => c.v).filter((v) => v > 0);
  const busy = roads.reduce((s, v) => s + v, 0);
  return {
    pollution: weight > 0 ? clamp(pollution / weight) : 0,
    traffic: busy > 0 ? clamp(roads.reduce((s, v) => s + v * v, 0) / busy) : 0,
  };
}
