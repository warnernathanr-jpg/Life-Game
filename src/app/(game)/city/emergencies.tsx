"use client";

// Random fires and break-ins. Every minute or so something happens somewhere in town (riskier buildings more often,
// buildings near a fire station or police station less often). The nearest station sends a fire truck or a police car
// along the roads with its lights flashing; once it arrives the fire goes out or the burglar is caught, and the vehicle
// drives back. With no station (or no road to it) the event fades on its own. It's only for show: nothing is damaged
// and nothing costs coins.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Tile } from "@/lib/roads";
import { roadPath, type Place } from "@/lib/sim";
import { BOX, MODEL_HEIGHT, mat } from "./models";
import { lotTileBy, pointAt } from "./traffic";

type Kind = "fire" | "crime";
type Phase = "waiting" | "en_route" | "on_scene" | "returning";
type Incident = { kind: Kind; place: Place; phase: Phase; path: Tile[] | null; u: number; timer: number };

const STATION: Record<Kind, string> = { fire: "fire_station", crime: "police" };
const SPEED = 3; // tiles a second (faster than everyday traffic)
const ON_SCENE = 6; // seconds at the scene
const NO_HELP = 18; // seconds an event lasts when nobody can come
const LANE = 0.2;
const START_U = 0.7; // starts just inside the station's lot
const PARK_AT = 0.2; // stops this far short of the place's lot: turned in, facing the building, still clear of it

/** Seconds between events (random within the range); the first comes sooner. */
const FIRST_EVENT = [20, 35] as const;
const NEXT_EVENT = [45, 95] as const;
const between = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);

/** How likely a building is to have an event (0 = never). */
function risk(p: Place, kind: Kind, stations: Place[]): number {
  if (!p.entrance || p.park || p.typeId === STATION[kind]) return 0;
  if (p.homes === 0 && p.jobs === 0) return 0;
  const industry = p.jobs > 0 && p.homes === 0 && !p.shop && !p.school;
  const base =
    kind === "fire"
      ? industry ? 0.9 : p.shop ? 0.6 : p.homes > 20 ? 0.7 : 0.45
      : p.shop ? 0.75 : p.homes > 20 ? 0.7 : industry ? 0.55 : 0.45;
  // A station within about 9 tiles cuts the risk by up to 70%.
  let cover = 0;
  for (const s of stations) {
    const gap = Math.max(0, s.x - (p.x + p.w), p.x - (s.x + s.w)) + Math.max(0, s.y - (p.y + p.h), p.y - (s.y + s.h));
    cover = Math.max(cover, 1 - gap / 9);
  }
  return base * (1 - 0.7 * Math.max(0, cover));
}

function choose(places: Place[], kind: Kind): Place | null {
  const stations = places.filter((p) => p.typeId === STATION[kind]);
  const weights = places.map((p) => risk(p, kind, stations));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < places.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return places[i];
  }
  return null;
}

/**
 * The shortest road route from any station of this kind to the place. Like everyday cars, it starts inside the station's
 * lot (the vehicle pulls out onto the road) and ends at the edge of the place's lot (it turns in and stops facing the building).
 */
function routeFor(places: Place[], roads: Set<string>, kind: Kind, to: Place): Tile[] | null {
  let best: Tile[] | null = null;
  for (const s of places) {
    if (s.typeId !== STATION[kind] || !s.entrance || !to.entrance) continue;
    const road = roadPath(roads, s.entrance, to.entrance);
    const path = road ? [lotTileBy(s, s.entrance), ...road, lotTileBy(to, to.entrance)] : null;
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}

const NEWS: Record<Kind, { start: (n: string) => string; noHelp: (n: string) => string; solved: (n: string) => string; faded: (n: string) => string }> = {
  fire: {
    start: (n) => `Fire at ${n}! A fire truck is on the way.`,
    noHelp: (n) => `Fire at ${n}! Build a fire station on the roads so a truck can come.`,
    solved: (n) => `Firefighters put out the fire at ${n}.`,
    faded: (n) => `The fire at ${n} burned out.`,
  },
  crime: {
    start: (n) => `Break-in at ${n}! The police are on the way.`,
    noHelp: (n) => `Break-in at ${n}! Build a police station on the roads so officers can come.`,
    solved: (n) => `The police caught the burglar at ${n}.`,
    faded: (n) => `The burglar at ${n} got away.`,
  },
};

const FLAME_GEO = new THREE.ConeGeometry(0.5, 1, 6);
const SMOKE_GEO = new THREE.IcosahedronGeometry(0.5, 0);
const RING_GEO = new THREE.RingGeometry(0.46, 0.5, 32).rotateX(-Math.PI / 2);
const FLAME_OUTER = new THREE.MeshBasicMaterial({ color: "#f97316" });
const FLAME_INNER = new THREE.MeshBasicMaterial({ color: "#fde047" });
const SMOKE = new THREE.MeshStandardMaterial({ color: "#6b7280", transparent: true, opacity: 0.55, depthWrite: false });
const ALERT = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
const RED_LIGHT = new THREE.MeshBasicMaterial({ color: "#ff2d2d" });
const BLUE_LIGHT = new THREE.MeshBasicMaterial({ color: "#2f6bff" });
const WHITE_LIGHT = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const OFF_LIGHT = mat("#475569");
const TRUCK_RED = mat("#dc2626");
const CHROME = mat("#d1d5db", { metal: true });
const POLICE_DARK = mat("#1e293b");
const POLICE_WHITE = mat("#f8fafc");
const GLASS = mat("#0f172a");
const MASK = mat("#111827");

const FLAMES = [
  [0, 0, 1],
  [0.16, 0.1, 0.7],
  [-0.14, -0.12, 0.8],
] as const;
const PUFFS = 5;

export function Emergencies({
  places,
  roads,
  paused,
  onNews,
}: {
  places: Place[];
  roads: Set<string>;
  paused: boolean;
  onNews?: (text: string | null) => void;
}) {
  const { invalidate } = useThree();
  const incidents = useRef<Partial<Record<Kind, Incident>>>({});
  const countdown = useRef(between(FIRST_EVENT));
  const clock = useRef(0);
  const forced = useRef<Kind | null>(null);
  const latest = useRef({ places, roads, paused, onNews });
  useLayoutEffect(() => {
    latest.current = { places, roads, paused, onNews };
  });

  const fire = useRef<THREE.Group>(null);
  const flames = useRef<(THREE.Group | null)[]>([]);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const crime = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const truck = useRef<THREE.Group>(null);
  const police = useRef<THREE.Group>(null);
  const lights = useRef<{ a: THREE.Mesh | null; b: THREE.Mesh | null }[]>([]);

  // Events are scheduled in real seconds (paused cities and hidden tabs don't count down).
  useEffect(() => {
    const id = window.setInterval(() => {
      const { places, roads, paused, onNews } = latest.current;
      if (paused || document.hidden) return;
      countdown.current -= 1;
      if (countdown.current > 0) return;
      countdown.current = between(NEXT_EVENT);
      const free = (["fire", "crime"] as Kind[]).filter((k) => !incidents.current[k]);
      if (!free.length) return;
      const kind = forced.current && free.includes(forced.current) ? forced.current : free[Math.floor(Math.random() * free.length)];
      forced.current = null;
      const place = choose(places, kind);
      if (!place) return;
      const path = routeFor(places, roads, kind, place);
      incidents.current[kind] = { kind, place, path, phase: path ? "en_route" : "waiting", u: START_U, timer: NO_HELP };
      onNews?.((path ? NEWS[kind].start : NEWS[kind].noHelp)(place.name));
      invalidate();
    }, 1000);
    return () => window.clearInterval(id);
  }, [invalidate]);

  // Development only: start an event now (lets browser tests see one without waiting).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __lifeCityEvent?: (k: Kind) => void };
    w.__lifeCityEvent = (k) => {
      countdown.current = 0.5;
      forced.current = k;
    };
    return () => {
      delete w.__lifeCityEvent;
    };
  }, []);

  // A building that's been demolished (or a city that changed) ends its event quietly.
  useEffect(() => {
    const ids = new Set(places.map((p) => p.id));
    for (const k of ["fire", "crime"] as Kind[]) {
      const inc = incidents.current[k];
      if (inc && !ids.has(inc.place.id)) delete incidents.current[k];
    }
  }, [places]);

  useFrame((_, delta) => {
    const { paused, onNews } = latest.current;
    const dt = paused ? 0 : Math.min(delta, 0.1);
    clock.current += dt;
    const t = clock.current;
    const flash = Math.floor(t * 6) % 2 === 0;

    for (const kind of ["fire", "crime"] as Kind[]) {
      const inc = incidents.current[kind];
      const vehicle = kind === "fire" ? truck.current : police.current;
      const scene = kind === "fire" ? fire.current : crime.current;
      if (!inc) {
        if (vehicle) vehicle.visible = false;
        if (scene) scene.visible = false;
        continue;
      }
      const name = inc.place.name;
      // Arrive just inside the place's lot (parked facing it); drive back until just inside the station's lot.
      const n = inc.path ? inc.path.length - 1 : 0;
      const arrive = n - PARK_AT;
      const home = n + 0.3;
      if (inc.phase === "waiting") {
        inc.timer -= dt;
        if (inc.timer <= 0) {
          delete incidents.current[kind];
          onNews?.(NEWS[kind].faded(name));
          continue;
        }
      } else if (inc.phase === "en_route") {
        inc.u += dt * SPEED;
        if (inc.u >= arrive) {
          inc.u = arrive;
          inc.phase = "on_scene";
          inc.timer = ON_SCENE;
        }
      } else if (inc.phase === "on_scene") {
        inc.timer -= dt;
        if (inc.timer <= 0) {
          inc.phase = "returning";
          inc.u = 1 + PARK_AT; // the same spot, on the reversed path
          onNews?.(NEWS[kind].solved(name));
        }
      } else {
        inc.u += dt * SPEED;
        if (inc.u >= home) {
          delete incidents.current[kind];
          continue;
        }
      }

      // The scene: flames and smoke on the roof, or a red alert ring and the burglar by the door.
      const p = inc.place;
      const cx = p.x + p.w / 2;
      const cz = p.y + p.h / 2;
      const active = inc.phase !== "returning";
      if (scene) {
        scene.visible = active;
        scene.position.set(cx, 0, cz);
      }
      if (kind === "fire" && active) {
        // The fire shrinks while the firefighters work on it.
        const strength = inc.phase === "on_scene" ? Math.max(0.15, inc.timer / ON_SCENE) : 1;
        const top = MODEL_HEIGHT[p.typeId] ?? 0.8;
        const span = Math.min(p.w, p.h);
        flames.current.forEach((f, i) => {
          if (!f) return;
          const [ox, oz, s] = FLAMES[i];
          const flicker = 1 + Math.sin(t * 13 + i * 2.1) * 0.15;
          f.position.set(ox * span, top * 0.85, oz * span);
          f.scale.set(0.22 * s * span * strength, 0.4 * s * flicker * strength * Math.max(1, span * 0.7), 0.22 * s * span * strength);
        });
        puffs.current.forEach((m, i) => {
          if (!m) return;
          const phase = (t * 0.35 + i / PUFFS) % 1;
          m.visible = strength > 0.3;
          m.position.set(Math.sin(i * 1.7 + t * 0.3) * 0.12 + phase * 0.25, top + 0.25 + phase * 1.3, Math.cos(i * 2.3) * 0.1);
          m.scale.setScalar((0.08 + phase * 0.22) * Math.max(1, span * 0.6));
        });
      }
      if (kind === "crime" && active && ring.current) {
        const pulse = 1 + ((t * 1.2) % 1) * 0.35;
        ring.current.scale.set(Math.max(p.w, p.h) * pulse, 1, Math.max(p.w, p.h) * pulse);
        ALERT.opacity = 0.75 * (1 - ((t * 1.2) % 1));
        const suspect = crime.current?.children[1];
        if (suspect) {
          suspect.visible = inc.phase !== "on_scene";
          const door = inc.place.entrance;
          // Stands between the building and the road, shifting nervously.
          if (door) suspect.position.set((door.x + 0.5 - cx) * 0.6 + Math.sin(t * 5) * 0.03, 0, (door.y + 0.5 - cz) * 0.6);
        }
      }

      // The vehicle, with its lights flashing.
      if (vehicle) {
        const moving = inc.path && inc.phase !== "waiting";
        vehicle.visible = !!moving;
        if (moving && inc.path) {
          const path = inc.phase === "returning" ? [...inc.path].reverse() : inc.path;
          const pos = pointAt(path, inc.u, LANE);
          vehicle.position.set(pos.x, 0, pos.z);
          vehicle.rotation.y = pos.heading;
        }
      }
    }
    for (const l of lights.current) {
      if (!l.a || !l.b) continue;
      const lit = incidents.current.fire || incidents.current.crime;
      l.a.visible = !!lit && flash;
      l.b.visible = !!lit && !flash;
    }

    if (!paused && (incidents.current.fire || incidents.current.crime)) invalidate();
  });

  const lightBar = (i: number, a: THREE.Material, b: THREE.Material, y: number, z: number) => (
    <>
      <mesh geometry={BOX} material={OFF_LIGHT} position={[0, y, z]} scale={[0.11, 0.02, 0.03]} />
      <mesh ref={(el) => { (lights.current[i] ??= { a: null, b: null }).a = el; }} geometry={BOX} material={a} position={[-0.03, y + 0.004, z]} scale={[0.05, 0.026, 0.034]} />
      <mesh ref={(el) => { (lights.current[i] ??= { a: null, b: null }).b = el; }} geometry={BOX} material={b} position={[0.03, y + 0.004, z]} scale={[0.05, 0.026, 0.034]} />
    </>
  );

  return (
    <group raycast={() => null}>
      {/* Fire on the roof */}
      <group ref={fire} visible={false}>
        {FLAMES.map((_, i) => (
          <group key={i} ref={(el) => { flames.current[i] = el; }}>
            <mesh geometry={FLAME_GEO} material={FLAME_OUTER} position={[0, 0.5, 0]} />
            <mesh geometry={FLAME_GEO} material={FLAME_INNER} position={[0, 0.38, 0]} scale={[0.55, 0.7, 0.55]} />
          </group>
        ))}
        {Array.from({ length: PUFFS }, (_, i) => (
          <mesh key={i} ref={(el) => { puffs.current[i] = el; }} geometry={SMOKE_GEO} material={SMOKE} />
        ))}
      </group>

      {/* Break-in: an alert ring around the building and a masked figure by the door */}
      <group ref={crime} visible={false}>
        <mesh ref={ring} geometry={RING_GEO} material={ALERT} position={[0, 0.03, 0]} />
        <group>
          <mesh geometry={BOX} material={MASK} position={[0, 0.03, 0]} scale={[0.05, 0.06, 0.04]} />
          <mesh geometry={BOX} material={MASK} position={[0, 0.085, 0]} scale={[0.065, 0.06, 0.045]} />
          <mesh geometry={BOX} material={MASK} position={[0, 0.135, 0]} scale={[0.04, 0.04, 0.04]} />
          <mesh geometry={BOX} material={POLICE_WHITE} position={[0.05, 0.08, 0]} scale={[0.05, 0.05, 0.05]} />
        </group>
      </group>

      {/* Fire truck (as tall as a bus): long red body, windshield, white roof over the cab, a ladder on top, a white stripe and
          a red/white light bar */}
      <group ref={truck} visible={false}>
        <mesh geometry={BOX} material={TRUCK_RED} position={[0, 0.115, 0]} scale={[0.17, 0.21, 0.42]} castShadow />
        <mesh geometry={BOX} material={GLASS} position={[0, 0.17, 0.17]} scale={[0.15, 0.07, 0.09]} />
        <mesh geometry={BOX} material={GLASS} position={[0, 0.17, 0.211]} scale={[0.14, 0.07, 0.005]} />
        <mesh geometry={BOX} material={POLICE_WHITE} position={[0, 0.225, 0.15]} scale={[0.172, 0.012, 0.12]} />
        <mesh geometry={BOX} material={CHROME} position={[0, 0.235, -0.06]} scale={[0.07, 0.02, 0.3]} />
        <mesh geometry={BOX} material={POLICE_WHITE} position={[0, 0.08, 0]} scale={[0.174, 0.02, 0.42]} />
        {lightBar(0, RED_LIGHT, WHITE_LIGHT, 0.235, 0.15)}
      </group>

      {/* Police car: black and white with a red/blue light bar */}
      <group ref={police} visible={false}>
        <mesh geometry={BOX} material={POLICE_WHITE} position={[0, 0.05, 0]} scale={[0.16, 0.07, 0.15]} castShadow />
        <mesh geometry={BOX} material={POLICE_DARK} position={[0, 0.05, 0.1]} scale={[0.16, 0.07, 0.08]} castShadow />
        <mesh geometry={BOX} material={POLICE_DARK} position={[0, 0.05, -0.1]} scale={[0.16, 0.07, 0.08]} castShadow />
        <mesh geometry={BOX} material={GLASS} position={[0, 0.11, -0.02]} scale={[0.13, 0.06, 0.14]} />
        {lightBar(1, RED_LIGHT, BLUE_LIGHT, 0.15, -0.02)}
      </group>
    </group>
  );
}
