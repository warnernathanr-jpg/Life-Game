"use client";

// The living city: citizens leave home, drive or walk along the roads to work, school, the shops or a park, stay a
// while and come home again, on a game clock (a day lasts 6 real minutes). Tap a car or a person to see who it is
// and where they're going; pause to freeze everyone in place.
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { key, type Tile } from "@/lib/roads";
import {
  SIM_MINUTES_PER_SECOND,
  clockText,
  decide,
  dwellMinutes,
  outing,
  purposeWord,
  rng,
  roadPath,
  roleText,
  travelMode,
  type Citizen,
  type Place,
  type Purpose,
} from "@/lib/sim";
import { BOX, mat } from "./models";
import { clock, lightFor } from "./sim-clock";
export { gameClock, lightFor, setGameClock } from "./sim-clock";
import type { RoadControlKind } from "@/lib/database.types";
import { TAIL_COLOR } from "./day-night";

const HEADLIGHT = mat("#fef3c7");
const TAILLIGHT = mat(TAIL_COLOR);

export type CitizenInfo = {
  id: string;
  name: string;
  age: number;
  role: string;
  /** "Driving to work at Corner Shop", "At home", … */
  status: string;
  /** "From House · arrives about 8:05 AM", "Until 5:10 PM", … */
  detail: string;
  mode: "car" | "walk" | "inside";
  /** The place they're heading to or are at (outlined on the map). */
  placeId: string | null;
};

export type SimProps = {
  places: Place[];
  citizens: Citizen[];
  paused: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onInfo: (info: CitizenInfo | null) => void;
  onClock: (minutes: number) => void;
};

/** u: progress along the path in tiles (0 … path.length); waited: real seconds spent held at an intersection. */
type Trip = {
  purpose: Purpose; fromId: string; toId: string; path: Tile[]; mode: "car" | "walk"; start: number; u: number; waited: number;
  /** The crossing this car has been let into (green light, or done stopping at the stop sign). */
  passKey?: string;
  /** Seconds stopped at a stop sign so far. */
  stopWait?: number;
};
type State = { at: string; until: number; trip: null } | { at: null; until: number; trip: Trip };

const CAR_SLOTS = 32;
const WALK_SLOTS = 32;
/** Road tiles per real second. */
const SPEED = { car: 2.2, walk: 0.6 };


/** Game minutes still to go on a trip (for "arrives about"). */
function minutesLeft(trip: Trip) {
  return (Math.max(0, trip.path.length - trip.u) / SPEED[trip.mode]) * SIM_MINUTES_PER_SECOND;
}

/** How far right of the road's centre line people keep: cars in their lane, walkers on the sidewalk. */
const SIDE = { car: 0.2, walk: 0.43 };
/** A car stops when another car is this close ahead in its lane (tiles). */
const GAP = 0.42;
/** Give up waiting at an intersection after this many real seconds (avoids gridlock). */
const MAX_WAIT = 4;
/** Real seconds a car stands still at a stop sign. */
const STOP_SECONDS = 0.45;

type Dir = { x: number; z: number };
const dirOf = (a: Tile, b: Tile): Dir => ({ x: Math.sign(b.x - a.x), z: Math.sign(b.y - a.y) });

/**
 * Where someone is at progress u along a path, keeping to the right. Each tile is crossed from its entry edge to its
 * exit edge; on a turn tile the line curves (a quadratic curve through the lane's corner), so cars turn smoothly.
 * The first and last tiles run from / to the tile's middle. Returns position and heading.
 */
function pointAt(path: Tile[], u: number, side: number) {
  const n = path.length - 1;
  if (n <= 0) return { x: path[0].x + 0.5, z: path[0].y + 0.5, heading: 0 };
  const k = Math.max(0, Math.min(n, Math.floor(u)));
  const f = Math.max(0, Math.min(1, u - k));
  const dIn = dirOf(path[Math.max(0, k - 1)], path[Math.max(1, k)]);
  const dOut = k < n ? dirOf(path[k], path[k + 1]) : dirOf(path[n - 1], path[n]);
  const right = (d: Dir) => ({ x: -d.z * side, z: d.x * side });
  const c = { x: path[k].x + 0.5, z: path[k].y + 0.5 };
  const rIn = right(dIn);
  const rOut = right(dOut);
  const entry = k === 0 ? { x: c.x + rOut.x, z: c.z + rOut.z } : { x: c.x - dIn.x * 0.5 + rIn.x, z: c.z - dIn.z * 0.5 + rIn.z };
  const exit = k === n ? { x: c.x + rIn.x, z: c.z + rIn.z } : { x: c.x + dOut.x * 0.5 + rOut.x, z: c.z + dOut.z * 0.5 + rOut.z };
  const turning = k > 0 && k < n && (dIn.x !== dOut.x || dIn.z !== dOut.z) && !(dIn.x === -dOut.x && dIn.z === -dOut.z);
  if (!turning) {
    const dx = exit.x - entry.x;
    const dz = exit.z - entry.z;
    const d = k === 0 ? dOut : dIn;
    return { x: entry.x + dx * f, z: entry.z + dz * f, heading: Math.atan2(dx || d.x, dz || d.z) };
  }
  // The lane's corner: along the incoming direction from the entry, across from the exit.
  const ctrl = dIn.x !== 0 ? { x: exit.x, z: entry.z } : { x: entry.x, z: exit.z };
  const g = 1 - f;
  const x = g * g * entry.x + 2 * g * f * ctrl.x + f * f * exit.x;
  const z = g * g * entry.z + 2 * g * f * ctrl.z + f * f * exit.z;
  const tx = 2 * g * (ctrl.x - entry.x) + 2 * f * (exit.x - ctrl.x);
  const tz = 2 * g * (ctrl.z - entry.z) + 2 * f * (exit.z - ctrl.z);
  return { x, z, heading: Math.atan2(tx, tz) };
}

export function Traffic({ sim, roads, controls }: { sim: SimProps; roads: Set<string>; controls?: Map<string, RoadControlKind> }) {
  const { invalidate, camera, gl } = useThree();
  const places = useMemo(() => new Map(sim.places.map((p) => [p.id, p])), [sim.places]);
  const states = useRef(new Map<string, State>());
  const random = useRef(rng(0x51ab));
  const pathCache = useRef(new Map<string, Tile[] | null>());

  // Keep people across city edits; reset anyone whose place disappeared. New residents start at home.
  useLayoutEffect(() => {
    pathCache.current.clear();
    const next = new Map<string, State>();
    for (const c of sim.citizens) {
      const s = states.current.get(c.id);
      const ok = s && (s.trip ? places.has(s.trip.toId) && places.has(s.trip.fromId) : places.has(s.at!));
      next.set(c.id, ok ? s! : { at: c.homeId, until: clock.t + (c.seed % 30), trip: null });
    }
    states.current = next;
    invalidate();
  }, [sim.citizens, places, roads, invalidate]);

  const route = (from: Place, to: Place) => {
    if (!from.entrance || !to.entrance) return null;
    const k = `${key(from.entrance.x, from.entrance.y)}>${key(to.entrance.x, to.entrance.y)}`;
    if (!pathCache.current.has(k)) pathCache.current.set(k, roadPath(roads, from.entrance, to.entrance));
    return pathCache.current.get(k) ?? null;
  };

  const carRefs = useRef<(THREE.Group | null)[]>([]);
  const walkRefs = useRef<(THREE.Group | null)[]>([]);
  const carBody = useMemo(() => Array.from({ length: CAR_SLOTS }, () => new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.5 })), []);
  const shirts = useMemo(() => Array.from({ length: WALK_SLOTS }, () => new THREE.MeshStandardMaterial({ color: "#3b82f6", roughness: 0.8 })), []);
  const slotOwner = useRef<{ car: (string | null)[]; walk: (string | null)[] }>({ car: [], walk: [] });
  const marker = useRef<THREE.Mesh>(null);
  const goal = useRef<THREE.Mesh>(null);
  const lastInfo = useRef(0);
  const lastInfoKey = useRef("");
  const lastClock = useRef(-1);

  const describe = (c: Citizen, t: number): CitizenInfo => {
    const s = states.current.get(c.id);
    const base = { id: c.id, name: c.name, age: c.age, role: roleText(c, places) };
    if (!s) return { ...base, status: "At home", detail: "", mode: "inside", placeId: c.homeId };
    if (s.trip) {
      const to = places.get(s.trip.toId);
      const from = places.get(s.trip.fromId);
      const verb = s.trip.mode === "car" ? "Driving" : "Walking";
      const where = s.trip.purpose === "home" ? "home" : `to ${purposeWord(s.trip.purpose)}${to ? ` at ${to.name}` : ""}`;
      return {
        ...base,
        status: `${verb} ${where}`,
        detail: `From ${s.trip.fromId === c.homeId ? "home" : (from?.name ?? "somewhere")} · arrives about ${clockText(t + minutesLeft(s.trip))}`,
        mode: s.trip.mode,
        placeId: s.trip.toId,
      };
    }
    const at = places.get(s.at);
    const label = s.at === c.homeId ? "At home" : s.at === c.workId ? `At work · ${at?.name ?? ""}` : s.at === c.schoolId ? `At school · ${at?.name ?? ""}` : `At ${at?.name ?? "a place"}`;
    const home = places.get(c.homeId);
    const detail = s.at === c.homeId && !home?.entrance ? "Can't go anywhere: the home has no road" : s.until > t ? `Until about ${clockText(s.until)}` : "Heading out soon";
    return { ...base, status: label, detail, mode: "inside", placeId: s.at };
  };

  // Which car is crossing each intersection tile right now.
  const reservations = useRef(new Map<string, string>());
  const isJunction = (tile: Tile) => {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (roads.has(key(tile.x + dx, tile.y + dy))) n++;
    return n >= 3;
  };

  const lastNudge = useRef(-Infinity);

  /** Set off on a trip (if there's a way there and room on the streets). Returns whether they left. */
  const start = (c: Citizen, s: State, plan: { purpose: Purpose; toId: string }, t: number, active: number): boolean => {
    if (s.trip || !s.at) return false;
    const from = places.get(s.at);
    const to = places.get(plan.toId);
    const path = from && to ? route(from, to) : null;
    if (!path) {
      s.until = t + 60; // no way there: try again later
      return false;
    }
    if (active >= CAR_SLOTS + WALK_SLOTS - 4) {
      s.until = t + 5; // the streets are full: leave a little later
      return false;
    }
    const mode = travelMode(path.length, plan.purpose, c.age);
    // Don't pull out on top of another car: wait a moment until the start of the road is clear.
    if (mode === "car") {
      const startPt = pointAt(path, 0, SIDE.car);
      const crowded = [...states.current.values()].some((o) => {
        if (!o.trip || o.trip.mode !== "car") return false;
        const q = pointAt(o.trip.path, o.trip.u, SIDE.car);
        return Math.hypot(q.x - startPt.x, q.z - startPt.z) < GAP;
      });
      if (crowded) {
        s.until = t + 2;
        return false;
      }
    }
    states.current.set(c.id, { at: null, until: 0, trip: { purpose: plan.purpose, fromId: s.at, toId: plan.toId, path, mode, start: t, u: 0, waited: 0 } });
    return true;
  };

  useFrame((_, delta) => {
    const t0 = clock.t;
    const dt = sim.paused ? 0 : Math.min(delta, 0.1);
    clock.t += dt * SIM_MINUTES_PER_SECOND;
    const t = clock.t;
    let active = 0;
    for (const s of states.current.values()) if (s.trip) active++;

    if (!sim.paused) {
      for (const c of sim.citizens) {
        const s = states.current.get(c.id);
        if (!s) continue;
        if (s.trip) {
          if (s.trip.u >= s.trip.path.length) {
            const purpose = s.trip.purpose;
            const linger = purpose === "home" ? 30 : dwellMinutes(purpose, random.current);
            states.current.set(c.id, { at: s.trip.toId, until: t + linger, trip: null });
            active--;
          }
          continue;
        }
        if (t < s.until) continue;
        const plan = decide(c, s.at, t, places, random.current);
        if ("stayUntil" in plan) {
          s.until = Math.max(plan.stayUntil, t + 1);
          continue;
        }
        if (start(c, s, plan, t, active)) active++;
      }
      // Always a little life on the streets: if only a few people are out (night, weekend lull, small town),
      // send someone at home on an errand, a walk or a visit. Checked every few game minutes.
      const minOut = Math.min(4, Math.ceil(sim.citizens.length / 4));
      if (active < minOut && t - lastNudge.current > 3) {
        lastNudge.current = t;
        const homeBodies = sim.citizens.filter((c) => {
          const s = states.current.get(c.id);
          return s && !s.trip && s.at === c.homeId && c.age >= 12;
        });
        const c = homeBodies[Math.floor(random.current() * homeBodies.length)];
        const s = c && states.current.get(c.id);
        const plan = c ? outing(c, places, random.current) : null;
        if (c && s && plan && start(c, s, plan, t, active)) active++;
      }
    }


    // Move everyone who's out. Walkers just walk; cars keep their distance and take turns at intersections.
    if (dt > 0) {
      const travelling: { id: string; trip: Trip; x: number; z: number; hx: number; hz: number }[] = [];
      for (const c of sim.citizens) {
        const s = states.current.get(c.id);
        if (!s?.trip || s.trip.mode !== "car") continue;
        const p = pointAt(s.trip.path, s.trip.u, SIDE.car);
        travelling.push({ id: c.id, trip: s.trip, x: p.x, z: p.z, hx: Math.sin(p.heading), hz: Math.cos(p.heading) });
      }
      const holds = reservations.current;
      // Forget holds by cars that are no longer driving.
      const driving = new Set(travelling.map((a) => a.id));
      for (const [k, id] of holds) if (!driving.has(id)) holds.delete(k);
      for (const c of sim.citizens) {
        const s = states.current.get(c.id);
        if (!s?.trip) continue;
        const trip = s.trip;
        const step = dt * SPEED[trip.mode];
        if (trip.mode === "walk") {
          trip.u += step;
          continue;
        }
        const me = travelling.find((a) => a.id === c.id)!;
        // 1. Following: someone just ahead in the same direction → wait.
        const blocked = travelling.some((o) => {
          if (o.id === c.id) return false;
          const dx = o.x - me.x;
          const dz = o.z - me.z;
          const ahead = dx * me.hx + dz * me.hz;
          const sideways = Math.abs(dx * me.hz - dz * me.hx);
          const sameWay = o.hx * me.hx + o.hz * me.hz > 0.3;
          if (!sameWay || sideways >= 0.18) return false;
          // Right on top of each other (e.g. two cars that just left the same place): one waits.
          if (Math.abs(ahead) <= 0.05) return o.id < c.id;
          return ahead > 0 && ahead < GAP;
        });
        // 2. Intersections (3+ roads meet): only one car inside at a time; others wait at the edge.
        const k = Math.floor(trip.u);
        const next = trip.path[k + 1];
        let mayGo = !blocked;
        if (mayGo && next && trip.u - k > 0.55 && isJunction(next)) {
          const nk = key(next.x, next.y);
          const control = controls?.get(nk);
          const here = trip.path[k];
          if (control === "light") {
            // Traffic light: wait for green in your direction; then everyone going your way crosses together.
            if (trip.passKey !== nk) {
              const axis = next.x !== here.x ? "x" : "y";
              if (lightFor(axis, t) !== "green" && trip.waited < MAX_WAIT * 3) mayGo = false;
              else trip.passKey = nk;
            }
          } else {
            // Stop sign: a full stop for a moment first, then take turns as usual.
            if (control === "stop" && trip.passKey !== nk) {
              trip.stopWait = (trip.stopWait ?? 0) + dt;
              if (trip.stopWait < STOP_SECONDS) mayGo = false;
              else {
                trip.passKey = nk;
                trip.stopWait = 0;
              }
            }
            if (mayGo) {
              const holder = holds.get(nk);
              if (holder && holder !== c.id && trip.waited < MAX_WAIT) mayGo = false;
              else holds.set(nk, c.id);
            }
          }
        }
        if (mayGo) {
          const before = Math.floor(trip.u);
          trip.u = Math.min(trip.u + step, trip.path.length);
          trip.waited = 0;
          // Left a tile: let go of it.
          if (Math.floor(trip.u) !== before) {
            const left = trip.path[before];
            if (left && holds.get(key(left.x, left.y)) === c.id) holds.delete(key(left.x, left.y));
          }
        } else {
          trip.waited += dt;
        }
      }
    }

    // Draw everyone who's out, in pooled meshes.
    let car = 0;
    let walk = 0;
    const owners = slotOwner.current;
    let selectedPos: THREE.Vector3 | null = null;
    for (const c of sim.citizens) {
      const s = states.current.get(c.id);
      if (!s?.trip) continue;
      const isCar = s.trip.mode === "car";
      const slot = isCar ? car : walk;
      if (slot >= (isCar ? CAR_SLOTS : WALK_SLOTS)) continue;
      const g = (isCar ? carRefs : walkRefs).current[slot];
      if (!g) continue;
      const pt = pointAt(s.trip.path, s.trip.u, SIDE[s.trip.mode]);
      g.visible = true;
      g.position.set(pt.x, isCar ? 0.03 : 0.065 + Math.abs(Math.sin(t * 9 + c.seed)) * 0.012, pt.z); // walkers stand on the sidewalk
      g.rotation.y = pt.heading;
      const list = isCar ? owners.car : owners.walk;
      if (list[slot] !== c.id) {
        list[slot] = c.id;
        (isCar ? carBody : shirts)[slot].color.set(isCar ? c.car : c.shirt);
      }
      if (c.id === sim.selectedId) selectedPos = g.position.clone();
      if (isCar) car++;
      else walk++;
    }
    for (let i = car; i < CAR_SLOTS; i++) {
      if (carRefs.current[i]) carRefs.current[i]!.visible = false;
      owners.car[i] = null;
    }
    for (let i = walk; i < WALK_SLOTS; i++) {
      if (walkRefs.current[i]) walkRefs.current[i]!.visible = false;
      owners.walk[i] = null;
    }

    // Selected citizen: a marker over them (or over the place they're in), and their destination outlined.
    const selected = sim.selectedId ? sim.citizens.find((c) => c.id === sim.selectedId) : undefined;
    const info = selected ? describe(selected, t) : null;
    if (marker.current) {
      let pos = selectedPos;
      if (!pos && info?.placeId) {
        const p = places.get(info.placeId);
        if (p) pos = new THREE.Vector3(p.x + p.w / 2, 0.9, p.y + p.h / 2);
      }
      marker.current.visible = !!pos;
      if (pos) marker.current.position.set(pos.x, pos.y + 0.45 + Math.sin(t * 2) * 0.03, pos.z);
    }
    if (goal.current) {
      const p = info?.placeId && info.mode !== "inside" ? places.get(info.placeId) : undefined;
      goal.current.visible = !!p;
      if (p) {
        goal.current.position.set(p.x + p.w / 2, 0.02, p.y + p.h / 2);
        goal.current.scale.set(p.w * 0.98, 0.02, p.h * 0.98);
      }
    }

    // Tell the page (a few times a second, not every frame).
    const now = performance.now();
    if (now - lastInfo.current > 250) {
      lastInfo.current = now;
      const k = info ? JSON.stringify(info) : "";
      if (k !== lastInfoKey.current) {
        lastInfoKey.current = k;
        sim.onInfo(info);
      }
    }
    const tick = Math.floor(t / 5);
    if (tick !== lastClock.current) {
      lastClock.current = tick;
      sim.onClock(t);
    }
    if (!sim.paused && sim.citizens.length > 0 && t !== t0) invalidate();
  });

  // Unpausing (or the first citizens moving in) starts the animation loop again.
  useLayoutEffect(() => {
    invalidate();
  }, [sim.paused, sim.selectedId, sim.citizens, invalidate]);

  // Development only: where each visible car/walker is on screen (lets browser tests tap one).
  useLayoutEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __lifeCityAgents?: () => { kind: string; x: number; y: number }[] };
    w.__lifeCityAgents = () => {
      const r = gl.domElement.getBoundingClientRect();
      const out: { kind: string; x: number; y: number }[] = [];
      for (const [kind, refs] of [["car", carRefs], ["walk", walkRefs]] as const) {
        for (const g of refs.current) {
          if (!g?.visible) continue;
          const p = g.position.clone().setY(0.08).project(camera);
          out.push({ kind, x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, wx: g.position.x, wz: g.position.z, h: g.rotation.y } as never);
        }
      }
      return out;
    };
    return () => {
      delete w.__lifeCityAgents;
    };
  }, [camera, gl]);

  const pick = (kind: "car" | "walk", i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const id = slotOwner.current[kind][i];
    if (id) sim.onSelect(id);
  };

  return (
    <>
      {Array.from({ length: CAR_SLOTS }, (_, i) => (
        <group key={`c${i}`} ref={(el) => { carRefs.current[i] = el; }} visible={false} onClick={pick("car", i)}>
          <mesh geometry={BOX} material={carBody[i]} position={[0, 0.05, 0]} scale={[0.16, 0.07, 0.28]} castShadow />
          <mesh geometry={BOX} material={CAR_GLASS} position={[0, 0.11, -0.02]} scale={[0.13, 0.06, 0.14]} />
          {/* Headlights and taillights (they glow after dark, see day-night.tsx). */}
          <mesh geometry={BOX} material={HEADLIGHT} position={[-0.05, 0.06, 0.141]} scale={[0.035, 0.02, 0.01]} />
          <mesh geometry={BOX} material={HEADLIGHT} position={[0.05, 0.06, 0.141]} scale={[0.035, 0.02, 0.01]} />
          <mesh geometry={BOX} material={TAILLIGHT} position={[-0.055, 0.06, -0.141]} scale={[0.03, 0.02, 0.01]} />
          <mesh geometry={BOX} material={TAILLIGHT} position={[0.055, 0.06, -0.141]} scale={[0.03, 0.02, 0.01]} />
          {/* A bigger invisible box makes small cars easy to tap. */}
          <mesh geometry={BOX} material={HIT} position={[0, 0.1, 0]} scale={[0.4, 0.3, 0.5]} />
        </group>
      ))}
      {Array.from({ length: WALK_SLOTS }, (_, i) => (
        <group key={`w${i}`} ref={(el) => { walkRefs.current[i] = el; }} visible={false} onClick={pick("walk", i)}>
          <mesh geometry={BOX} material={PANTS} position={[0, 0.03, 0]} scale={[0.05, 0.06, 0.04]} />
          <mesh geometry={BOX} material={shirts[i]} position={[0, 0.085, 0]} scale={[0.065, 0.06, 0.045]} castShadow />
          <mesh geometry={BOX} material={SKIN} position={[0, 0.135, 0]} scale={[0.04, 0.04, 0.04]} />
          <mesh geometry={BOX} material={HIT} position={[0, 0.1, 0]} scale={[0.3, 0.35, 0.3]} />
        </group>
      ))}
      <mesh ref={marker} visible={false} geometry={MARKER_GEO} material={MARKER} raycast={() => null} />
      <mesh ref={goal} visible={false} geometry={BOX} material={GOAL} raycast={() => null} />
    </>
  );
}

const CAR_GLASS = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.3 });
const PANTS = new THREE.MeshStandardMaterial({ color: "#334155" });
const SKIN = new THREE.MeshStandardMaterial({ color: "#e0b48a" });
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const MARKER = new THREE.MeshBasicMaterial({ color: "#facc15" });
const MARKER_GEO = new THREE.OctahedronGeometry(0.09);
const GOAL = new THREE.MeshBasicMaterial({ color: "#2dd4bf", transparent: true, opacity: 0.45, depthWrite: false });

