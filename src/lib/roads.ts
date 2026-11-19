// Road helpers: drag strokes, auto-connecting road shapes, and which buildings touch a road.

export type Tile = { x: number; y: number };
export type Lot = { id: string; type_id: string; x: number; y: number; size: number };

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
