"use client";

// Low-poly building models made from shared primitive shapes (one tile = 1 unit).
// Each model is centred on its footprint at y = 0. Geometries and materials are shared
// module-wide so a big city doesn't allocate thousands of them.
import { Billboard } from "@react-three/drei";
import { memo } from "react";
import * as THREE from "three";
import { CATALOG_HEIGHT, CATALOG_MODELS } from "./models-catalog";

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

export type V3 = [number, number, number];

/** A box with its base at y (position = centre of the bottom face). */
export function B({ p, s, c, metal }: { p: V3; s: V3; c: string; metal?: boolean }) {
  return (
    <mesh geometry={BOX} material={mat(c, { metal })} position={[p[0], p[1] + s[1] / 2, p[2]]} scale={s} castShadow receiveShadow />
  );
}
export function Roof({ p, s, c }: { p: V3; s: V3; c: string }) {
  return <mesh geometry={PYRAMID} material={mat(c)} position={[p[0], p[1] + s[1] / 2, p[2]]} scale={s} castShadow />;
}
export function Cyl({ p, r, h, c }: { p: V3; r: number; h: number; c: string }) {
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

/** Tiny seeded random numbers in [0, 1) for one tile (same tile, same layout every visit). */
function rand(seed: number) {
  let h = seed >>> 0 || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

const TREE_STYLES = 6;

/**
 * A trees tile: one of six styles, picked by the tile's seed, with positions, sizes and colors varied too.
 * Grove, pine stand, big oak with shrubs, birch clump with rocks, dense woods, and a meadow with a couple of trees.
 */
function TreeTile({ seed }: { seed: number }) {
  const r = rand(seed * 2654435761);
  const style = seed % TREE_STYLES;
  const crown = (i: number) => pick(PALETTE.crowns, seed, 60 + i);
  const jitter = (v: number, amt = 0.06) => v + (r() - 0.5) * amt * 2;
  const trees: { p: V3; s: number; pine?: boolean; c?: string }[] = [];
  const bits: React.ReactNode[] = [];
  const rock = (x: number, z: number, k: number) => (
    <B key={`r${k}`} p={[x, 0, z]} s={[0.07 + r() * 0.06, 0.04 + r() * 0.04, 0.06 + r() * 0.05]} c={r() < 0.5 ? "#a8a29e" : "#78716c"} />
  );
  const shrub = (x: number, z: number, k: number) => (
    <mesh key={`b${k}`} geometry={CROWN} material={mat(r() < 0.5 ? "#4d7c0f" : "#65a30d")} position={[x, 0.06, z]} scale={[0.14, 0.1, 0.14]} castShadow />
  );
  switch (style) {
    case 0: // mixed grove of 4
      [[-0.22, -0.2], [0.22, -0.18], [-0.18, 0.22], [0.2, 0.2]].forEach(([x, z], i) =>
        trees.push({ p: [jitter(x), 0, jitter(z)], s: 0.75 + r() * 0.35, pine: r() < 0.3, c: crown(i) }));
      break;
    case 1: // pine stand: five pines of different heights
      [[-0.25, -0.25], [0.15, -0.28], [0.28, 0.1], [-0.05, 0.05], [-0.25, 0.27]].forEach(([x, z]) =>
        trees.push({ p: [jitter(x), 0, jitter(z)], s: 0.65 + r() * 0.5, pine: true }));
      break;
    case 2: // one big shade tree with shrubs around it
      trees.push({ p: [jitter(-0.05), 0, jitter(-0.05)], s: 1.45 + r() * 0.2, c: crown(0) });
      [[0.3, 0.28], [-0.3, 0.3], [0.32, -0.3]].forEach(([x, z], i) => bits.push(shrub(jitter(x), jitter(z), i)));
      break;
    case 3: // a clump of three slim trees with rocks
      [[-0.18, -0.12], [0.16, -0.2], [0.02, 0.18]].forEach(([x, z], i) =>
        trees.push({ p: [jitter(x), 0, jitter(z)], s: 0.7 + r() * 0.25, c: i === 1 ? "#a3e635" : crown(i) }));
      bits.push(rock(jitter(0.3), jitter(0.3), 0), rock(jitter(-0.32), jitter(0.3), 1));
      break;
    case 4: // dense woods: six trees packed together
      for (let i = 0; i < 6; i++) {
        const x = -0.28 + (i % 3) * 0.28;
        const z = i < 3 ? -0.18 : 0.18;
        trees.push({ p: [jitter(x, 0.05), 0, jitter(z, 0.08)], s: 0.6 + r() * 0.35, pine: r() < 0.5, c: crown(i) });
      }
      break;
    default: // meadow: two trees, flowers and a rock
      trees.push({ p: [jitter(-0.2), 0, jitter(-0.15)], s: 0.95 + r() * 0.2, c: crown(0) }, { p: [jitter(0.22), 0, jitter(0.2)], s: 0.75 + r() * 0.2, pine: r() < 0.4, c: crown(1) });
      for (let i = 0; i < 7; i++) {
        const c = ["#f472b6", "#facc15", "#f8fafc", "#a78bfa"][i % 4];
        bits.push(<B key={`f${i}`} p={[(r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8]} s={[0.035, 0.03, 0.035]} c={c} />);
      }
      bits.push(rock(jitter(0.3), jitter(-0.3), 9));
  }
  return (
    <>
      {trees.map((t, i) => (
        <Tree key={i} p={t.p} s={t.s} pine={t.pine} crown={t.c} />
      ))}
      {bits}
    </>
  );
}

// ---------------------------------------------------------------------------
// Color variety: each building gets its own scheme, picked from these palettes by a
// seed made from the building's id, so a building keeps its colors across visits.
// ---------------------------------------------------------------------------
export const PALETTE = {
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
export function pick<T>(list: readonly T[], seed: number, salt: number): T {
  let h = Math.imul(seed ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return list[(h >>> 0) % list.length];
}

/** The colors a building's model uses for its main parts. */
export type Colors = {
  wall: string; roof: string; facade: string; awning: string; band: string; glass: string; glassTop: string;
  siding: string; sidingDark: string; accent: string;
};

/**
 * Color schemes the player can pick for a building (by seed; the seeds are what's saved, so they never change). Each is one
 * color family: the walls, roof, trim, awnings, glass, industrial siding and accent all come in matching shades, so the whole
 * building follows the swatch while keeping several colors. Doors, trees and tents still vary.
 */
const SCHEMES: Record<number, Colors> = {
  // Terracotta
  1: { wall: "#fde7c8", roof: "#9a3412", facade: "#fed7aa", awning: "#ea580c", band: "#9a3412", glass: "#fdba74", glassTop: "#ea580c", siding: "#c9a48a", sidingDark: "#9a6f55", accent: "#ea580c" },
  // Slate
  3: { wall: "#e2e8f0", roof: "#334155", facade: "#cbd5e1", awning: "#475569", band: "#1e293b", glass: "#94a3b8", glassTop: "#64748b", siding: "#9ca3af", sidingDark: "#6b7280", accent: "#475569" },
  // Purple
  4: { wall: "#ede9fe", roof: "#6b21a8", facade: "#e9d5ff", awning: "#7c3aed", band: "#5b21b6", glass: "#a78bfa", glassTop: "#7c3aed", siding: "#a99bbf", sidingDark: "#7b6a94", accent: "#9333ea" },
  // Forest green
  6: { wall: "#dcfce7", roof: "#166534", facade: "#bbf7d0", awning: "#16a34a", band: "#166534", glass: "#4ade80", glassTop: "#16a34a", siding: "#a3b1a0", sidingDark: "#6f7f6b", accent: "#16a34a" },
  // Stone
  10: { wall: "#e7e5e4", roof: "#57534e", facade: "#d6d3d1", awning: "#78716c", band: "#44403c", glass: "#a8a29e", glassTop: "#78716c", siding: "#a8a29e", sidingDark: "#78716c", accent: "#78716c" },
  // Sunny yellow
  13: { wall: "#fef9c3", roof: "#a16207", facade: "#fde68a", awning: "#ca8a04", band: "#854d0e", glass: "#fbbf24", glassTop: "#b45309", siding: "#c4b17a", sidingDark: "#937f4b", accent: "#eab308" },
  // Teal
  14: { wall: "#ccfbf1", roof: "#0f766e", facade: "#99f6e4", awning: "#0d9488", band: "#115e59", glass: "#2dd4bf", glassTop: "#0d9488", siding: "#93b5ae", sidingDark: "#5f857d", accent: "#0891b2" },
  // Blue
  30: { wall: "#dbeafe", roof: "#1e3a8a", facade: "#bfdbfe", awning: "#2563eb", band: "#1e40af", glass: "#60a5fa", glassTop: "#2563eb", siding: "#9fb3c8", sidingDark: "#6b84a0", accent: "#2563eb" },
  // Coral red
  63: { wall: "#fee2e2", roof: "#b91c1c", facade: "#fecaca", awning: "#dc2626", band: "#991b1b", glass: "#fca5a5", glassTop: "#dc2626", siding: "#c4a0a0", sidingDark: "#946a6a", accent: "#dc2626" },
  // Rose
  182: { wall: "#fce7f3", roof: "#9d174d", facade: "#fbcfe8", awning: "#db2777", band: "#9d174d", glass: "#f9a8d4", glassTop: "#db2777", siding: "#bfa0b0", sidingDark: "#8f6a7e", accent: "#db2777" },
};

/** Whether a seed is one of the schemes a player picked (not the automatic mix). */
export function isChosenScheme(seed: number): boolean {
  return seed in SCHEMES;
}

/** Buildings whose colors are part of what they are (they don't offer the Colors menu). */
export const FIXED_COLOR_IDS = new Set(["bank", "museum", "police", "hospital", "fire_station", "pool", "founders_statue"]);

/** The main colors for a seed: a picked scheme, or the automatic mix from the palettes. */
export function colorsFor(seed: number): Colors {
  const chosen = SCHEMES[seed];
  if (chosen) return chosen;
  const [awning, band] = pick(PALETTE.awnings, seed, 5);
  const [glass, glassTop] = pick(PALETTE.glass, seed, 6);
  const [siding, sidingDark] = pick(PALETTE.siding, seed, 7);
  return {
    wall: pick(PALETTE.walls, seed, 1), roof: pick(PALETTE.roofs, seed, 2), facade: pick(PALETTE.facades, seed, 4),
    awning, band, glass, glassTop, siding, sidingDark, accent: pick(PALETTE.accents, seed, 8),
  };
}

/** The choices shown under Colors: swatch = the scheme's roof over its walls, with its accent as a dot. */
export const COLOR_CHOICES: { seed: number; main: string; second: string; accent: string }[] = Object.entries(SCHEMES).map(
  ([seed, c]) => ({ seed: Number(seed), main: c.wall, second: c.roof, accent: c.awning }),
);

/** Rough top height of each model, for markers floating above it. */
export const MODEL_HEIGHT: Record<string, number> = {
  cottage: 0.75, house: 0.95, apartments: 1.75, corner_shop: 0.5, cafe: 0.5, office: 3.2, workshop: 0.8,
  warehouse: 0.8, factory: 1.5, park: 0.5, court: 0.65, garden: 0.8, central_park: 1.0, tree: 0.9, clinic: 0.65, school: 0.9, library: 0.7, fire_station: 0.85, community: 0.8,
  ...CATALOG_HEIGHT,
};

function Model({ typeId, seed, join }: { typeId: string; seed: number; join?: { left: boolean; right: boolean } }) {
  const catalog = CATALOG_MODELS[typeId];
  if (catalog) return catalog(seed);
  const { wall, roof, facade, awning, band, glass, glassTop, siding, sidingDark, accent } = colorsFor(seed);
  const door = pick(PALETTE.doors, seed, 3);
  const chosen = isChosenScheme(seed); // civic buildings keep their own colors unless a scheme is picked
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
          <mesh geometry={BOX} material={mat(roof)} position={[(roofL + roofR) / 2, 0.6, -0.15]} rotation={[-0.62, 0, 0]} scale={[roofR - roofL, 0.05, 0.42]} castShadow />
          <mesh geometry={BOX} material={mat(roof)} position={[(roofL + roofR) / 2, 0.6, 0.15]} rotation={[0.62, 0, 0]} scale={[roofR - roofL, 0.05, 0.42]} castShadow />
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
    case "tree":
      return <TreeTile seed={seed} />;
    case "clinic":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.76, 0.48, 0.64]} c={chosen ? wall : "#f8fafc"} />
          <B p={[0, 0.48, 0]} s={[0.78, 0.04, 0.66]} c={chosen ? roof : "#cbd5e1"} />
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
          <B p={[0, 0, 0]} s={[0.84, 0.03, 0.84]} c={chosen ? facade : "#e9d5ff"} />
          <mesh geometry={TENT} material={mat(chosen ? awning : tent)} position={[0, 0.38, 0]} scale={[0.78, 0.7, 0.78]} castShadow />
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

export { BOX, PYRAMID, CROWN, OCTA, CYLINDER, DISC, TENT, PINE };
