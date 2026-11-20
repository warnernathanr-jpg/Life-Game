// Road helpers: drag strokes, auto-connecting road shapes, and which buildings touch a road.

export type Tile = { x: number; y: number };
/** A placed thing on the grid: w × h tiles from (x, y) (a turned building's w and h are already swapped). */
export type Lot = { id: string; type_id: string; x: number; y: number; w: number; h: number; facing?: Facing | null; color_seed?: number | null };
type Box = Pick<Lot, "x" | "y" | "w" | "h">;

/** Tiles just outside each side of a footprint. */
function edges(lot: Box) {
  const xs = Array.from({ length: lot.w }, (_, i) => lot.x + i);
  const ys = Array.from({ length: lot.h }, (_, i) => lot.y + i);
  return {
    south: xs.map((x) => key(x, lot.y + lot.h)),
    north: xs.map((x) => key(x, lot.y - 1)),
    east: ys.map((y) => key(lot.x + lot.w, y)),
    west: ys.map((y) => key(lot.x - 1, y)),
  };
}

export const ROAD_TYPE = "road";
export const DIRT_ROAD_TYPE = "dirt_road";
export const AVENUE_TYPE = "avenue";
export const BRIDGE_TYPE = "bridge";
/** Every kind of road (dirt, 2-lane, 4-lane) and bridges carry traffic and connect buildings. */
export const ROAD_TYPES = new Set([DIRT_ROAD_TYPE, ROAD_TYPE, AVENUE_TYPE, BRIDGE_TYPE]);
export const isRoadType = (typeId: string) => ROAD_TYPES.has(typeId);

export const key = (x: number, y: number) => `${x},${y}`;

/**
 * Tiles from a to b as an L: along the longer axis first, then the other, so a mostly
 * straight drag gives a straight road. Includes both ends.
 */
export function strokePath(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  const horizontalFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  let x = a.x;
  let y = a.y;
  out.push({ x, y });
  if (horizontalFirst) {
    while (x !== b.x) out.push({ x: (x += dx), y });
    while (y !== b.y) out.push({ x, y: (y += dy) });
  } else {
    while (y !== b.y) out.push({ x, y: (y += dy) });
    while (x !== b.x) out.push({ x: (x += dx), y });
  }
  return out;
}

export type RoadShape = { n: boolean; e: boolean; s: boolean; w: boolean };

/** Which neighbors of a road tile are also road (north = y - 1). */
export function roadShape(x: number, y: number, roads: Set<string>): RoadShape {
  return {
    n: roads.has(key(x, y - 1)),
    e: roads.has(key(x + 1, y)),
    s: roads.has(key(x, y + 1)),
    w: roads.has(key(x - 1, y)),
  };
}

export function roadSet(lots: Pick<Lot, "type_id" | "x" | "y">[]): Set<string> {
  return new Set(lots.filter((l) => isRoadType(l.type_id)).map((l) => key(l.x, l.y)));
}

/** A building touches a road when any tile next to its footprint (not diagonal) is road. */
export function touchesRoad(lot: Box, roads: Set<string>): boolean {
  const e = edges(lot);
  return [...e.south, ...e.north, ...e.east, ...e.west].some((k) => roads.has(k));
}

/** Ids of buildings (not roads) that touch a road. */
/**
 * Buildings that count: those touching the town's main road network (the largest group of joined road tiles). A building
 * on a stretch of road that isn't joined to the rest of town is cut off: nobody can drive there, so it doesn't count.
 */
export function connectedIds(lots: Lot[]): Set<string> {
  const main = mainRoadNetwork(roadSet(lots));
  return new Set(lots.filter((l) => !isRoadType(l.type_id) && touchesRoad(l, main)).map((l) => l.id));
}

/** The largest group of road tiles joined edge to edge (ties: the first found). */
export function mainRoadNetwork(roads: Set<string>): Set<string> {
  const seen = new Set<string>();
  let best = new Set<string>();
  for (const start of roads) {
    if (seen.has(start)) continue;
    const group = new Set<string>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const [x, y] = queue.pop()!.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(x + dx, y + dy);
        if (roads.has(k) && !seen.has(k)) {
          seen.add(k);
          group.add(k);
          queue.push(k);
        }
      }
    }
    if (group.size > best.size) best = group;
  }
  return best;
}

export type Facing = "south" | "east" | "west" | "north";

/** Y rotation (radians) that turns a model's front (+z, "south") to face each direction. */
export const FACING_ROTATION: Record<Facing, number> = { south: 0, east: Math.PI / 2, west: -Math.PI / 2, north: Math.PI };

/** Sides a building may face: any for squares; only the two long sides for rectangles (so the model lines up). */
export function allowedSides(lot: Box): Facing[] {
  if (lot.w === lot.h) return ["south", "east", "west", "north"];
  return lot.w > lot.h ? ["south", "north"] : ["east", "west"];
}

/**
 * Which side of a building faces the road: the allowed side with the most road tiles along it
 * (ties: south, east, west, north). Buildings without a road face their first allowed side.
 */
export function facingFor(lot: Box, roads: Set<string>): Facing {
  const e = edges(lot);
  const allowed = allowedSides(lot);
  let best: Facing = allowed[0];
  let bestCount = -1;
  for (const side of ["south", "east", "west", "north"] as const) {
    if (!allowed.includes(side)) continue;
    const n = e[side].filter((k) => roads.has(k)).length;
    if (n > bestCount) {
      best = side;
      bestCount = n;
    }
  }
  return best;
}

/** Allowed sides of a building that have road along them (south, east, west, north order). */
export function roadSides(lot: Box, roads: Set<string>): Facing[] {
  const e = edges(lot);
  const allowed = allowedSides(lot);
  return (["south", "east", "west", "north"] as const).filter((side) => allowed.includes(side) && e[side].some((k) => roads.has(k)));
}

/** The side a building faces: the owner's choice if it still has road, otherwise automatic (facingFor). */
export function effectiveFacing(lot: Box & Pick<Lot, "facing">, roads: Set<string>): Facing {
  if (lot.facing && roadSides(lot, roads).includes(lot.facing)) return lot.facing;
  return facingFor(lot, roads);
}

/** The next road side to turn to (for the Rotate button), or null when there's only one choice. */
export function nextFacing(lot: Box & Pick<Lot, "facing">, roads: Set<string>): Facing | null {
  const sides = roadSides(lot, roads);
  if (sides.length < 2) return null;
  const now = effectiveFacing(lot, roads);
  return sides[(sides.indexOf(now) + 1) % sides.length];
}

/** World step to a building's right-hand side (its local +x) for each facing. */
const RIGHT_OF: Record<Facing, [number, number]> = { south: [1, 0], north: [-1, 0], east: [0, -1], west: [0, 1] };

/**
 * Which townhomes join their neighbors into a row: a neighbor directly to the left or right that is also a
 * townhome facing the same way. Returns, per joined townhome, which sides join.
 */
export function rowJoins(lots: Lot[], roads: Set<string>, typeId: string): Map<string, { left: boolean; right: boolean }> {
  const homes = lots.filter((l) => l.type_id === typeId && l.w === 1 && l.h === 1);
  const at = new Map(homes.map((h) => [key(h.x, h.y), h]));
  const facing = new Map(homes.map((h) => [h.id, effectiveFacing(h, roads)]));
  const out = new Map<string, { left: boolean; right: boolean }>();
  for (const h of homes) {
    const f = facing.get(h.id)!;
    const [dx, dy] = RIGHT_OF[f];
    const right = at.get(key(h.x + dx, h.y + dy));
    const left = at.get(key(h.x - dx, h.y - dy));
    const joins = { left: !!left && facing.get(left.id) === f, right: !!right && facing.get(right.id) === f };
    if (joins.left || joins.right) out.set(h.id, joins);
  }
  return out;
}

/** Road kinds in order, for upgrading a road by tapping it. */
export const ROAD_TIERS = [DIRT_ROAD_TYPE, ROAD_TYPE, AVENUE_TYPE] as const;

/**
 * The street a road tile is on: the straight run of tiles of the same kind through it (the longer of its row and its
 * column; bridges and other road kinds end it).
 */
export function streetOf(start: Tile, typeAt: (x: number, y: number) => string | undefined): Tile[] {
  const kind = typeAt(start.x, start.y);
  const run = (dx: number, dy: number) => {
    const out: Tile[] = [];
    for (let i = 1; typeAt(start.x + dx * i, start.y + dy * i) === kind; i++) out.push({ x: start.x + dx * i, y: start.y + dy * i });
    return out;
  };
  const row = [...run(-1, 0).reverse(), start, ...run(1, 0)];
  const col = [...run(0, -1).reverse(), start, ...run(0, 1)];
  return col.length > row.length ? col : row;
}
