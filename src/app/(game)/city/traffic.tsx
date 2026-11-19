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
  purposeWord,
  rng,
  roadPath,
  roleText,
  travelMode,
  type Citizen,
  type Place,
  type Purpose,
} from "@/lib/sim";
import { BOX } from "./models";

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

type Trip = { purpose: Purpose; fromId: string; toId: string; path: Tile[]; mode: "car" | "walk"; start: number };
type State = { at: string; until: number; trip: null } | { at: null; until: number; trip: Trip };

/** The game starts at 7:15 AM on day 1, just as the morning commute begins. */
const START = 7 * 60 + 15;
const CAR_SLOTS = 32;
const WALK_SLOTS = 32;
/** Road tiles per real second. */
const SPEED = { car: 2.2, walk: 0.6 };

/** Game clock shared across remounts (so changing the city doesn't send everyone back to 7:15). */
const clock = { t: START };

function tripMinutes(trip: Trip) {
  return (Math.max(1, trip.path.length - 1) / SPEED[trip.mode]) * SIM_MINUTES_PER_SECOND;
}

export function Traffic({ sim, roads }: { sim: SimProps; roads: Set<string> }) {
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

  /** Where someone on a trip is right now: position and heading. */
  const placeOnPath = (trip: Trip, t: number, out: THREE.Vector3) => {
    const p = Math.min(trip.path.length - 1, ((t - trip.start) / SIM_MINUTES_PER_SECOND) * SPEED[trip.mode]);
    const i = Math.min(Math.floor(p), Math.max(0, trip.path.length - 2));
    const a = trip.path[i];
    const b = trip.path[Math.min(i + 1, trip.path.length - 1)];
    const f = trip.path.length > 1 ? p - i : 0;
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    // Keep right: cars in their lane, people on the sidewalk by the curb.
    const side = trip.mode === "car" ? 0.2 : 0.38;
    out.set(a.x + 0.5 + dx * f - dz * side, 0, a.y + 0.5 + dz * f + dx * side);
    return Math.atan2(dx, dz);
  };

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
        detail: `From ${s.trip.fromId === c.homeId ? "home" : (from?.name ?? "somewhere")} · arrives about ${clockText(s.trip.start + tripMinutes(s.trip))}`,
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

  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const t0 = clock.t;
    if (!sim.paused) clock.t += Math.min(delta, 0.1) * SIM_MINUTES_PER_SECOND;
    const t = clock.t;
    let active = 0;
    for (const s of states.current.values()) if (s.trip) active++;

    if (!sim.paused) {
      for (const c of sim.citizens) {
        const s = states.current.get(c.id);
        if (!s) continue;
        if (s.trip) {
          if (t >= s.trip.start + tripMinutes(s.trip)) {
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
        const from = places.get(s.at);
        const to = places.get(plan.toId);
        const path = from && to ? route(from, to) : null;
        if (!path) {
          s.until = t + 60; // no way there: try again later
          continue;
        }
        if (active >= CAR_SLOTS + WALK_SLOTS - 4) {
          s.until = t + 5; // the streets are full: leave a little later
          continue;
        }
        const mode = travelMode(path.length, plan.purpose, c.age);
        states.current.set(c.id, { at: null, until: 0, trip: { purpose: plan.purpose, fromId: s.at, toId: plan.toId, path, mode, start: t } });
        active++;
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
      const heading = placeOnPath(s.trip, t, v);
      g.visible = true;
      g.position.set(v.x, isCar ? 0.03 : 0.03 + Math.abs(Math.sin(t * 9 + c.seed)) * 0.012, v.z);
      g.rotation.y = heading;
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
        if (p) pos = new THREE.Vector3(p.x + p.size / 2, 0.9, p.y + p.size / 2);
      }
      marker.current.visible = !!pos;
      if (pos) marker.current.position.set(pos.x, pos.y + 0.45 + Math.sin(t * 2) * 0.03, pos.z);
    }
    if (goal.current) {
      const p = info?.placeId && info.mode !== "inside" ? places.get(info.placeId) : undefined;
      goal.current.visible = !!p;
      if (p) {
        goal.current.position.set(p.x + p.size / 2, 0.02, p.y + p.size / 2);
        goal.current.scale.set(p.size * 0.98, 0.02, p.size * 0.98);
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
          out.push({ kind, x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height });
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

