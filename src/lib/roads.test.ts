import { describe, expect, it } from "vitest";
import { connectedIds, facingFor, roadSet, roadShape, strokePath, touchesRoad } from "./roads";

describe("strokePath", () => {
  it("is straight along a row", () => {
    expect(strokePath({ x: 1, y: 2 }, { x: 4, y: 2 })).toEqual([
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    ]);
  });
  it("goes along the longer side first, then turns", () => {
    expect(strokePath({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 },
    ]);
    expect(strokePath({ x: 2, y: 3 }, { x: 1, y: 0 }).map((t) => `${t.x},${t.y}`)).toEqual(["2,3", "2,2", "2,1", "2,0", "1,0"]);
  });
  it("a single tap is one tile", () => {
    expect(strokePath({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }]);
  });
});

describe("road shapes and connections", () => {
  // A T-junction: row 1 from x=0..2, plus (1,2).
  const lots = [
    { id: "r1", type_id: "road", x: 0, y: 1, size: 1 },
    { id: "r2", type_id: "road", x: 1, y: 1, size: 1 },
    { id: "r3", type_id: "road", x: 2, y: 1, size: 1 },
    { id: "r4", type_id: "road", x: 1, y: 2, size: 1 },
    { id: "home", type_id: "cottage", x: 0, y: 0, size: 1 },
    { id: "far", type_id: "cottage", x: 5, y: 5, size: 1 },
    { id: "big", type_id: "factory", x: 2, y: 2, size: 2 },
    { id: "diag", type_id: "cottage", x: 3, y: 0, size: 1 },
  ];
  const roads = roadSet(lots);
  it("finds each tile's connections", () => {
    expect(roadShape(1, 1, roads)).toEqual({ n: false, e: true, s: true, w: true });
    expect(roadShape(1, 2, roads)).toEqual({ n: true, e: false, s: false, w: false });
  });
  it("counts buildings next to a road, not diagonal", () => {
    expect([...connectedIds(lots)].sort()).toEqual(["big", "home"]);
    expect(touchesRoad({ x: 3, y: 0, size: 1 }, roads)).toBe(false);
  });
});

describe("facingFor", () => {
  const roads = (tiles: [number, number][]) => new Set(tiles.map(([x, y]) => `${x},${y}`));
  it("faces the side with road", () => {
    expect(facingFor({ x: 2, y: 2, size: 1 }, roads([[2, 3]]))).toBe("south");
    expect(facingFor({ x: 2, y: 2, size: 1 }, roads([[2, 1]]))).toBe("north");
    expect(facingFor({ x: 2, y: 2, size: 1 }, roads([[3, 2]]))).toBe("east");
    expect(facingFor({ x: 2, y: 2, size: 1 }, roads([[1, 2]]))).toBe("west");
  });
  it("prefers the side with more road, and south on ties", () => {
    // 2x2 at (2,2): one tile of road north, two tiles west.
    expect(facingFor({ x: 2, y: 2, size: 2 }, roads([[2, 1], [1, 2], [1, 3]]))).toBe("west");
    expect(facingFor({ x: 2, y: 2, size: 1 }, roads([[2, 1], [2, 3]]))).toBe("south");
  });
  it("keeps facing south with no road", () => {
    expect(facingFor({ x: 0, y: 0, size: 1 }, new Set())).toBe("south");
  });
});
