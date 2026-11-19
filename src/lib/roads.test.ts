import { describe, expect, it } from "vitest";
import { connectedIds, effectiveFacing, facingFor, nextFacing, roadSet, rowJoins, roadShape, roadSides, strokePath, touchesRoad, type Lot } from "./roads";

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

describe("rotating buildings on corners", () => {
  const roads = new Set(["2,3", "3,2"]); // south and east of (2,2)
  const lot = { x: 2, y: 2, size: 1 };
  it("lists the road sides and cycles through them", () => {
    expect(roadSides(lot, roads)).toEqual(["south", "east"]);
    expect(nextFacing({ ...lot, facing: null }, roads)).toBe("east");
    expect(nextFacing({ ...lot, facing: "east" }, roads)).toBe("south");
  });
  it("keeps a saved choice only while that side has road", () => {
    expect(effectiveFacing({ ...lot, facing: "east" }, roads)).toBe("east");
    expect(effectiveFacing({ ...lot, facing: "north" }, roads)).toBe("south");
  });
  it("one road side: no rotate option", () => {
    expect(nextFacing({ ...lot, facing: null }, new Set(["2,3"]))).toBeNull();
  });
});

describe("townhome rows", () => {
  const street = new Set(["0,1", "1,1", "2,1", "3,1"]); // road along row 1
  const th = (id: string, x: number, y: number) => ({ id, type_id: "house", x, y, size: 1 });
  it("joins neighbors that face the same road", () => {
    const j = rowJoins([th("a", 0, 0), th("b", 1, 0), th("c", 2, 0)], street, "house");
    // All face south toward the road; south-facing right = east.
    expect(j.get("a")).toEqual({ left: false, right: true });
    expect(j.get("b")).toEqual({ left: true, right: true });
    expect(j.get("c")).toEqual({ left: true, right: false });
  });
  it("doesn't join across different facings or other building types", () => {
    const j = rowJoins([th("a", 0, 0), { ...th("x", 1, 0), type_id: "cottage" }, th("c", 0, 2)], street, "house");
    expect(j.size).toBe(0);
  });
});

describe("bridges", () => {
  it("count as road for shapes and connections", () => {
    const lots: Lot[] = [
      { id: "r", type_id: "road", x: 0, y: 0, size: 1 },
      { id: "b", type_id: "bridge", x: 1, y: 0, size: 1 },
      { id: "h", type_id: "cottage", x: 1, y: 1, size: 1 },
    ];
    expect(roadShape(0, 0, roadSet(lots)).e).toBe(true);
    expect(connectedIds(lots).has("h")).toBe(true);
    expect(connectedIds(lots).has("b")).toBe(false);
  });
});
