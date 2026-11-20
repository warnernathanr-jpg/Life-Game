import { describe, expect, it } from "vitest";
import { cityExposure, computeLayer, layerColor } from "./layers";
import type { Lot } from "./roads";
import { citizensFrom, placesFrom } from "./sim";

const types = [
  { id: "road", name: "Road", category: "road" as const, population: 0, jobs: 0 },
  { id: "dirt_road", name: "Dirt", category: "road" as const, population: 0, jobs: 0 },
  { id: "cottage", name: "House", category: "residential" as const, population: 4, jobs: 0 },
  { id: "factory", name: "Plant", category: "industrial" as const, population: 0, jobs: 30 },
  { id: "fire_station", name: "Fire", category: "service" as const, population: 0, jobs: 6 },
  { id: "school", name: "School", category: "service" as const, population: 0, jobs: 8 },
  { id: "park", name: "Park", category: "service" as const, population: 0, jobs: 0 },
];
const L = (id: string, type_id: string, x: number, y: number, w = 1, h = 1): Lot => ({ id, type_id, x, y, w, h });
const road = Array.from({ length: 12 }, (_, x) => L(`r${x}`, "road", x, 5));
const extras = (lots: Lot[]) => {
  const places = placesFrom(lots, types);
  return { size: 12, places, citizens: citizensFrom(places), connected: new Set(lots.map((l) => l.id)) };
};

describe("map layers", () => {
  it("fire hazard drops next to a fire station", () => {
    const lots = [...road, L("near", "cottage", 1, 4), L("far", "cottage", 11, 4), L("fs", "fire_station", 0, 4)];
    const cells = computeLayer("fire", lots, types, extras(lots));
    const v = (x: number) => cells.find((c) => c.x === x && c.y === 4)!.v;
    expect(v(1)).toBeLessThan(v(11));
  });

  it("education is bad with no school and good beside one", () => {
    const lots = [...road, L("h1", "cottage", 1, 4), L("s", "school", 2, 4, 2, 1)];
    expect(computeLayer("education", lots, types, extras(lots))[0].v).toBeLessThan(0.7);
    const none = [...road, L("h1", "cottage", 1, 4)];
    expect(computeLayer("education", none, types, extras(none))[0].v).toBe(1);
  });

  it("pollution is worst beside a factory and fades away", () => {
    const lots = [...road, L("f", "factory", 0, 0, 2, 2)];
    const cells = computeLayer("pollution", lots, types, extras(lots));
    const at = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y)!.v;
    expect(at(2, 0)).toBeGreaterThan(at(9, 9));
    expect(at(9, 9)).toBe(0);
  });

  it("traffic fills a dirt road faster than a 2-lane road", () => {
    const homes = [L("h0", "cottage", 0, 4)];
    const lots = (t: string) => [...Array.from({ length: 12 }, (_, x) => L(`r${x}`, t, x, 5)), ...homes, L("f", "factory", 10, 6, 2, 2)];
    const busiest = (t: string) => Math.max(...computeLayer("traffic", lots(t), types, extras(lots(t))).map((c) => c.v));
    expect(busiest("dirt_road")).toBeGreaterThan(busiest("road"));
  });

  it("a crossing jams without a stop sign or light, less with a stop sign, least with a traffic light", () => {
    // Homes on the west, a big workplace on the east: everyone drives through the crossing at (6,5).
    const side = [L("n", "road", 6, 4), L("s", "road", 6, 6)];
    const homes = [L("h0", "cottage", 0, 4)];
    const lots = [...road, ...side, ...homes, L("f", "factory", 10, 6, 2, 2)];
    const at = (controls?: Map<string, "stop" | "light">) =>
      computeLayer("traffic", lots, types, { ...extras(lots), controls }).find((c) => c.x === 6 && c.y === 5)!.v;
    const none = at();
    const stop = at(new Map([["6,5", "stop"]]));
    const light = at(new Map([["6,5", "light"]]));
    expect(none).toBeGreaterThan(0);
    expect(stop).toBeLessThan(none);
    expect(light).toBeLessThan(stop);
  });

  it("colors run green to red", () => {
    expect(layerColor(0)).toBe("#22c55e");
    expect(layerColor(1)).toBe("#ef4444");
  });

  it("homes next to a factory live with pollution; far away they don't", () => {
    const near = [...road, L("h", "cottage", 2, 4), L("f", "factory", 0, 2, 2, 2)];
    const far = [...road, L("h", "cottage", 11, 4), L("f", "factory", 0, 0, 2, 2)];
    expect(cityExposure(near, types, extras(near)).pollution).toBeGreaterThan(0.5);
    expect(cityExposure(far, types, extras(far)).pollution).toBe(0);
  });
});
