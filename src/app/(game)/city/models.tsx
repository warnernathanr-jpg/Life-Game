"use client";

// Low-poly building models made from shared primitive shapes (one tile = 1 unit).
// Each model is centred on its footprint at y = 0. Geometries and materials are shared
// module-wide so a big city doesn't allocate thousands of them.
import { memo } from "react";
import * as THREE from "three";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PYRAMID = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const CROWN = new THREE.IcosahedronGeometry(0.5, 0);
const PINE = new THREE.ConeGeometry(0.5, 1, 7);
const TENT = new THREE.ConeGeometry(0.5, 1, 8);
const OCTA = new THREE.OctahedronGeometry(0.5, 0);

const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, opts: { metal?: boolean; flat?: boolean } = {}) {
  const k = `${color}${opts.metal ? "m" : ""}`;
  let m = materials.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.metal ? 0.25 : 0.85,
      metalness: opts.metal ? 0.35 : 0,
      flatShading: true,
    });
    materials.set(k, m);
  }
  return m;
}

type V3 = [number, number, number];

/** A box with its base at y (position = centre of the bottom face). */
function B({ p, s, c, metal }: { p: V3; s: V3; c: string; metal?: boolean }) {
  return (
    <mesh geometry={BOX} material={mat(c, { metal })} position={[p[0], p[1] + s[1] / 2, p[2]]} scale={s} castShadow receiveShadow />
  );
}
function Roof({ p, s, c }: { p: V3; s: V3; c: string }) {
  return <mesh geometry={PYRAMID} material={mat(c)} position={[p[0], p[1] + s[1] / 2, p[2]]} scale={s} castShadow />;
}
function Cyl({ p, r, h, c }: { p: V3; r: number; h: number; c: string }) {
  return <mesh geometry={CYLINDER} material={mat(c)} position={[p[0], p[1] + h / 2, p[2]]} scale={[r * 2, h, r * 2]} castShadow />;
}
export function Tree({ p, s = 1, pine, crown = "#22c55e" }: { p: V3; s?: number; pine?: boolean; crown?: string }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0, 0]} r={0.04} h={0.18} c="#78350f" />
      {pine ? (
        <mesh geometry={PINE} material={mat("#166534")} position={[0, 0.4, 0]} scale={[0.32, 0.5, 0.32]} castShadow />
      ) : (
        <mesh geometry={CROWN} material={mat(crown)} position={[0, 0.32, 0]} scale={0.34} castShadow />
      )}
    </group>
  );
}


// ---------------------------------------------------------------------------
// Color variety: each building gets its own scheme, picked from these palettes by a
// seed made from the building's id, so a building keeps its colors across visits.
// ---------------------------------------------------------------------------
const PALETTE = {
  walls: ["#f5e6c8", "#fde7c8", "#dbeafe", "#dcfce7", "#fce7f3", "#e7e5e4", "#fef9c3", "#ede9fe", "#ffedd5", "#ccfbf1", "#f8fafc"],
  roofs: ["#c2410c", "#9a3412", "#7f1d1d", "#475569", "#1e3a8a", "#166534", "#57534e", "#0f766e", "#6b21a8", "#334155"],
  doors: ["#7c2d12", "#1e3a5f", "#14532d", "#7f1d1d", "#3f3f46", "#713f12"],
  facades: ["#e7d3b8", "#d6d3d1", "#fde68a", "#bfdbfe", "#fecaca", "#d9f99d", "#e9d5ff", "#cbd5e1", "#fed7aa"],
  // [awning, darker roof band]
  awnings: [["#0284c7", "#0369a1"], ["#dc2626", "#991b1b"], ["#16a34a", "#166534"], ["#ea580c", "#9a3412"], ["#7c3aed", "#5b21b6"], ["#0d9488", "#115e59"], ["#ca8a04", "#854d0e"], ["#db2777", "#9d174d"]],
  // [tower glass, top]
  glass: [["#38bdf8", "#0ea5e9"], ["#2dd4bf", "#0d9488"], ["#94a3b8", "#64748b"], ["#a78bfa", "#7c3aed"], ["#4ade80", "#16a34a"], ["#fbbf24", "#b45309"]],
  // [main siding, darker]
  siding: [["#a8a29e", "#78716c"], ["#9ca3af", "#6b7280"], ["#b6a58c", "#8a7a62"], ["#a3b1a0", "#6f7f6b"], ["#b4a2a2", "#8c7070"], ["#9fb3c8", "#6b84a0"]],
  accents: ["#f59e0b", "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#0891b2"],
  tents: ["#a855f7", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#ec4899"],
  crowns: ["#22c55e", "#16a34a", "#4ade80", "#65a30d", "#15803d"],
} as const;

/** A stable number from a building id (FNV-1a). */
export function colorSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick from a palette: each salt mixes the seed differently, so walls and roofs vary independently. */
function pick<T>(list: readonly T[], seed: number, salt: number): T {
  let h = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return list[(h >>> 0) % list.length];
}

/** Rough top height of each model, for markers floating above it. */
export const MODEL_HEIGHT: Record<string, number> = {
  cottage: 0.75, house: 0.95, apartments: 1.75, corner_shop: 0.5, cafe: 0.5, office: 3.2, workshop: 0.7,
  warehouse: 0.6, factory: 1.5, park: 0.5, clinic: 0.65, school: 0.9, library: 0.7, fire_station: 0.85, community: 0.8,
};

function Model({ typeId, seed }: { typeId: string; seed: number }) {
  const wall = pick(PALETTE.walls, seed, 1);
  const roof = pick(PALETTE.roofs, seed, 2);
  const door = pick(PALETTE.doors, seed, 3);
  const facade = pick(PALETTE.facades, seed, 4);
  const [awning, band] = pick(PALETTE.awnings, seed, 5);
  const [glass, glassTop] = pick(PALETTE.glass, seed, 6);
  const [siding, sidingDark] = pick(PALETTE.siding, seed, 7);
  const accent = pick(PALETTE.accents, seed, 8);
  const tent = pick(PALETTE.tents, seed, 9);
  const crown = pick(PALETTE.crowns, seed, 10);
  switch (typeId) {
    case "cottage":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.56, 0.36, 0.5]} c={wall} />
          <Roof p={[0, 0.36, 0]} s={[0.74, 0.34, 0.66]} c={roof} />
          <B p={[0, 0, 0.251]} s={[0.12, 0.2, 0.02]} c={door} />
          <B p={[0.16, 0.14, 0.251]} s={[0.11, 0.1, 0.02]} c="#93c5fd" />
        </>
      );
    case "house":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.7, 0.48, 0.56]} c={wall} />
          <Roof p={[0, 0.48, 0]} s={[0.9, 0.4, 0.74]} c={roof} />
          <B p={[0.2, 0.5, -0.1]} s={[0.1, 0.38, 0.1]} c="#78716c" />
          <B p={[-0.12, 0, 0.281]} s={[0.13, 0.24, 0.02]} c={door} />
          <B p={[0.14, 0.2, 0.281]} s={[0.14, 0.12, 0.02]} c="#93c5fd" />
          <Tree p={[0.36, 0, 0.36]} s={0.7} crown={crown} />
        </>
      );
    case "apartments":
      return (
        <>
          <B p={[0, 0, 0]} s={[1.5, 1.6, 1.3]} c={facade} />
          {[0.3, 0.7, 1.1, 1.45].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.52, 0.12, 1.32]} c="#64748b" />
          ))}
          <B p={[0, 1.6, 0]} s={[1.56, 0.08, 1.36]} c={sidingDark} />
          <B p={[0.4, 1.68, 0.2]} s={[0.3, 0.15, 0.3]} c="#78716c" />
          <B p={[0, 0, 0.66]} s={[0.3, 0.26, 0.04]} c={door} />
        </>
      );
    case "corner_shop":
      return (
        <>
          <B p={[0, 0, -0.04]} s={[0.72, 0.38, 0.6]} c={wall} />
          <B p={[0, 0.27, 0.32]} s={[0.76, 0.04, 0.16]} c={awning} />
          <B p={[0, 0.38, -0.04]} s={[0.74, 0.08, 0.62]} c={band} />
          <B p={[0, 0.02, 0.261]} s={[0.5, 0.2, 0.02]} c="#bae6fd" />
        </>
      );
    case "cafe":
      return (
        <>
          <B p={[0, 0, -0.1]} s={[0.68, 0.36, 0.5]} c={wall} />
          <B p={[0, 0.27, 0.2]} s={[0.72, 0.04, 0.16]} c={awning} />
          <B p={[0, 0.36, -0.1]} s={[0.7, 0.06, 0.52]} c={band} />
          <Cyl p={[-0.2, 0, 0.34]} r={0.07} h={0.12} c="#f8fafc" />
          <Cyl p={[0.2, 0, 0.34]} r={0.07} h={0.12} c="#f8fafc" />
        </>
      );
    case "office":
      return (
        <>
          <B p={[0, 0, 0]} s={[1.6, 0.3, 1.6]} c="#cbd5e1" />
          <B p={[0, 0.3, 0]} s={[1.1, 2.4, 1.1]} c={glass} metal />
          {[0.8, 1.4, 2.0, 2.6].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.12, 0.05, 1.12]} c="#e2e8f0" />
          ))}
          <B p={[0, 2.7, 0]} s={[0.7, 0.3, 0.7]} c={glassTop} metal />
          <Cyl p={[0, 3.0, 0]} r={0.03} h={0.3} c="#94a3b8" />
        </>
      );
    case "workshop":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.74, 0.34, 0.6]} c={siding} />
          <mesh geometry={BOX} material={mat("#57534e")} position={[-0.18, 0.42, 0]} rotation={[0, 0, 0.45]} scale={[0.42, 0.04, 0.62]} castShadow />
          <mesh geometry={BOX} material={mat("#57534e")} position={[0.18, 0.42, 0]} rotation={[0, 0, 0.45]} scale={[0.42, 0.04, 0.62]} castShadow />
          <Cyl p={[0.26, 0.34, -0.18]} r={0.05} h={0.34} c="#78716c" />
          <B p={[0, 0, 0.301]} s={[0.3, 0.22, 0.02]} c={accent} />
        </>
      );
    case "warehouse":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.86, 0.46, 0.72]} c={siding} />
          <B p={[0, 0.46, 0]} s={[0.88, 0.06, 0.74]} c={sidingDark} />
          <B p={[-0.18, 0, 0.361]} s={[0.26, 0.3, 0.02]} c="#e7e5e4" />
          <B p={[0.18, 0, 0.361]} s={[0.26, 0.3, 0.02]} c="#e7e5e4" />
          <B p={[0.3, 0, -0.2]} s={[0.12, 0.1, 0.12]} c={accent} />
        </>
      );
    case "factory":
      return (
        <>
          <B p={[-0.15, 0, 0.1]} s={[1.2, 0.7, 1.1]} c={siding} />
          <B p={[0.55, 0, -0.3]} s={[0.6, 0.45, 0.6]} c={sidingDark} />
          {[-0.45, 0.05].map((x) => (
            <group key={x}>
              <Cyl p={[x, 0.7, -0.25]} r={0.12} h={0.8} c="#57534e" />
              <Cyl p={[x, 1.25, -0.25]} r={0.125} h={0.1} c={accent} />
            </group>
          ))}
          <B p={[-0.15, 0, 0.651]} s={[0.4, 0.35, 0.02]} c={accent} />
        </>
      );
    case "park":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.92, 0.04, 0.92]} c="#4ade80" />
          <B p={[0, 0.04, 0]} s={[0.92, 0.01, 0.14]} c="#e7e5e4" />
          <Tree p={[-0.26, 0.04, -0.24]} s={1.1} crown={crown} />
          <Tree p={[0.26, 0.04, -0.26]} s={0.9} pine />
          <Tree p={[0.24, 0.04, 0.26]} s={1} crown={pick(PALETTE.crowns, seed, 11)} />
          <B p={[-0.24, 0.04, 0.24]} s={[0.24, 0.06, 0.08]} c="#92400e" />
        </>
      );
    case "clinic":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.76, 0.48, 0.64]} c="#f8fafc" />
          <B p={[0, 0.48, 0]} s={[0.78, 0.04, 0.66]} c="#cbd5e1" />
          <B p={[0, 0.52, 0]} s={[0.3, 0.04, 0.09]} c="#dc2626" />
          <B p={[0, 0.52, 0]} s={[0.09, 0.04, 0.3]} c="#dc2626" />
          <B p={[0, 0, 0.321]} s={[0.22, 0.24, 0.02]} c="#93c5fd" />
        </>
      );
    case "school":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.8, 0.42, 0.56]} c={facade} />
          <Roof p={[0, 0.42, 0]} s={[0.96, 0.26, 0.72]} c={roof} />
          {[-0.24, 0, 0.24].map((x) => (
            <B key={x} p={[x, 0.18, 0.281]} s={[0.13, 0.12, 0.02]} c="#bfdbfe" />
          ))}
          <Cyl p={[0.38, 0, 0.38]} r={0.015} h={0.75} c="#e5e7eb" />
          <B p={[0.44, 0.6, 0.38]} s={[0.12, 0.08, 0.01]} c={accent} />
        </>
      );
    case "library":
      return (
        <>
          <B p={[0, 0, -0.06]} s={[0.76, 0.42, 0.56]} c={wall} />
          <B p={[0, 0, 0.26]} s={[0.76, 0.04, 0.16]} c="#d6d3d1" />
          {[-0.27, -0.09, 0.09, 0.27].map((x) => (
            <Cyl key={x} p={[x, 0.04, 0.28]} r={0.03} h={0.38} c="#fafaf9" />
          ))}
          <B p={[0, 0.42, 0.03]} s={[0.82, 0.05, 0.74]} c="#a8a29e" />
          <Roof p={[0, 0.47, 0.03]} s={[0.84, 0.18, 0.76]} c={roof} />
        </>
      );
    case "fire_station":
      return (
        <>
          <B p={[-0.08, 0, 0]} s={[0.62, 0.44, 0.66]} c="#dc2626" />
          <B p={[0.3, 0, -0.12]} s={[0.2, 0.8, 0.2]} c="#b91c1c" />
          <B p={[0.3, 0.8, -0.12]} s={[0.24, 0.05, 0.24]} c="#7f1d1d" />
          <B p={[-0.22, 0, 0.331]} s={[0.24, 0.3, 0.02]} c="#fef2f2" />
          <B p={[0.06, 0, 0.331]} s={[0.24, 0.3, 0.02]} c="#fef2f2" />
          <B p={[-0.08, 0.44, 0]} s={[0.64, 0.04, 0.68]} c="#7f1d1d" />
        </>
      );
    case "community":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.84, 0.03, 0.84]} c="#e9d5ff" />
          <mesh geometry={TENT} material={mat(tent)} position={[0, 0.38, 0]} scale={[0.78, 0.7, 0.78]} castShadow />
          <Cyl p={[0, 0.7, 0]} r={0.015} h={0.14} c="#f8fafc" />
          <B p={[0, 0.03, 0.37]} s={[0.16, 0.2, 0.02]} c="#4c1d95" />
        </>
      );
    default:
      return <B p={[0, 0, 0]} s={[0.7, 0.5, 0.7]} c="#cbd5e1" />;
  }
}

export const BuildingModel = memo(Model);

/** Floating red marker above a building that isn't next to a road. */
export function NoRoadMarker({ y }: { y: number }) {
  return (
    <group position={[0, y + 0.35, 0]}>
      <mesh geometry={OCTA} material={mat("#ef4444")} scale={[0.16, 0.24, 0.16]} />
    </group>
  );
}

export { BOX };
