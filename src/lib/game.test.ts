import { describe, expect, it } from "vitest";
import type { BuildingTypeRow, ProgressRow } from "./database.types";
import { cityStats, landPrice, lotFree, nextMilestone, nextUnlocks, sellRefund, pointsToUnlock } from "./game";

function type(p: Partial<BuildingTypeRow> & Pick<BuildingTypeRow, "id">): BuildingTypeRow {
  return {
    name: p.id, category: "residential", icon: "", description: "", cost: 10, size: 1,
    population: 0, jobs: 0, happiness: 0, unlock_area: null, unlock_points: null, upgrades_to: null, sort_order: 0,
    w: p.w ?? p.size ?? 1, d: p.d ?? p.size ?? 1, ...p,
  };
}

const types = [
  type({ id: "cottage", population: 4 }),
  type({ id: "shop", category: "commercial", jobs: 4, happiness: 1 }),
  type({ id: "factory", category: "industrial", jobs: 30, happiness: -6, size: 2, unlock_area: "work", unlock_points: 250 }),
  type({ id: "park", category: "service", happiness: 5, unlock_area: "health", unlock_points: 75 }),
  type({ id: "clinic", category: "service", jobs: 6, happiness: 6, unlock_area: "health", unlock_points: 250 }),
  type({ id: "road", category: "road" }),
  type({ id: "tree", category: "landscape", happiness: 1 }),
];

let n = 0;
const at = (type_id: string, x: number, y: number) => ({ id: `b${n++}`, type_id, x, y });
/** A road along row 0 from x = 0 to 9; buildings on row 1 touch it. */
const street = Array.from({ length: 10 }, (_, x) => at("road", x, 0));

const progress = (p: Partial<ProgressRow>): ProgressRow => ({
  balance: 0, earned_today: 0, health: 0, work: 0, knowledge: 0, personal: 0, ...p,
});

describe("prices (same as the database)", () => {
  it("land: 300 × 1.6ⁿ rounded to 10", () => {
    expect([0, 1, 2, 3].map(landPrice)).toEqual([300, 480, 770, 1230]);
  });
  it("selling refunds half, rounded down", () => {
    expect(sellRefund(141)).toBe(70);
  });
});

describe("unlocks by area points", () => {
  it("counts remaining points in the building's area", () => {
    expect(pointsToUnlock(types[3], progress({ health: 25 }))).toBe(50);
    expect(pointsToUnlock(types[3], progress({ health: 80 }))).toBe(0);
    expect(pointsToUnlock(types[0], null)).toBe(0);
  });
  it("names the next unlock per area", () => {
    const health = nextUnlocks(types, progress({ health: 100 })).find((u) => u.area.id === "health")!;
    expect(health.next?.id).toBe("clinic");
    expect(health.remaining).toBe(150);
    const knowledge = nextUnlocks(types, progress({})).find((u) => u.area.id === "knowledge")!;
    expect(knowledge.next).toBeUndefined();
  });
});

describe("milestones", () => {
  it("finds the next one", () => {
    expect(nextMilestone(0)).toEqual({ at: 10, bonus: 25 });
    expect(nextMilestone(10)).toEqual({ at: 30, bonus: 75 });
    expect(nextMilestone(365)).toBeNull();
  });
});

describe("cityStats", () => {
  it("empty city", () => {
    const s = cityStats([], types);
    expect(s).toMatchObject({ population: 0, jobs: 0, happiness: 50, score: 0, healthLabel: "Empty land" });
    expect(s.tips[0]).toMatch(/Start with/);
  });
  it("adds population, jobs and happiness from road-connected buildings", () => {
    const s = cityStats([...street, at("cottage", 0, 1), at("cottage", 1, 1), at("shop", 2, 1), at("park", 3, 1)], types);
    expect(s).toMatchObject({ population: 8, jobs: 4, employed: 4, unemployed: 4, roads: 10, buildings: 4, unconnected: 0 });
    // 50 + park 5 + shop 1 − unemployment (4 of 8 → 10) = 46
    expect(s.happiness).toBe(46);
    expect(s.factors.find((f) => f.key === "unemployment")?.tip).toMatch(/4 residents can't find work/);
  });
  it("buildings away from a road don't count", () => {
    const s = cityStats([...street, at("cottage", 0, 1), at("cottage", 5, 5), at("factory", 7, 7)], types);
    expect(s).toMatchObject({ population: 4, jobs: 0, unconnected: 2 });
    expect(s.tips.some((t) => t.includes("2 buildings aren't on a road joined to the rest of town"))).toBe(true);
  });
  it("flags shops and industry when there aren't enough workers", () => {
    const shop = at("shop", 0, 1);
    const factory = at("factory", 2, 1);
    const s = cityStats([...street, at("cottage", 6, 1), shop, factory], types);
    expect(s.staffing).toBeCloseTo(4 / 34);
    expect([...s.understaffed].sort()).toEqual([factory.id, shop.id].sort());
    expect(s.factors.find((f) => f.key === "workers")?.tip).toMatch(/only 12% staffed/);
    const full = cityStats([...street, at("cottage", 0, 1), at("shop", 1, 1)], types);
    expect(full.understaffed.size).toBe(0);
  });
  it("nature helps, but only up to the cap", () => {
    const trees = Array.from({ length: 30 }, (_, i) => at("tree", i % 10, 8 + Math.floor(i / 10)));
    const s = cityStats([...street, at("cottage", 0, 1), at("shop", 1, 1), ...trees], types);
    expect(s.factors.find((f) => f.key === "nature")?.value).toBe(10);
    expect(s.landscape).toBe(30);
    expect(s.unconnected).toBe(0);
  });
  it("life balance rewards points in every area", () => {
    const even = cityStats([], types, progress({ health: 100, work: 100, knowledge: 100, personal: 100 }));
    expect(even.factors.find((f) => f.key === "balance")?.value).toBe(10);
    const lopsided = cityStats([], types, progress({ health: 0, work: 400, knowledge: 50, personal: 50 }));
    const b = lopsided.factors.find((f) => f.key === "balance")!;
    expect(b.value).toBe(0);
    expect(b.tip).toMatch(/Health points are lowest/);
  });
  it("health averages happiness, jobs, roads and services", () => {
    const s = cityStats([...street, at("cottage", 0, 1), at("shop", 1, 1), at("park", 2, 1)], types);
    // happiness 56, jobs 4/4 → 100, roads 100, services 5 / (4/2) → 100
    expect(s.health).toBe(Math.round((56 + 100 + 100 + 100) / 4));
    expect(s.healthLabel).toBe("Thriving");
  });
});

describe("lotFree", () => {
  const placed = [{ id: "f", x: 2, y: 2, w: 2, h: 2 }];
  it("checks bounds and overlap", () => {
    expect(lotFree(8, { x: 0, y: 0, w: 1, h: 1 }, placed)).toBe(true);
    expect(lotFree(8, { x: 3, y: 3, w: 1, h: 1 }, placed)).toBe(false);
    expect(lotFree(8, { x: 1, y: 1, w: 2, h: 2 }, placed)).toBe(false);
    expect(lotFree(8, { x: 7, y: 7, w: 2, h: 2 }, placed)).toBe(false);
    expect(lotFree(8, { x: -1, y: 0, w: 1, h: 1 }, placed)).toBe(false);
  });
  it("handles rectangles and ignores trees", () => {
    const long = [{ id: "m", x: 0, y: 0, w: 3, h: 1 }, { id: "t", x: 5, y: 5, w: 1, h: 1, type_id: "tree" }];
    expect(lotFree(8, { x: 2, y: 0, w: 1, h: 1 }, long)).toBe(false);
    expect(lotFree(8, { x: 0, y: 1, w: 3, h: 1 }, long)).toBe(true);
    expect(lotFree(8, { x: 5, y: 4, w: 1, h: 2 }, long)).toBe(true);
    expect(lotFree(8, { x: 7, y: 0, w: 1, h: 3 }, long)).toBe(true);
    expect(lotFree(8, { x: 6, y: 0, w: 3, h: 1 }, long)).toBe(false);
  });
  it("ignores the building being moved", () => {
    expect(lotFree(8, { x: 3, y: 2, w: 2, h: 2 }, placed, "f")).toBe(true);
  });
});

describe("build groups", () => {
  it("groups services into Knowledge, Recreation, Transport and Landmarks", async () => {
    const { buildGroupOf } = await import("./game");
    expect(buildGroupOf({ id: "school", category: "service" })).toBe("knowledge");
    expect(buildGroupOf({ id: "library", category: "service" })).toBe("knowledge");
    expect(buildGroupOf({ id: "court", category: "service" })).toBe("recreation");
    expect(buildGroupOf({ id: "airport", category: "service" })).toBe("transport");
    expect(buildGroupOf({ id: "monument", category: "service" })).toBe("landmark");
    expect(buildGroupOf({ id: "university", category: "service" })).toBe("knowledge");
    expect(buildGroupOf({ id: "clinic", category: "service" })).toBe("service");
    expect(buildGroupOf({ id: "bridge", category: "road" })).toBeNull();
  });
});
