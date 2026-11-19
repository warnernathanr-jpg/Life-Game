// Road helpers: drag strokes, auto-connecting road shapes, and which buildings touch a road.

export type Tile = { x: number; y: number };
export type Lot = { id: string; type_id: string; x: number; y: number; size: number; facing?: Facing | null };

export const ROAD_TYPE = "road";

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
  return new Set(lots.filter((l) => l.type_id === ROAD_TYPE).map((l) => key(l.x, l.y)));
}

/** A building touches a road when any tile next to its footprint (not diagonal) is road. */
export function touchesRoad(lot: Pick<Lot, "x" | "y" | "size">, roads: Set<string>): boolean {
  for (let i = 0; i < lot.size; i++) {
    if (
      roads.has(key(lot.x + i, lot.y - 1)) ||
      roads.has(key(lot.x + i, lot.y + lot.size)) ||
      roads.has(key(lot.x - 1, lot.y + i)) ||
      roads.has(key(lot.x + lot.size, lot.y + i))
    ) {
      return true;
    }
  }
  return false;
}

/** Ids of buildings (not roads) that touch a road. */
export function connectedIds(lots: Lot[]): Set<string> {
  const roads = roadSet(lots);
  return new Set(lots.filter((l) => l.type_id !== ROAD_TYPE && touchesRoad(l, roads)).map((l) => l.id));
}

export type Facing = "south" | "east" | "west" | "north";

/** Y rotation (radians) that turns a model's front (+z, "south") to face each direction. */
export const FACING_ROTATION: Record<Facing, number> = { south: 0, east: Math.PI / 2, west: -Math.PI / 2, north: Math.PI };

/**
 * Which side of a building faces the road: the side with the most road tiles along it
 * (ties: south, east, west, north). Buildings without a road keep facing south.
 */
export function facingFor(lot: Pick<Lot, "x" | "y" | "size">, roads: Set<string>): Facing {
  const count = { south: 0, east: 0, west: 0, north: 0 };
  for (let i = 0; i < lot.size; i++) {
    if (roads.has(key(lot.x + i, lot.y + lot.size))) count.south++;
    if (roads.has(key(lot.x + lot.size, lot.y + i))) count.east++;
    if (roads.has(key(lot.x - 1, lot.y + i))) count.west++;
    if (roads.has(key(lot.x + i, lot.y - 1))) count.north++;
  }
  let best: Facing = "south";
  for (const side of ["south", "east", "west", "north"] as const) if (count[side] > count[best]) best = side;
  return best;
}

/** Sides of a building that have road along them (south, east, west, north order). */
export function roadSides(lot: Pick<Lot, "x" | "y" | "size">, roads: Set<string>): Facing[] {
  const sides: Facing[] = [];
  const has = (tiles: [number, number][]) => tiles.some(([x, y]) => roads.has(key(x, y)));
  const span = Array.from({ length: lot.size }, (_, i) => i);
  if (has(span.map((i) => [lot.x + i, lot.y + lot.size]))) sides.push("south");
  if (has(span.map((i) => [lot.x + lot.size, lot.y + i]))) sides.push("east");
  if (has(span.map((i) => [lot.x - 1, lot.y + i]))) sides.push("west");
  if (has(span.map((i) => [lot.x + i, lot.y - 1]))) sides.push("north");
  return sides;
}

/** The side a building faces: the owner's choice if it still has road, otherwise automatic (facingFor). */
export function effectiveFacing(lot: Pick<Lot, "x" | "y" | "size" | "facing">, roads: Set<string>): Facing {
  if (lot.facing && roadSides(lot, roads).includes(lot.facing)) return lot.facing;
  return facingFor(lot, roads);
}

/** The next road side to turn to (for the Rotate button), or null when there's only one choice. */
export function nextFacing(lot: Pick<Lot, "x" | "y" | "size" | "facing">, roads: Set<string>): Facing | null {
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
  const homes = lots.filter((l) => l.type_id === typeId && l.size === 1);
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
