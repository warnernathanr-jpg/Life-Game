"use client";

// Taxis. Each taxi depot sends out a taxi (up to 4 in all): it pulls out of the depot, drives a fare to a random building,
// turns in there (dropping someone off, hidden for a moment), then takes the next fare; now and then it heads back to the
// depot for a break. Taxis keep their distance from cars and buses like the buses do (shared positions in vehicles.ts).
// Only for show: the traffic relief comes from transportFactor in layers.ts.
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Tile } from "@/lib/roads";
import { roadPath, type Place } from "@/lib/sim";
import { clearAhead } from "./buses";
import { BOX, mat } from "./models";
import { lotTileBy, pointAt } from "./traffic";
import { busPositions } from "./vehicles";

const SPEED = 2.4; // tiles a second
const MAX_TAXIS = 4;
const LANE = 0.2;
const START_U = 0.7;
const ID0 = 100; // ids in busPositions (buses use 0–3)

type Taxi = { depot: Place; at: Place; path: Tile[] | null; u: number; wait: number; held: number; fares: number };

/** A route from one place to another that starts and ends inside their lots (null: no road between them). */
function trip(roads: Set<string>, from: Place, to: Place): Tile[] | null {
  if (!from.entrance || !to.entrance) return null;
  const road = roadPath(roads, from.entrance, to.entrance);
  return road ? [lotTileBy(from, from.entrance), ...road, lotTileBy(to, to.entrance)] : null;
}

const BODY = mat("#facc15");
const GLASS = mat("#1e293b");
const SIGN = mat("#f8fafc");
const CHECK = mat("#111827");

export function Taxis({ places, roads, paused }: { places: Place[]; roads: Set<string>; paused: boolean }) {
  const { invalidate } = useThree();
  const depots = useMemo(() => places.filter((p) => p.typeId === "gas_station" && p.entrance).slice(0, MAX_TAXIS), [places]);
  const fares = useMemo(() => places.filter((p) => p.entrance && p.typeId !== "gas_station"), [places]);
  const taxis = useRef<Taxi[]>([]);
  const refs = useRef<(THREE.Group | null)[]>([]);

  // New depots or a changed town: every taxi starts back at its depot, leaving one after another.
  useLayoutEffect(() => {
    for (let i = 0; i < MAX_TAXIS; i++) busPositions.delete(ID0 + i);
    taxis.current = depots.map((d, i) => ({ depot: d, at: d, path: null, u: START_U, wait: 2 + i * 3, held: 0, fares: 0 }));
    invalidate();
    return () => {
      for (let i = 0; i < MAX_TAXIS; i++) busPositions.delete(ID0 + i);
    };
  }, [depots, roads, invalidate]);

  useFrame((_, delta) => {
    if (!taxis.current.length) return;
    const dt = paused ? 0 : Math.min(delta, 0.1);
    taxis.current.forEach((t, i) => {
      const g = refs.current[i];
      if (!g) return;
      if (!t.path) {
        // Inside a building (dropping off) or at the depot: hidden until the next fare.
        g.visible = false;
        busPositions.delete(ID0 + i);
        t.wait -= dt;
        if (t.wait > 0) return;
        // After a few fares (or when there's nowhere to go), head back to the depot for a break.
        const goHome = t.at !== t.depot && (t.fares >= 3 || Math.random() < 0.2);
        const options = fares.filter((p) => p !== t.at);
        const to = goHome || !options.length ? t.depot : options[Math.floor(Math.random() * options.length)];
        const path = to === t.at ? null : trip(roads, t.at, to);
        if (!path) {
          t.wait = 3;
          return;
        }
        t.path = path;
        t.u = START_U;
        t.fares = to === t.depot ? 0 : t.fares + 1;
        t.at = to;
      }
      if (dt > 0 && clearAhead(t.path, t.u, ID0 + i, roads, t.held)) {
        t.u += dt * SPEED;
        t.held = 0;
      } else t.held += dt;
      if (t.u >= t.path.length - 0.7) {
        t.path = null;
        t.wait = t.at === t.depot ? 6 + Math.random() * 8 : 1.5 + Math.random() * 2;
        return;
      }
      const p = pointAt(t.path, t.u, LANE);
      g.visible = true;
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.heading;
      busPositions.set(ID0 + i, { x: p.x, z: p.z, hx: Math.sin(p.heading), hz: Math.cos(p.heading) });
    });
    if (!paused) invalidate();
  });

  return (
    <group raycast={() => null}>
      {depots.map((d, i) => (
        <group key={d.id} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <mesh geometry={BOX} material={BODY} position={[0, 0.05, 0]} scale={[0.16, 0.07, 0.28]} castShadow />
          <mesh geometry={BOX} material={GLASS} position={[0, 0.11, -0.02]} scale={[0.13, 0.06, 0.14]} />
          <mesh geometry={BOX} material={SIGN} position={[0, 0.15, -0.02]} scale={[0.07, 0.025, 0.035]} />
          <mesh geometry={BOX} material={CHECK} position={[0, 0.06, 0]} scale={[0.162, 0.015, 0.2]} />
        </group>
      ))}
    </group>
  );
}
