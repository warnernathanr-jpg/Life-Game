import { describe, expect, it } from "vitest";
import type { BuildingTypeRow, ProgressRow } from "./database.types";
import { cityStats, landPrice, lotFree, nextUnlocks, sellRefund, tasksToUnlock } from "./game";

function type(p: Partial<BuildingTypeRow> & Pick<BuildingTypeRow, "id">): BuildingTypeRow {
  return {
    name: p.id, category: "residential", icon: "🏠", description: "", cost: 10, size: 1,
    population: 0, jobs: 0, happiness: 0, unlock_area: null, unlock_count: null, sort_order: 0, ...p,
  };
}

const types = [
  type({ id: "cottage", population: 4 }),
  type({ id: "shop", category: "commercial", jobs: 4, happiness: 1 }),
  type({ id: "factory", category: "industrial", jobs: 30, happiness: -6, size: 2, unlock_area: "work", unlock_count: 10 }),
  type({ id: "park", category: "service", happiness: 5, unlock_area: "health", unlock_count: 3 }),
  type({ id: "clinic", category: "service", jobs: 6, happiness: 6, unlock_area: "health", unlock_count: 10 }),
  type({ id: "road", category: "road" }),
];

let n = 0;
const at = (type_id: string, x: number, y: number) => ({ id: `b${n++}`, type_id, x, y });
/** A road along row 0 from x = 0 to 9; buildings on row 1 touch it. */
const street = Array.from({ length: 10 }, (_, x) => at("road", x, 0));

const progress = (p: Partial<ProgressRow>): ProgressRow => ({
  balance: 0, earned_today: 0, health: 0, work: 0, learning: 0, home: 0, social: 0, ...p,
});

describe("prices (same as the database)", () => {
  it("land: 300 × 1.6ⁿ rounded to 10", () => {
    expect([0, 1, 2, 3].map(landPrice)).toEqual([300, 480, 770, 1230]);
  });
  it("selling refunds half, rounded down", () => {
    expect(sellRefund(141)).toBe(70);
  });
});

describe("unlocks", () => {
  it("counts remaining tasks in the building's area", () => {
    expect(tasksToUnlock(types[3], progress({ health: 1 }))).toBe(2);
    expect(tasksToUnlock(types[3], progress({ health: 5 }))).toBe(0);
    expect(tasksToUnlock(types[0], null)).toBe(0);
  });
  it("names the next unlock per area", () => {
    const health = nextUnlocks(types, progress({ health: 4 })).find((u) => u.area.id === "health")!;
    expect(health.next?.id).toBe("clinic");
    expect(health.remaining).toBe(6);
    const learning = nextUnlocks(types, progress({})).find((u) => u.area.id === "learning")!;
    expect(learning.next).toBeUndefined();
  });
});

describe("cityStats", () => {
  it("empty city", () => {
    const s = cityStats([], types);
    expect(s).toMatchObject({ population: 0, jobs: 0, happiness: 50, score: 0 });
    expect(s.tips[0]).toMatch(/Start with/);
  });
  it("adds population, jobs and happiness", () => {
    const s = cityStats([...street, at("cottage", 0, 1), at("cottage", 1, 1), at("shop", 2, 1), at("park", 3, 1)], types);
    expect(s).toMatchObject({ population: 8, jobs: 4, employed: 4, happiness: 56, score: 4, roads: 10, buildings: 4, unconnected: 0 });
  });
  it("buildings away from a road don't count", () => {
    const s = cityStats([...street, at("cottage", 0, 1), at("cottage", 5, 5), at("factory", 7, 7)], types);
    expect(s).toMatchObject({ population: 4, jobs: 0, unconnected: 2 });
    expect(s.tips[0]).toMatch(/2 buildings aren't next to a road/);
  });
  it("penalises unemployment and clamps happiness", () => {
    const homes = Array.from({ length: 10 }, (_, x) => at("cottage", x, 1));
    const s = cityStats([...street, ...homes], types);
    expect(s.happiness).toBe(40);
    expect(s.tips.some((t) => t.includes("jobs"))).toBe(true);
    const factories = Array.from({ length: 5 }, (_, i) => at("factory", i * 2, 1));
    const sad = cityStats([...street, ...factories], types);
    expect(sad.happiness).toBe(20); // 50 − 5 × 6
  });
});

describe("lotFree", () => {
  const placed = [{ id: "f", x: 2, y: 2, size: 2 }];
  it("checks bounds and overlap", () => {
    expect(lotFree(8, { x: 0, y: 0, size: 1 }, placed)).toBe(true);
    expect(lotFree(8, { x: 3, y: 3, size: 1 }, placed)).toBe(false);
    expect(lotFree(8, { x: 1, y: 1, size: 2 }, placed)).toBe(false);
    expect(lotFree(8, { x: 7, y: 7, size: 2 }, placed)).toBe(false);
    expect(lotFree(8, { x: -1, y: 0, size: 1 }, placed)).toBe(false);
  });
  it("ignores the building being moved", () => {
    expect(lotFree(8, { x: 3, y: 2, size: 2 }, placed, "f")).toBe(true);
  });
});
