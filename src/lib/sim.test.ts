import { describe, expect, it } from "vitest";
import type { Lot } from "./roads";
import { citizensFrom, clockText, decide, MAX_CITIZENS, placesFrom, roadPath, travelMode, type Place } from "./sim";

const types = [
  { id: "road", name: "Road", category: "road" as const, population: 0, jobs: 0 },
  { id: "cottage", name: "House", category: "residential" as const, population: 4, jobs: 0 },
  { id: "shop", name: "Corner Shop", category: "commercial" as const, population: 0, jobs: 4 },
  { id: "park", name: "Small Park", category: "service" as const, population: 0, jobs: 0 },
  { id: "school", name: "School", category: "service" as const, population: 0, jobs: 3 },
];
const road = (x: number, y: number): Lot => ({ id: `r${x},${y}`, type_id: "road", x, y, size: 1 });
const lots: Lot[] = [
  ...Array.from({ length: 10 }, (_, x) => road(x, 3)),
  { id: "home-a", type_id: "cottage", x: 0, y: 2, size: 1 },
  { id: "home-b", type_id: "cottage", x: 1, y: 2, size: 1 },
  { id: "shop-1", type_id: "shop", x: 8, y: 4, size: 1 },
  { id: "park-1", type_id: "park", x: 9, y: 2, size: 1 },
  { id: "school-1", type_id: "school", x: 5, y: 4, size: 1 },
  { id: "lonely", type_id: "cottage", x: 5, y: 8, size: 1 },
];

describe("city simulation", () => {
  const places = placesFrom(lots, types);
  const byId = new Map(places.map((p) => [p.id, p] as [string, Place]));

  it("finds each building's road entrance (none without a road)", () => {
    expect(byId.get("home-a")!.entrance).toEqual({ x: 0, y: 3 });
    expect(byId.get("shop-1")!.entrance).toEqual({ x: 8, y: 3 });
    expect(byId.get("lonely")!.entrance).toBeNull();
  });

  it("gives every home named residents, the same ones every time, with jobs only at reachable places", () => {
    const a = citizensFrom(places);
    expect(a).toHaveLength(12);
    expect(citizensFrom(placesFrom(lots, types))).toEqual(a);
    for (const c of a) expect(c.name).toMatch(/^\S+ \S+$/);
    const workers = a.filter((c) => c.workId);
    expect(workers.length).toBeLessThanOrEqual(7); // 4 shop jobs + 3 school jobs
    expect(a.filter((c) => c.homeId === "lonely" && c.workId)).toHaveLength(0); // no road, no commute
  });

  it("caps the number of simulated citizens", () => {
    const many: Lot[] = Array.from({ length: 40 }, (_, i) => ({ id: `h${i}`, type_id: "cottage", x: i, y: 0, size: 1 }));
    expect(citizensFrom(placesFrom(many, types)).length).toBeLessThanOrEqual(MAX_CITIZENS);
  });

  it("routes along roads only", () => {
    const roads = new Set(lots.filter((l) => l.type_id === "road").map((l) => `${l.x},${l.y}`));
    expect(roadPath(roads, { x: 0, y: 3 }, { x: 8, y: 3 })).toHaveLength(9);
    expect(roadPath(roads, { x: 0, y: 3 }, { x: 5, y: 8 })).toBeNull();
  });

  it("follows a daily routine", () => {
    const worker = { id: "w", name: "Ava Chen", age: 30, homeId: "home-a", workId: "shop-1", schoolId: null, shirt: "", car: "", seed: 0 };
    const r = () => 0.99;
    expect(decide(worker, "home-a", 3 * 60, byId, r)).toEqual({ stayUntil: 6 * 60 + 30 }); // asleep until 6:30
    expect(decide(worker, "home-a", 8 * 60, byId, r)).toEqual({ purpose: "work", toId: "shop-1" });
    expect(decide(worker, "shop-1", 12 * 60, byId, r)).toEqual({ stayUntil: 16 * 60 + 30 });
    expect(decide(worker, "shop-1", 17 * 60, byId, r)).toEqual({ purpose: "home", toId: "home-a" });
    const kid = { ...worker, age: 9, workId: null, schoolId: "school-1" };
    expect(decide(kid, "home-a", 8 * 60, byId, r)).toEqual({ purpose: "school", toId: "school-1" });
    const retiree = { ...worker, age: 75, workId: null };
    expect(decide(retiree, "home-a", 10 * 60, byId, () => 0.1)).toMatchObject({ purpose: "shop" });
  });

  it("walks short trips, drives long ones, and tells the time", () => {
    expect(travelMode(3, "shop", 40)).toBe("walk");
    expect(travelMode(12, "work", 40)).toBe("car");
    expect(travelMode(12, "school", 10)).toBe("walk");
    expect(clockText(7 * 60 + 5)).toBe("7:05 AM");
    expect(clockText(24 * 60 + 13 * 60)).toBe("1:00 PM");
  });
});
