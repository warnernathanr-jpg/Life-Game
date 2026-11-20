"use client";

// City buses. With two or more bus stations joined by roads, buses run a loop from station to station (nearest next),
// stopping a few seconds at each; one bus per station (up to 4), spread out along the loop. With one station, its bus
// waits inside for a while (25–50 seconds), then drives a tour of town (out past a few far-off roads) and comes back. Only for show (traffic numbers come from transportFactor in layers.ts).
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { key, type Tile } from "@/lib/roads";
import { roadPath, type Place } from "@/lib/sim";
import { BOX, mat } from "./models";
import { pointAt } from "./traffic";
import { busPositions, carPositions, isAhead, near } from "./vehicles";

const SPEED = 1.8; // tiles a second
const DWELL = 3; // seconds at each stop
const MAX_BUSES = 4;
const LANE = 0.2;
const GAP = 0.6; // keeps this far behind the vehicle ahead
const STUCK = 6; // seconds held up before nosing through anyway

/** May a bus at progress u along a path move on? Not with a car or bus just ahead, or a car in the crossing it's entering. */
function clearAhead(path: Tile[], u: number, self: number, roads: Set<string>, waited: number): boolean {
  if (waited > STUCK) return true;
  const p = pointAt(path, Math.min(u, path.length - 1), LANE);
  const me = { x: p.x, z: p.z, hx: Math.sin(p.heading), hz: Math.cos(p.heading) };
  if (carPositions.some((c) => isAhead(me, c, GAP))) return false;
  for (const [id, b] of busPositions) if (id !== self && isAhead(me, b, GAP + 0.15)) return false;
  const k = Math.floor(u);
  const next = path[k + 1];
  if (next && u - k > 0.5) {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (roads.has(key(next.x + dx, next.y + dy))) n++;
    if (n >= 3 && near(carPositions, next.x + 0.5, next.y + 0.5, 0.5)) return false;
  }
  return true;
}

type Leg = { path: Tile[]; stop: boolean };

/** Every road tile reachable from a tile, nearest first. */
function reachableTiles(roads: Set<string>, from: Tile): Tile[] {
  const seen = new Set([key(from.x, from.y)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      const k = key(n.x, n.y);
      if (roads.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return queue;
}

/** A tour for a lone station's bus: out to 2–3 random far-off road tiles and back to the station. */
export function busTour(roads: Set<string>, home: Tile, random = Math.random): Leg[] {
  const tiles = reachableTiles(roads, home);
  const far = tiles.slice(Math.floor(tiles.length / 2));
  if (far.length < 2) return [];
  const stops = Array.from({ length: 2 + Math.floor(random() * 2) }, () => far[Math.floor(random() * far.length)]);
  const points = [home, ...stops, home];
  const legs: Leg[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const path = roadPath(roads, points[i], points[i + 1]);
    if (path && path.length > 1) legs.push({ path, stop: false });
  }
  return legs;
}

/** The loop's legs: station to station (nearest unvisited next) and back to the first. */
export function busRoute(places: Place[], roads: Set<string>): Leg[] {
  const stations = places.filter((p) => p.typeId === "bus_station" && p.entrance).map((p) => p.entrance!);
  if (!stations.length) return [];
  const first = stations[0];
  const reachable = stations.filter((s, i) => i === 0 || roadPath(roads, first, s));
  if (reachable.length === 1) return []; // one station: tours instead (see busTour)
  const order = [first];
  const left = reachable.slice(1);
  while (left.length) {
    const at = order[order.length - 1];
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (Math.abs(left[i].x - at.x) + Math.abs(left[i].y - at.y) < Math.abs(left[best].x - at.x) + Math.abs(left[best].y - at.y)) best = i;
    }
    order.push(left.splice(best, 1)[0]);
  }
  const legs: Leg[] = [];
  for (let i = 0; i < order.length; i++) {
    const path = roadPath(roads, order[i], order[(i + 1) % order.length]);
    if (path && path.length > 1) legs.push({ path, stop: true });
  }
  return legs;
}

const BODY = mat("#facc15");
const STRIPE = mat("#0f766e");
const WINDOWS = mat("#1e293b");
const ROOF = mat("#fde047");

export function Buses({ places, roads, paused }: { places: Place[]; roads: Set<string>; paused: boolean }) {
  const { invalidate } = useThree();
  const legs = useMemo(() => busRoute(places, roads), [places, roads]);
  const home = useMemo(() => {
    const st = places.filter((p) => p.typeId === "bus_station" && p.entrance);
    return st.length >= 1 && legs.length === 0 ? st[0].entrance : null;
  }, [places, legs]);
  const count = legs.length ? Math.min(MAX_BUSES, places.filter((p) => p.typeId === "bus_station").length) : home ? 1 : 0;
  const state = useRef<{ leg: number; u: number; wait: number; held: number }[]>([]);
  const tour = useRef<{ legs: Leg[]; leg: number; u: number; wait: number; held: number }>({ legs: [], leg: 0, u: 0, wait: 0, held: 0 });
  const refs = useRef<(THREE.Group | null)[]>([]);
  const ticker = useRef<number | null>(null);
  const pausedRef = useRef(paused);
  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // One station: the bus waits inside, then sets off on a tour (counted in real seconds, so an idle map isn't kept busy).
  useLayoutEffect(() => {
    tour.current = { legs: [], leg: 0, u: 0, wait: 8 + Math.random() * 10, held: 0 };
    if (!home) return;
    ticker.current = window.setInterval(() => {
      const t = tour.current;
      if (t.legs.length || pausedRef.current || document.hidden) return;
      t.wait -= 1;
      if (t.wait > 0) return;
      t.legs = busTour(roads, home);
      t.leg = 0;
      t.u = 0;
      if (!t.legs.length) t.wait = 25 + Math.random() * 25;
      invalidate();
    }, 1000);
    return () => {
      if (ticker.current) window.clearInterval(ticker.current);
    };
  }, [home, roads, invalidate]);

  // A new route: spread the buses out along it.
  useLayoutEffect(() => {
    state.current = Array.from({ length: count }, (_, i) => ({ leg: Math.floor((i * legs.length) / Math.max(1, count)) % Math.max(1, legs.length), u: 0, wait: i === 0 ? DWELL : 0, held: 0 }));
    busPositions.clear();
    invalidate();
  }, [legs, count, invalidate]);

  useLayoutEffect(() => () => busPositions.clear(), []);

  useFrame((_, delta) => {
    const dt = paused ? 0 : Math.min(delta, 0.1);
    if (home) {
      const t = tour.current;
      const g = refs.current[0];
      if (g) g.visible = t.legs.length > 0;
      if (!t.legs.length || !g) {
        busPositions.delete(0);
        return;
      }
      if (dt > 0 && clearAhead(t.legs[t.leg].path, t.u, 0, roads, t.held)) {
        t.u += dt * SPEED;
        t.held = 0;
      } else t.held += dt;
      if (t.u >= t.legs[t.leg].path.length - 1) {
        t.u = 0;
        t.leg += 1;
        if (t.leg >= t.legs.length) {
          // Back at the station: park inside until the next tour.
          t.legs = [];
          t.wait = 25 + Math.random() * 25;
          g.visible = false;
          busPositions.delete(0);
          return;
        }
      }
      const leg = t.legs[t.leg];
      const p = pointAt(leg.path, Math.min(t.u, leg.path.length - 1), LANE);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.heading;
      busPositions.set(0, { x: p.x, z: p.z, hx: Math.sin(p.heading), hz: Math.cos(p.heading) });
      if (!paused) invalidate();
      return;
    }
    if (!legs.length) return;
    state.current.forEach((b, i) => {
      const leg = legs[b.leg % legs.length];
      if (b.wait > 0) b.wait -= dt;
      else if (dt > 0 && !clearAhead(leg.path, b.u, i, roads, b.held)) b.held += dt;
      else {
        b.u += dt * SPEED;
        b.held = 0;
        if (b.u >= leg.path.length - 1) {
          b.u = 0;
          b.leg = (b.leg + 1) % legs.length;
          b.wait = leg.stop ? DWELL : 0;
        }
      }
      const g = refs.current[i];
      const at = legs[b.leg % legs.length];
      if (!g) return;
      const p = pointAt(at.path, Math.min(b.u, at.path.length - 1), LANE);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.heading;
      busPositions.set(i, { x: p.x, z: p.z, hx: Math.sin(p.heading), hz: Math.cos(p.heading) });
    });
    if (!paused) invalidate();
  });

  return (
    <group raycast={() => null}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          {/* A tall city bus: yellow body, a band of windows all round, a teal stripe and a yellow roof. */}
          <mesh geometry={BOX} material={BODY} position={[0, 0.115, 0]} scale={[0.17, 0.21, 0.46]} castShadow />
          <mesh geometry={BOX} material={WINDOWS} position={[0, 0.165, 0]} scale={[0.175, 0.065, 0.42]} />
          <mesh geometry={BOX} material={WINDOWS} position={[0, 0.16, 0.231]} scale={[0.14, 0.08, 0.01]} />
          <mesh geometry={BOX} material={STRIPE} position={[0, 0.075, 0]} scale={[0.176, 0.025, 0.46]} />
          <mesh geometry={BOX} material={ROOF} position={[0, 0.224, 0]} scale={[0.16, 0.01, 0.42]} />
        </group>
      ))}
    </group>
  );
}
