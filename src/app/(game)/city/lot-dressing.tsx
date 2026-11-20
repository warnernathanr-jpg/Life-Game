"use client";

// Ground details around buildings, drawn in the lot's own frame (the front, +z, faces the road):
//   * houses: a driveway from the road (sometimes with a parked car), bushes and a flower bed;
//   * townhouses and apartments: a front path and low planting;
//   * industry: a concrete pad over the whole lot;
//   * shops and services: a paved forecourt with benches, planters, a lamp post, a bike rack or a sign.
// Everything is low, seeded by the building's id (same layout every visit) and kept to the lot's edges so it never
// pokes through the building.
import * as THREE from "three";
import { B, Cyl, mat, type V3 } from "./models";

const SPHERE = new THREE.SphereGeometry(1, 8, 6);

const HOUSES = new Set(["small_cottage", "cottage", "suburban", "luxury", "duplex"]);
const ROWS = new Set(["house", "apartments", "highrise"]);
const INDUSTRY = new Set(["factory", "small_factory", "warehouse", "workshop", "distribution"]);
const SMALL_SHOPS = new Set(["corner_shop", "cafe", "restaurant", "clothing", "bank"]);
const BIG_SHOPS = new Set(["office", "grocery", "cinema", "hotel", "mall"]);

const CONCRETE = "#a8a29e";
const DRIVEWAY = "#8f8a84";
const PAVING = "#d6d3cd";
const BUSH = ["#15803d", "#166534", "#16a34a", "#3f6212"];
const FLOWERS = ["#f472b6", "#facc15", "#f87171", "#c084fc", "#fb923c", "#f8fafc"];
const CARS = ["#dc2626", "#2563eb", "#f8fafc", "#111827", "#9ca3af", "#16a34a", "#eab308"];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A flat slab on the ground (just above the grass). */
function Slab({ x, z, w, d, c, y = 0.004 }: { x: number; z: number; w: number; d: number; c: string; y?: number }) {
  return <mesh geometry={BOX_GEO} material={mat(c)} position={[x, y, z]} scale={[w, 0.008, d]} receiveShadow />;
}
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

function Bush({ p, r, c }: { p: V3; r: number; c: string }) {
  return <mesh geometry={SPHERE} material={mat(c)} position={[p[0], r * 0.8, p[2]]} scale={[r, r * 0.85, r]} castShadow />;
}

function Car({ p, c, along }: { p: V3; c: string; along: "z" | "x" }) {
  const rot = along === "z" ? 0 : Math.PI / 2;
  return (
    <group position={p} rotation-y={rot}>
      <B p={[0, 0.02, 0]} s={[0.13, 0.06, 0.24]} c={c} />
      <B p={[0, 0.08, -0.01]} s={[0.11, 0.05, 0.13]} c="#bfdbfe" />
    </group>
  );
}

function Bench({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <B p={[0, 0.03, 0]} s={[0.16, 0.015, 0.05]} c="#92400e" />
      <B p={[0, 0.045, -0.025]} s={[0.16, 0.04, 0.01]} c="#92400e" />
      <B p={[-0.065, 0, 0]} s={[0.015, 0.03, 0.04]} c="#374151" />
      <B p={[0.065, 0, 0]} s={[0.015, 0.03, 0.04]} c="#374151" />
    </group>
  );
}

function Planter({ p, c }: { p: V3; c: string }) {
  return (
    <group position={p}>
      <B p={[0, 0, 0]} s={[0.08, 0.05, 0.08]} c="#78716c" />
      <Bush p={[0, 0.03, 0]} r={0.045} c={c} />
    </group>
  );
}

function Lamp({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0, 0]} r={0.008} h={0.22} c="#374151" />
      <B p={[0, 0.21, 0]} s={[0.035, 0.02, 0.035]} c="#fef3c7" />
    </group>
  );
}

function Sign({ p, c }: { p: V3; c: string }) {
  return (
    <group position={p}>
      <B p={[0, 0, 0]} s={[0.06, 0.07, 0.015]} c={c} />
      <B p={[0, 0.07, 0]} s={[0.065, 0.006, 0.02]} c="#374151" />
    </group>
  );
}

function BikeRack({ p }: { p: V3 }) {
  return (
    <group position={p}>
      {[-0.04, 0, 0.04].map((x) => (
        <B key={x} p={[x, 0, 0]} s={[0.008, 0.045, 0.05]} c="#64748b" metal />
      ))}
    </group>
  );
}

function TrashCan({ p }: { p: V3 }) {
  return <Cyl p={p} r={0.022} h={0.05} c="#166534" />;
}

/**
 * `lw` × `ld`: the lot's size in its own frame (width across the front, depth from the road back).
 * `join`: townhouse neighbors on the left / right (no planting where walls meet).
 */
export function LotDressing({ typeId, seed, lw, ld }: { typeId: string; seed: number; lw: number; ld: number }) {
  const r = rng(seed * 7 + 3);
  const hx = lw / 2;
  const hz = ld / 2;
  const pickOf = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];

  if (INDUSTRY.has(typeId)) {
    return (
      <>
        <Slab x={0} z={0} w={lw - 0.04} d={ld - 0.04} c={CONCRETE} />
        {/* Painted bays and a couple of bollards at the entrance. */}
        <Slab x={hx - 0.2} z={hz - 0.12} w={0.3} d={0.012} c="#facc15" y={0.0085} />
        <Cyl p={[-hx + 0.06, 0.008, hz - 0.05]} r={0.012} h={0.05} c="#facc15" />
        <Cyl p={[-hx + 0.16, 0.008, hz - 0.05]} r={0.012} h={0.05} c="#facc15" />
      </>
    );
  }

  if (HOUSES.has(typeId)) {
    const side = r() < 0.5 ? -1 : 1; // which side the driveway runs
    const dx = side * (hx - 0.14);
    const len = Math.min(0.42, hz - 0.02);
    const bushC = pickOf(BUSH);
    const flowers = Array.from({ length: 5 }, (_, i) => ({ x: -side * (hx - 0.1) + (i % 3) * 0.03 * -side, z: hz - 0.07 - Math.floor(i / 3) * 0.04, c: pickOf(FLOWERS) }));
    return (
      <>
        <Slab x={dx} z={hz - len / 2} w={0.2} d={len} c={DRIVEWAY} />
        {r() < 0.6 && <Car p={[dx, 0.008, hz - 0.17]} c={pickOf(CARS)} along="z" />}
        {/* Bushes at the back corners and by the front, a little flower bed on the other side of the driveway. */}
        <Bush p={[-hx + 0.09, 0, -hz + 0.09]} r={0.08} c={bushC} />
        <Bush p={[hx - 0.09, 0, -hz + 0.09]} r={0.07} c={pickOf(BUSH)} />
        <Bush p={[-side * (hx - 0.08), 0, hz - 0.22]} r={0.06} c={bushC} />
        <Slab x={-side * (hx - 0.13)} z={hz - 0.09} w={0.14} d={0.09} c="#7c5a3a" y={0.005} />
        {flowers.map((f, i) => (
          <B key={i} p={[f.x, 0.008, f.z]} s={[0.03, 0.035, 0.03]} c={f.c} />
        ))}
      </>
    );
  }

  if (ROWS.has(typeId)) {
    return (
      <>
        <Slab x={0} z={hz - 0.08} w={Math.min(0.5, lw * 0.4)} d={0.14} c={PAVING} />
        <Bush p={[-hx + 0.12, 0, hz - 0.07]} r={0.04} c={pickOf(BUSH)} />
        <Bush p={[hx - 0.12, 0, hz - 0.07]} r={0.04} c={pickOf(BUSH)} />
      </>
    );
  }

  if (SMALL_SHOPS.has(typeId)) {
    const props = [
      <Bench key="b" p={[-hx + 0.14, 0.008, hz - 0.06]} />,
      <Planter key="p" p={[hx - 0.07, 0.008, hz - 0.07]} c={pickOf(BUSH)} />,
      r() < 0.5 ? <Lamp key="l" p={[-hx + 0.04, 0.008, hz - 0.04]} /> : <BikeRack key="r" p={[hx - 0.2, 0.008, hz - 0.06]} />,
      r() < 0.6 ? <Sign key="s" p={[hx - 0.2, 0.008, hz - 0.05]} c={pickOf(["#f8fafc", "#fde68a", "#fecaca"])} /> : <TrashCan key="t" p={[hx - 0.2, 0.008, hz - 0.05]} />,
    ];
    return (
      <>
        <Slab x={0} z={hz - 0.07} w={lw - 0.02} d={0.14} c={PAVING} />
        {props}
      </>
    );
  }

  if (BIG_SHOPS.has(typeId)) {
    // Big shops already have their own parking; add lamp posts and planters at the front corners.
    return (
      <>
        <Lamp p={[-hx + 0.05, 0.02, hz - 0.05]} />
        <Lamp p={[hx - 0.05, 0.02, hz - 0.05]} />
        <Planter p={[-hx + 0.15, 0.02, hz - 0.06]} c={pickOf(BUSH)} />
        <Planter p={[hx - 0.15, 0.02, hz - 0.06]} c={pickOf(BUSH)} />
      </>
    );
  }

  return null;
}
