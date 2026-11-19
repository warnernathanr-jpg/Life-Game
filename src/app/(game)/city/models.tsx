"use client";

// Low-poly building models made from shared primitive shapes (one tile = 1 unit).
// Each model is centred on its footprint at y = 0. Geometries and materials are shared
// module-wide so a big city doesn't allocate thousands of them.
import { Billboard } from "@react-three/drei";
import { memo } from "react";
import * as THREE from "three";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PYRAMID = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const CROWN = new THREE.IcosahedronGeometry(0.5, 0);
const PINE = new THREE.ConeGeometry(0.5, 1, 7);
const TENT = new THREE.ConeGeometry(0.5, 1, 8);
const OCTA = new THREE.OctahedronGeometry(0.5, 0);
const DISC = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const MARK_WHITE = new THREE.MeshBasicMaterial({ color: "#ffffff" });

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
  cottage: 0.75, house: 0.95, apartments: 1.75, corner_shop: 0.5, cafe: 0.5, office: 3.2, workshop: 0.8,
  warehouse: 0.8, factory: 1.5, park: 0.5, court: 0.65, garden: 0.8, central_park: 1.0, tree: 0.9, clinic: 0.65, school: 0.9, library: 0.7, fire_station: 0.85, community: 0.8,
};

function Model({ typeId, seed, join }: { typeId: string; seed: number; join?: { left: boolean; right: boolean } }) {
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
    case "house": {
      // Townhome. Joined sides run the walls and roof to the edge so a row reads as one terrace.
      const xl = join?.left ? -0.5 : -0.35;
      const xr = join?.right ? 0.5 : 0.35;
      const w = xr - xl;
      const cx = (xl + xr) / 2;
      const roofL = join?.left ? -0.5 : -0.45;
      const roofR = join?.right ? 0.5 : 0.45;
      return (
        <>
          <B p={[cx, 0, 0]} s={[w, 0.5, 0.56]} c={wall} />
          {/* Gable roof along the row */}
          <mesh geometry={BOX} material={mat(roof)} position={[(roofL + roofR) / 2, 0.6, -0.15]} rotation={[0.62, 0, 0]} scale={[roofR - roofL, 0.05, 0.42]} castShadow />
          <mesh geometry={BOX} material={mat(roof)} position={[(roofL + roofR) / 2, 0.6, 0.15]} rotation={[-0.62, 0, 0]} scale={[roofR - roofL, 0.05, 0.42]} castShadow />
          {!join?.right && <B p={[0.22, 0.6, -0.12]} s={[0.09, 0.3, 0.09]} c="#78716c" />}
          <B p={[-0.12, 0, 0.281]} s={[0.13, 0.24, 0.02]} c={door} />
          <B p={[0.14, 0.22, 0.281]} s={[0.14, 0.12, 0.02]} c="#93c5fd" />
          <B p={[-0.14, 0.34, 0.281]} s={[0.12, 0.1, 0.02]} c="#93c5fd" />
          {!join?.right && <Tree p={[0.42, 0, 0.4]} s={0.6} crown={crown} />}
        </>
      );
    }
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
      // 2x2: a sawtooth-roofed shed with a yard of crates.
      return (
        <>
          <B p={[-0.2, 0, -0.15]} s={[1.3, 0.55, 1.2]} c={siding} />
          {[-0.62, -0.2, 0.22].map((x) => (
            <mesh key={x} geometry={BOX} material={mat(sidingDark)} position={[x, 0.7, -0.15]} rotation={[0, 0, 0.5]} scale={[0.46, 0.05, 1.22]} castShadow />
          ))}
          <B p={[-0.2, 0, 0.451]} s={[0.5, 0.38, 0.02]} c={accent} />
          <Cyl p={[0.35, 0.55, -0.55]} r={0.07} h={0.5} c={sidingDark} />
          <B p={[0.72, 0, 0.55]} s={[0.22, 0.18, 0.22]} c="#b45309" />
          <B p={[0.72, 0.18, 0.55]} s={[0.16, 0.14, 0.16]} c="#92400e" />
          <B p={[0.55, 0, 0.75]} s={[0.2, 0.16, 0.2]} c="#a16207" />
          <B p={[0, 0, 0.92]} s={[1.9, 0.02, 0.06]} c="#a8a29e" />
        </>
      );
    case "warehouse":
      // 2x2: a long depot with loading doors, a dock and a truck.
      return (
        <>
          <B p={[0, 0, -0.2]} s={[1.75, 0.7, 1.1]} c={siding} />
          <B p={[0, 0.7, -0.2]} s={[1.8, 0.07, 1.15]} c={sidingDark} />
          {[-0.55, 0, 0.55].map((x) => (
            <B key={x} p={[x, 0, 0.351]} s={[0.36, 0.42, 0.02]} c="#e7e5e4" />
          ))}
          <B p={[0, 0, 0.5]} s={[1.75, 0.12, 0.28]} c="#78716c" />
          <B p={[-0.55, 0, 0.8]} s={[0.3, 0.3, 0.18]} c={accent} />
          <B p={[-0.55, 0, 0.62]} s={[0.34, 0.36, 0.22]} c="#f8fafc" />
          <B p={[0.75, 0.7, -0.6]} s={[0.16, 0.12, 0.16]} c={accent} />
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
    case "court":
      // 2x2 basketball court: painted surface, lines, two hoops, fence posts.
      return (
        <>
          <B p={[0, 0, 0]} s={[1.92, 0.03, 1.92]} c="#15803d" />
          <B p={[0, 0.03, 0]} s={[1.6, 0.01, 1.2]} c={pick(["#c2410c", "#1d4ed8", "#7c3aed", "#0f766e"], seed, 12)} />
          {[
            [0, -0.6, 1.6, 0.03], [0, 0.6, 1.6, 0.03], [-0.8, 0, 0.03, 1.2], [0.8, 0, 0.03, 1.2], [0, 0, 0.03, 1.2],
          ].map(([x, z, w, d], i) => (
            <B key={i} p={[x, 0.041, z]} s={[w, 0.005, d]} c="#f8fafc" />
          ))}
          <mesh geometry={CYLINDER} material={mat("#f8fafc")} position={[0, 0.045, 0]} scale={[0.36, 0.005, 0.36]} />
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.86, 0, 0]}>
              <Cyl p={[side * 0.06, 0, 0]} r={0.025} h={0.62} c="#334155" />
              <B p={[0, 0.5, 0]} s={[0.03, 0.18, 0.28]} c="#f8fafc" />
              <mesh geometry={CYLINDER} material={mat("#f97316")} position={[-side * 0.06, 0.48, 0]} scale={[0.1, 0.012, 0.1]} />
            </group>
          ))}
          {[[-0.94, -0.94], [0.94, -0.94], [-0.94, 0.94], [0.94, 0.94]].map(([x, z], i) => (
            <Cyl key={i} p={[x, 0, z]} r={0.02} h={0.32} c="#94a3b8" />
          ))}
        </>
      );
    case "garden":
      // 3x3 garden park: cross paths, a pond, flower beds, trees and benches.
      return (
        <>
          <B p={[0, 0, 0]} s={[2.92, 0.04, 2.92]} c="#4ade80" />
          <B p={[0, 0.04, 0]} s={[2.92, 0.01, 0.22]} c="#e7e5e4" />
          <B p={[0, 0.04, 0]} s={[0.22, 0.01, 2.92]} c="#e7e5e4" />
          <mesh geometry={CYLINDER} material={mat("#38bdf8")} position={[0.75, 0.05, -0.75]} scale={[0.9, 0.02, 0.7]} />
          {[[-0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]].map(([x, z], i) => (
            <group key={i} position={[x, 0.04, z]}>
              <B p={[0, 0, 0]} s={[0.7, 0.06, 0.7]} c="#78350f" />
              {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18], [0, 0]].map(([fx, fz], j) => (
                <mesh key={j} geometry={CROWN} material={mat(["#f472b6", "#facc15", "#f87171", "#c084fc", "#fb923c"][(j + i + seed) % 5])} position={[fx, 0.1, fz]} scale={0.14} />
              ))}
            </group>
          ))}
          {[[-1.25, -1.25], [1.25, 1.25], [-1.25, 1.25], [1.25, -1.3], [0.3, -1.3], [-1.3, 0.3]].map(([x, z], i) => (
            <Tree key={i} p={[x, 0.04, z]} s={1.1} pine={i % 3 === 1} crown={pick(PALETTE.crowns, seed, 20 + i)} />
          ))}
          <B p={[-0.3, 0.04, 0.25]} s={[0.3, 0.07, 0.08]} c="#92400e" />
          <B p={[0.25, 0.04, -0.3]} s={[0.08, 0.07, 0.3]} c="#92400e" />
        </>
      );
    case "central_park":
      // 4x4 central park: a lake, woods, a gazebo, a playground and winding paths.
      return (
        <>
          <B p={[0, 0, 0]} s={[3.92, 0.04, 3.92]} c="#4ade80" />
          <mesh geometry={CYLINDER} material={mat("#3b82f6")} position={[-0.7, 0.05, -0.6]} scale={[1.8, 0.02, 1.3]} />
          <mesh geometry={CYLINDER} material={mat("#fde68a")} position={[-0.7, 0.045, -0.6]} scale={[1.95, 0.012, 1.45]} />
          <B p={[0.8, 0.04, 0.2]} s={[0.22, 0.01, 3.9]} c="#e7e5e4" />
          <B p={[0, 0.04, 1.1]} s={[3.9, 0.01, 0.22]} c="#e7e5e4" />
          {/* Gazebo */}
          <group position={[1.35, 0.04, -1.2]}>
            <Cyl p={[0, 0, 0]} r={0.32} h={0.06} c="#f8fafc" />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <Cyl key={k} p={[Math.cos((k * Math.PI) / 3) * 0.26, 0.06, Math.sin((k * Math.PI) / 3) * 0.26]} r={0.02} h={0.3} c="#f8fafc" />
            ))}
            <mesh geometry={TENT} material={mat(roof)} position={[0, 0.5, 0]} scale={[0.75, 0.3, 0.75]} castShadow />
          </group>
          {/* Playground */}
          <group position={[-1.2, 0.04, 1.5]}>
            <B p={[0, 0, 0]} s={[0.8, 0.02, 0.6]} c="#fcd34d" />
            <B p={[-0.2, 0, 0]} s={[0.16, 0.3, 0.16]} c={accent} />
            <mesh geometry={BOX} material={mat("#ef4444")} position={[0.02, 0.17, 0]} rotation={[0, 0, -0.6]} scale={[0.4, 0.03, 0.12]} />
            {[-0.1, 0.1].map((z) => (
              <B key={z} p={[0.28, 0, z * 2]} s={[0.03, 0.32, 0.03]} c="#475569" />
            ))}
            <B p={[0.28, 0.32, 0]} s={[0.03, 0.03, 0.44]} c="#475569" />
          </group>
          {Array.from({ length: 16 }, (_, i) => {
            const spots = [
              [-1.7, 0.4], [-1.7, -1.7], [-0.4, -1.75], [0.3, -1.6], [1.7, -0.3], [1.75, 0.5], [1.6, 1.7], [0.3, 1.75],
              [-0.3, 0.6], [0.3, 0.55], [1.3, 0.6], [-1.75, 1.0], [0.4, -0.4], [1.3, -0.4], [-0.2, 1.65], [1.75, -1.75],
            ];
            const [x, z] = spots[i];
            return <Tree key={i} p={[x, 0.04, z]} s={0.9 + ((seed >> i) & 3) * 0.12} pine={((seed >> (i + 3)) & 3) === 0} crown={pick(PALETTE.crowns, seed, 40 + i)} />;
          })}
        </>
      );
    case "tree": {
      // A small cluster of 1–3 trees, different on every tile.
      const n = 1 + (seed % 3);
      const spots: V3[] = [[-0.2, 0, -0.15], [0.2, 0, 0.18], [0.15, 0, -0.25]];
      return (
        <>
          {spots.slice(0, n).map((p, i) => (
            <Tree key={i} p={n === 1 ? [0, 0, 0] : p} s={1.1 + ((seed >> (i * 2)) & 3) * 0.15} pine={((seed >> (i + 5)) & 1) === 1} crown={pick(PALETTE.crowns, seed, 60 + i)} />
          ))}
        </>
      );
    }
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

/** Floating red "!" sign above a building that isn't next to a road. It always turns to face the camera. */
export function NoRoadMarker({ y }: { y: number }) {
  return (
    <Billboard position={[0, y + 0.42, 0]}>
      <mesh geometry={DISC} material={mat("#dc2626")} rotation-x={Math.PI / 2} scale={[0.34, 0.02, 0.34]} />
      <mesh geometry={BOX} material={MARK_WHITE} position={[0, 0.045, 0.012]} scale={[0.055, 0.17, 0.01]} />
      <mesh geometry={DISC} material={MARK_WHITE} rotation-x={Math.PI / 2} position={[0, -0.095, 0.012]} scale={[0.065, 0.01, 0.065]} />
    </Billboard>
  );
}

/** Floating yellow marker above a shop or factory that doesn't have enough workers. */
export function WorkerMarker({ y }: { y: number }) {
  return (
    <group position={[0, y + 0.35, 0]}>
      <mesh geometry={OCTA} material={mat("#facc15")} scale={[0.17, 0.26, 0.17]} />
    </group>
  );
}

export { BOX, CROWN, OCTA };
