// Map layers: for each building, road or patch of land, a value from 0 (good, green) to 1 (bad, red), worked out from the
// city's layout. Shown over the 3D map from the full-screen page's Layers button.

import type { BuildingTypeRow } from "./database.types";
import { RECREATION_IDS } from "./game";
import { isRoadType, key, type Lot, type Tile } from "./roads";
import { roadPath, type Citizen, type Place } from "./sim";

export type LayerId = "traffic" | "fire" | "crime" | "education" | "health" | "pollution" | "land_value";

export const LAYERS: { id: LayerId; label: string; good: string; bad: string; about: string }[] = [
  { id: "traffic", label: "Traffic", good: "Quiet", bad: "Jammed", about: "How busy each road is: daily trips compared with what it can carry. Wider roads carry more; busy crossings jam unless they have a stop sign or, better, a traffic light." },
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

/** Daily trips a road tile carries before it starts to jam (the layer and the jam score use 1 − e^(−0.8 × trips / capacity)). */
const ROAD_CAPACITY: Record<string, number> = { dirt_road: 20, road: 60, bridge: 60, avenue: 150 };
/** How much traffic a crossing lets through, compared with a plain stretch of the same road. */
export const CROSSING_FACTOR: Record<"none" | "stop" | "light", number> = { none: 0.4, stop: 1.2, light: 2.4 };
/** Roads within 2 tiles of a stop sign / traffic light carry this much more (traffic is kept moving). */
const CALMED: Record<"stop" | "light", number> = { stop: 1.3, light: 1.6 };

/**
 * How busy the roads are because of how people get around: 1.5 with no transport buildings (everyone drives); bus
 * stations, parking garages, gas stations and an airport bring it down (to 0.35 at best).
 */
export function transportFactor(lots: Pick<Lot, "type_id">[]): number {
  const n = (id: string) => lots.filter((l) => l.type_id === id).length;
  return Math.max(0.35, 1.5 - 0.3 * Math.min(3, n("bus_station")) - 0.15 * Math.min(3, n("parking")) - 0.08 * Math.min(2, n("gas_station")) - 0.2 * Math.min(1, n("airport")));
}

/** Share of would-be car trips taken by bus instead (0 with no transport buildings, up to 70%), for the moving traffic. */
export function transitShare(lots: Pick<Lot, "type_id">[]): number {
  return clamp((1.5 - transportFactor(lots)) / (1.5 - 0.35)) * 0.7;
}
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
  extras: { size: number; places: Place[]; citizens: Citizen[]; connected: Set<string>; controls?: Map<string, "stop" | "light"> },
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
      const busy = transportFactor(lots);
      const controlled = [...(extras.controls ?? [])].map(([k, kind]) => ({ ...(([x, y]) => ({ x, y }))(k.split(",").map(Number)), kind }));
      // Crossings are bottlenecks: without a stop sign or light cars squeeze through one at a time; a stop sign helps a
      // little, a traffic light lets a whole direction go at once. A jammed crossing backs up onto the roads next to it.
      const roadTiles = lots.filter((l) => isRoadType(l.type_id));
      const value = new Map<string, number>();
      for (const l of roadTiles) {
        const k = key(l.x, l.y);
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (roads.has(key(l.x + dx, l.y + dy))) n++;
        const control = extras.controls?.get(k);
        let factor = n >= 3 ? CROSSING_FACTOR[control ?? "none"] : 1;
        if (n < 3 || control) {
          let calm = 1;
          for (const c of controlled) if (Math.abs(c.x - l.x) + Math.abs(c.y - l.y) <= 2) calm = Math.max(calm, CALMED[c.kind]);
          factor *= calm;
        }
        value.set(k, 1 - Math.exp((-0.8 * (counts.get(k) ?? 0) * busy) / ((ROAD_CAPACITY[l.type_id] ?? 60) * factor)));
      }
      const spilled = new Map(value);
      for (const l of roadTiles) {
        const v = value.get(key(l.x, l.y)) ?? 0;
        if (v <= 0.5) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key(l.x + dx, l.y + dy);
          if (spilled.has(nk)) spilled.set(nk, Math.max(spilled.get(nk)!, v * 0.75));
        }
      }
      return roadTiles.map((l) => ({ x: l.x, y: l.y, w: 1, h: 1, v: clamp(spilled.get(key(l.x, l.y)) ?? 0) }));
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
  extras: { size: number; places: Place[]; citizens: Citizen[]; connected: Set<string>; controls?: Map<string, "stop" | "light"> },
): { pollution: number; traffic: number; safety: number; transport: number } {
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
  // Fire and crime risk at homes (weighted by residents): no fire station or police nearby makes people uneasy.
  const risk = (layer: "fire" | "crime") => {
    const at = new Map(computeLayer(layer, lots, types, extras).map((c) => [key(c.x, c.y), c.v]));
    let sum = 0;
    let w = 0;
    for (const l of lots) {
      const pop = typeOf.get(l.type_id)?.population ?? 0;
      if (pop <= 0 || !extras.connected.has(l.id)) continue;
      sum += (at.get(key(l.x, l.y)) ?? 0) * pop;
      w += pop;
    }
    return w > 0 ? sum / w : 0;
  };
  const roads = computeLayer("traffic", lots, types, extras).map((c) => c.v).filter((v) => v > 0);
  const busy = roads.reduce((s, v) => s + v, 0);
  // Stop signs and lights keep traffic flowing city-wide (a little for each, up to 40% calmer).
  const calm = Math.max(0.6, 1 - 0.05 * (extras.controls?.size ?? 0));
  return {
    pollution: weight > 0 ? clamp(pollution / weight) : 0,
    traffic: busy > 0 ? clamp((roads.reduce((s, v) => s + v * v, 0) / busy) * calm) : 0,
    safety: clamp((risk("fire") + risk("crime")) / 2),
    transport: transportFactor(lots),
  };
}
