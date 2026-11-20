"use client";

// Models for the full building catalog. Each is centred on its footprint at y = 0, w tiles wide along x and d deep
// along z, with its front (doors, signs) facing +z. Colors come from one small palette per building (picked by its
// seed), so the same building always looks the same. Nothing here runs at import time (models.tsx imports this file).
import type { ReactNode } from "react";
import { B, BOX, Cyl, PALETTE, Roof, Tree, mat, pick } from "./models";

/** A two-sided roof along x (ridge in the middle), w × d, with its eaves at height y. */
function SlopedRoof({ x, z, y, w, d, c }: { x: number; z: number; y: number; w: number; d: number; c: string }) {
  const half = d / 2;
  const tilt = 0.5;
  const len = half / Math.cos(tilt);
  return (
    <>
      <mesh geometry={BOX} material={mat(c)} position={[x, y + (half * Math.tan(tilt)) / 2, z - half / 2]} rotation={[-tilt, 0, 0]} scale={[w, 0.04, len]} castShadow />
      <mesh geometry={BOX} material={mat(c)} position={[x, y + (half * Math.tan(tilt)) / 2, z + half / 2]} rotation={[tilt, 0, 0]} scale={[w, 0.04, len]} castShadow />
    </>
  );
}

/** One color set per building. */
export type Pal = { wall: string; roof: string; trim: string; accent: string; glass: string; door: string };

export function palFor(seed: number): Pal {
  return {
    wall: pick(PALETTE.walls, seed, 1),
    roof: pick(PALETTE.roofs, seed, 2),
    trim: pick(PALETTE.facades, seed, 3),
    accent: pick(PALETTE.accents, seed, 4),
    glass: pick(PALETTE.glass, seed, 5)[0],
    door: pick(PALETTE.doors, seed, 6),
  };
}

const WIN = "#bfdbfe";
const DARK = "#334155";
const CONCRETE = "#d6d3d1";
const ASPHALT = "#4b5563";
const GRASS = "#4ade80";
const LAWN = "#65a30d";

/** A row of windows across a wall facing +z at depth z. */
function windows(n: number, width: number, y: number, z: number, size = 0.1, color = WIN): ReactNode[] {
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? 0 : -width / 2 + (width * i) / (n - 1);
    return <B key={`w${y}-${i}`} p={[x, y, z]} s={[size, size, 0.02]} c={color} />;
  });
}

/** A flat sign above a door. */
function sign(y: number, z: number, w: number, c: string) {
  return <B p={[0, y, z]} s={[w, 0.08, 0.03]} c={c} />;
}

function Plot({ w, d, c = LAWN }: { w: number; d: number; c?: string }) {
  return <B p={[0, 0, 0]} s={[w - 0.06, 0.02, d - 0.06]} c={c} />;
}

type Maker = (pal: Pal, seed: number) => ReactNode;

const MODELS: Record<string, Maker> = {
  // ---------------- Residential ----------------
  small_cottage: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.46, 0.3, 0.42]} c={p.wall} />
      <Roof p={[0, 0.3, 0]} s={[0.62, 0.28, 0.56]} c={p.roof} />
      <B p={[0, 0, 0.211]} s={[0.1, 0.17, 0.02]} c={p.door} />
      <B p={[0.14, 0.12, 0.211]} s={[0.08, 0.08, 0.02]} c={WIN} />
      <Cyl p={[0.13, 0.4, -0.06]} r={0.035} h={0.18} c="#78716c" />
    </>
  ),
  suburban: (p) => (
    <>
      <Plot w={1} d={1} />
      <B p={[-0.08, 0, -0.06]} s={[0.56, 0.36, 0.46]} c={p.wall} />
      <Roof p={[-0.08, 0.36, -0.06]} s={[0.74, 0.3, 0.6]} c={p.roof} />
      <B p={[0.3, 0, -0.04]} s={[0.26, 0.26, 0.4]} c={p.trim} />
      <B p={[0.3, 0, 0.161]} s={[0.2, 0.17, 0.02]} c="#e5e7eb" />
      <B p={[0.3, 0, 0.32]} s={[0.22, 0.012, 0.3]} c={CONCRETE} />
      <B p={[-0.12, 0, 0.171]} s={[0.1, 0.18, 0.02]} c={p.door} />
      {windows(2, 0.3, 0.14, 0.171).slice(0, 1)}
      <B p={[-0.3, 0.14, 0.171]} s={[0.1, 0.1, 0.02]} c={WIN} />
    </>
  ),
  duplex: (p) => (
    <>
      <Plot w={2} d={1} />
      {[-0.45, 0.45].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <B p={[0, 0, -0.05]} s={[0.78, 0.5, 0.56]} c={p.wall} />
          <B p={[0, 0, 0.231]} s={[0.12, 0.2, 0.02]} c={p.door} />
          <B p={[0.22, 0.24, 0.231]} s={[0.14, 0.12, 0.02]} c={WIN} />
          <B p={[-0.22, 0.24, 0.231]} s={[0.14, 0.12, 0.02]} c={WIN} />
        </group>
      ))}
      <B p={[0, 0, -0.05]} s={[0.05, 0.56, 0.6]} c={p.trim} />
      <Roof p={[0, 0.5, -0.05]} s={[1.9, 0.32, 0.74]} c={p.roof} />
    </>
  ),
  luxury: (p) => (
    <>
      <Plot w={2} d={2} />
      <B p={[-0.25, 0, -0.3]} s={[1.0, 0.55, 0.7]} c={p.wall} />
      <B p={[0.45, 0, -0.35]} s={[0.55, 0.4, 0.6]} c={p.trim} />
      <B p={[-0.25, 0.55, -0.3]} s={[1.06, 0.05, 0.76]} c={p.roof} />
      <B p={[0.45, 0.4, -0.35]} s={[0.61, 0.05, 0.66]} c={p.roof} />
      <B p={[-0.25, 0, 0.051]} s={[0.9, 0.42, 0.02]} c={p.glass} metal />
      <B p={[0.35, 0, 0.45]} s={[0.7, 0.03, 0.42]} c="#e0f2fe" />
      <B p={[0.35, 0.01, 0.45]} s={[0.6, 0.03, 0.34]} c="#38bdf8" />
      <Tree p={[-0.7, 0, 0.6]} s={1.1} crown="#16a34a" />
      <Tree p={[-0.3, 0, 0.7]} s={0.9} crown="#22c55e" />
    </>
  ),
  highrise: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.5, 0.12, 1.5]} c={CONCRETE} />
      <B p={[0, 0.12, 0]} s={[1.1, 3.1, 1.1]} c={p.wall} />
      {Array.from({ length: 12 }, (_, i) => (
        <B key={i} p={[0, 0.35 + i * 0.24, 0.552]} s={[0.95, 0.1, 0.02]} c={p.glass} metal />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <B key={`s${i}`} p={[0.552, 0.35 + i * 0.24, 0]} s={[0.02, 0.1, 0.95]} c={p.glass} metal />
      ))}
      {/* Windows on the back and the other side too, so it looks right from every angle. */}
      {Array.from({ length: 12 }, (_, i) => (
        <B key={`b${i}`} p={[0, 0.35 + i * 0.24, -0.552]} s={[0.95, 0.1, 0.02]} c={p.glass} metal />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <B key={`w${i}`} p={[-0.552, 0.35 + i * 0.24, 0]} s={[0.02, 0.1, 0.95]} c={p.glass} metal />
      ))}
      <B p={[0, 3.22, 0]} s={[0.7, 0.18, 0.7]} c={p.roof} />
      <Cyl p={[0.2, 3.4, 0.2]} r={0.02} h={0.4} c="#e5e7eb" />
    </>
  ),

  // ---------------- Commercial ----------------
  grocery: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={ASPHALT} />
      <B p={[0, 0, -0.18]} s={[1.6, 0.48, 0.5]} c={p.trim} />
      <B p={[0, 0.48, -0.18]} s={[1.66, 0.05, 0.56]} c={p.roof} />
      <B p={[0, 0, 0.071]} s={[1.2, 0.3, 0.02]} c={WIN} />
      {sign(0.36, 0.08, 0.8, p.accent)}
      <B p={[0, 0.3, 0.12]} s={[1.5, 0.03, 0.12]} c={p.accent} />
      {[-0.6, -0.3, 0.3, 0.6].map((x) => (
        <B key={x} p={[x, 0.02, 0.35]} s={[0.12, 0.06, 0.2]} c={pick(PALETTE.accents, Math.round(x * 10) + 7, 1)} />
      ))}
    </>
  ),
  restaurant: (p) => (
    <>
      <B p={[0, 0, -0.05]} s={[0.7, 0.42, 0.6]} c={p.wall} />
      <B p={[0, 0.42, -0.05]} s={[0.74, 0.05, 0.64]} c={p.roof} />
      <B p={[0, 0.26, 0.29]} s={[0.72, 0.04, 0.16]} c={p.accent} />
      <B p={[0, 0, 0.251]} s={[0.12, 0.22, 0.02]} c={p.door} />
      <B p={[-0.22, 0.08, 0.251]} s={[0.18, 0.16, 0.02]} c={WIN} />
      <B p={[0.22, 0.08, 0.251]} s={[0.18, 0.16, 0.02]} c={WIN} />
      {[-0.25, 0.25].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0, 0.4]} r={0.06} h={0.1} c="#f8fafc" />
          <Cyl p={[x, 0.1, 0.4]} r={0.11} h={0.012} c="#f8fafc" />
        </group>
      ))}
    </>
  ),
  clothing: (p) => (
    <>
      <B p={[0, 0, -0.05]} s={[0.66, 0.5, 0.6]} c={p.trim} />
      <B p={[0, 0.5, -0.05]} s={[0.7, 0.05, 0.64]} c={p.accent} />
      <B p={[0, 0, 0.251]} s={[0.5, 0.3, 0.02]} c={WIN} />
      <B p={[-0.12, 0.04, 0.262]} s={[0.05, 0.18, 0.02]} c={p.accent} />
      <B p={[0.12, 0.04, 0.262]} s={[0.05, 0.18, 0.02]} c={p.roof} />
      {sign(0.36, 0.26, 0.4, p.roof)}
    </>
  ),
  bank: (p) => (
    <>
      <B p={[0, 0, -0.04]} s={[0.76, 0.06, 0.66]} c={CONCRETE} />
      <B p={[0, 0.06, -0.08]} s={[0.66, 0.46, 0.5]} c="#f5f5f4" />
      {[-0.26, -0.09, 0.09, 0.26].map((x) => (
        <Cyl key={x} p={[x, 0.06, 0.22]} r={0.035} h={0.44} c="#e7e5e4" />
      ))}
      <Roof p={[0, 0.52, 0.05]} s={[0.8, 0.16, 0.72]} c="#e7e5e4" />
      <B p={[0, 0.06, 0.171]} s={[0.12, 0.24, 0.02]} c={p.door} />
      <B p={[0, 0.44, 0.39]} s={[0.24, 0.06, 0.02]} c="#ca8a04" />
    </>
  ),
  cinema: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 1.9]} c={ASPHALT} />
      <B p={[0, 0, -0.25]} s={[1.6, 0.9, 1.2]} c={p.wall} />
      <B p={[0, 0.9, -0.25]} s={[1.66, 0.06, 1.26]} c={DARK} />
      <B p={[0, 0.45, 0.4]} s={[1.0, 0.36, 0.08]} c={p.accent} />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} p={[-0.42 + i * 0.12, 0.79, 0.45]} s={[0.05, 0.05, 0.02]} c="#fde047" />
      ))}
      <B p={[0, 0, 0.36]} s={[0.6, 0.32, 0.02]} c={DARK} />
      <B p={[0, 0.5, 0.45]} s={[0.7, 0.14, 0.02]} c="#f8fafc" />
    </>
  ),
  hotel: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 1.9]} c={CONCRETE} />
      <B p={[0, 0, -0.15]} s={[1.5, 0.3, 1.3]} c={p.trim} />
      <B p={[0, 0.3, -0.25]} s={[1.2, 1.9, 0.9]} c={p.wall} />
      {Array.from({ length: 7 }, (_, row) => windows(5, 0.9, 0.45 + row * 0.24, 0.201, 0.1, p.glass))}
      <B p={[0, 2.2, -0.25]} s={[1.26, 0.06, 0.96]} c={p.roof} />
      <B p={[0, 1.9, 0.21]} s={[0.6, 0.14, 0.03]} c={p.accent} />
      <B p={[0, 0, 0.51]} s={[0.24, 0.24, 0.02]} c={WIN} />
      <B p={[0, 0.24, 0.6]} s={[0.6, 0.03, 0.3]} c={p.accent} />
    </>
  ),
  mall: (p) => (
    <>
      <B p={[0, 0, 0]} s={[2.9, 0.02, 2.9]} c={ASPHALT} />
      {Array.from({ length: 6 }, (_, i) => (
        <B key={i} p={[-1.1 + i * 0.44, 0.021, 1.0]} s={[0.03, 0.005, 0.5]} c="#f8fafc" />
      ))}
      <B p={[0, 0, -0.35]} s={[2.5, 0.75, 1.9]} c={p.trim} />
      <B p={[0, 0.75, -0.35]} s={[2.56, 0.06, 1.96]} c={p.roof} />
      <B p={[0, 0.81, -0.35]} s={[0.9, 0.3, 0.9]} c={p.glass} metal />
      <B p={[0, 0, 0.611]} s={[0.8, 0.5, 0.02]} c={WIN} />
      <B p={[-0.9, 0, 0.611]} s={[0.5, 0.4, 0.02]} c={WIN} />
      <B p={[0.9, 0, 0.611]} s={[0.5, 0.4, 0.02]} c={WIN} />
      <B p={[0, 0.55, 0.64]} s={[1.1, 0.16, 0.04]} c={p.accent} />
    </>
  ),

  // ---------------- Industrial ----------------
  small_factory: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.86, 0.02, 0.86]} c={CONCRETE} />
      <B p={[-0.05, 0, -0.05]} s={[0.62, 0.36, 0.56]} c={pick(PALETTE.siding, Math.round(p.wall.length * 7), 1)[0]} />
      {[-0.22, 0, 0.22].map((x) => (
        <Roof key={x} p={[x - 0.05, 0.36, -0.05]} s={[0.22, 0.16, 0.58]} c={p.roof} />
      ))}
      <Cyl p={[0.3, 0, -0.25]} r={0.06} h={0.75} c="#78716c" />
      <B p={[-0.05, 0, 0.231]} s={[0.24, 0.22, 0.02]} c={DARK} />
    </>
  ),
  warehouse: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={CONCRETE} />
      <B p={[0, 0, -0.08]} s={[1.7, 0.5, 0.66]} c={pick(PALETTE.siding, p.roof.charCodeAt(2), 1)[0]} />
      <B p={[0, 0.5, -0.08]} s={[1.76, 0.05, 0.72]} c={p.roof} />
      {[-0.55, 0, 0.55].map((x) => (
        <B key={x} p={[x, 0, 0.261]} s={[0.36, 0.34, 0.02]} c="#a8a29e" />
      ))}
      <B p={[-0.6, 0.02, 0.4]} s={[0.22, 0.14, 0.14]} c="#b45309" />
    </>
  ),
  distribution: (p) => (
    <>
      <B p={[0, 0, 0]} s={[2.9, 0.02, 2.9]} c={ASPHALT} />
      <B p={[0, 0, -0.45]} s={[2.6, 0.7, 1.7]} c={pick(PALETTE.siding, p.door.charCodeAt(3), 2)[0]} />
      <B p={[0, 0.7, -0.45]} s={[2.66, 0.05, 1.76]} c={p.roof} />
      {Array.from({ length: 6 }, (_, i) => (
        <B key={i} p={[-1.05 + i * 0.42, 0, 0.411]} s={[0.3, 0.38, 0.02]} c="#a8a29e" />
      ))}
      {[-0.8, 0, 0.8].map((x) => (
        <group key={x} position={[x, 0, 0.9]}>
          <B p={[0, 0.02, 0]} s={[0.26, 0.22, 0.46]} c="#f8fafc" />
          <B p={[0, 0.02, 0.3]} s={[0.24, 0.18, 0.16]} c={p.accent} />
        </group>
      ))}
    </>
  ),

  // ---------------- Municipal & services ----------------
  police: () => (
    <>
      <B p={[0, 0, 0]} s={[0.9, 0.02, 0.9]} c={CONCRETE} />
      <B p={[0, 0, -0.1]} s={[0.72, 0.46, 0.52]} c="#dbeafe" />
      <B p={[0, 0.46, -0.1]} s={[0.76, 0.05, 0.56]} c="#1e3a8a" />
      <B p={[0, 0.3, 0.17]} s={[0.5, 0.08, 0.03]} c="#1d4ed8" />
      <B p={[0, 0, 0.161]} s={[0.14, 0.24, 0.02]} c="#1e3a8a" />
      <B p={[0.25, 0.02, 0.33]} s={[0.16, 0.08, 0.26]} c="#f8fafc" />
      <B p={[0.25, 0.1, 0.33]} s={[0.12, 0.03, 0.06]} c="#ef4444" />
    </>
  ),
  hospital: () => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 1.9]} c={CONCRETE} />
      <B p={[0, 0, -0.3]} s={[1.5, 1.0, 1.0]} c="#f8fafc" />
      <B p={[-0.4, 1.0, -0.3]} s={[0.6, 0.6, 0.8]} c="#f1f5f9" />
      {[0.3, 0.6].map((y) => windows(6, 1.2, y, 0.201, 0.12, "#7dd3fc"))}
      <B p={[0.4, 1.0, -0.3]} s={[0.36, 0.04, 0.36]} c="#94a3b8" />
      <B p={[0.4, 1.04, -0.3]} s={[0.22, 0.005, 0.05]} c="#f8fafc" />
      <B p={[0, 0.8, 0.21]} s={[0.28, 0.08, 0.03]} c="#dc2626" />
      <B p={[0, 0.7, 0.21]} s={[0.08, 0.28, 0.03]} c="#dc2626" />
      <B p={[0, 0, 0.4]} s={[0.6, 0.02, 0.4]} c="#cbd5e1" />
      <B p={[0, 0.3, 0.45]} s={[0.6, 0.03, 0.3]} c="#e2e8f0" />
    </>
  ),
  city_hall: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 1.9]} c={CONCRETE} />
      <B p={[0, 0.02, -0.2]} s={[1.5, 0.08, 1.1]} c="#e7e5e4" />
      <B p={[0, 0.1, -0.25]} s={[1.3, 0.62, 0.8]} c="#f5f5f4" />
      {Array.from({ length: 6 }, (_, i) => (
        <Cyl key={i} p={[-0.5 + i * 0.2, 0.1, 0.2]} r={0.04} h={0.6} c="#fafaf9" />
      ))}
      <Roof p={[0, 0.72, 0.0]} s={[1.4, 0.22, 1.1]} c={p.roof} />
      <B p={[0, 0.72, -0.25]} s={[0.36, 0.7, 0.36]} c="#f5f5f4" />
      <Cyl p={[0, 0.98, -0.065]} r={0.11} h={0.02} c="#f8fafc" />
      <Roof p={[0, 1.42, -0.25]} s={[0.46, 0.4, 0.46]} c={p.roof} />
      <Cyl p={[0.7, 0.02, 0.7]} r={0.015} h={0.8} c="#e5e7eb" />
      <B p={[0.78, 0.65, 0.7]} s={[0.16, 0.1, 0.01]} c={p.accent} />
    </>
  ),
  // Medical clinic (was 1x1 Clinic): keeps the same shape, in models.tsx.

  // ---------------- Knowledge ----------------
  school: (p) => (
    <>
      {/* Schoolyard: lawn, with a play area on the right. */}
      <B p={[0, 0, 0]} s={[1.92, 0.012, 0.96]} c="#9ccf86" />
      <B p={[0.58, 0.012, 0.06]} s={[0.66, 0.008, 0.62]} c="#d8c9a3" />
      {/* Brick schoolhouse with white trim, a sloped roof along its length and a little bell tower. */}
      <B p={[-0.34, 0, -0.1]} s={[1.08, 0.4, 0.5]} c="#c8553d" />
      <B p={[-0.34, 0.38, -0.1]} s={[1.12, 0.03, 0.54]} c="#f5f5f4" />
      <SlopedRoof x={-0.34} z={-0.1} y={0.41} w={1.16} d={0.58} c={p.roof} />
      <B p={[-0.34, 0.6, -0.1]} s={[0.14, 0.14, 0.14]} c="#f5f5f4" />
      <Roof p={[-0.34, 0.74, -0.1]} s={[0.2, 0.14, 0.2]} c={p.roof} />
      {/* Front: windows either side of the door, a canopy over it, steps. */}
      {[-0.78, -0.62, -0.06, 0.1].map((x) => (
        <B key={x} p={[x, 0.15, 0.151]} s={[0.1, 0.12, 0.02]} c="#bfdbfe" />
      ))}
      <B p={[-0.34, 0, 0.151]} s={[0.16, 0.24, 0.02]} c={p.door} />
      <B p={[-0.34, 0.25, 0.2]} s={[0.26, 0.025, 0.12]} c="#f5f5f4" />
      <B p={[-0.34, 0, 0.21]} s={[0.24, 0.03, 0.1]} c="#d6d3d1" />
      {/* Flag pole. */}
      <Cyl p={[0.12, 0.012, 0.36]} r={0.01} h={0.62} c="#e5e7eb" />
      <B p={[0.17, 0.52, 0.36]} s={[0.1, 0.07, 0.008]} c={p.accent} />
      {/* Playground: a slide and a swing set. */}
      <B p={[0.42, 0.02, 0.05]} s={[0.08, 0.2, 0.08]} c={p.accent} />
      <mesh geometry={BOX} material={mat("#facc15")} position={[0.42, 0.13, 0.2]} rotation={[0.75, 0, 0]} scale={[0.07, 0.01, 0.3]} castShadow />
      {/* Swing set: two posts, a top bar and two seats on ropes. */}
      <B p={[0.6, 0.02, 0.06]} s={[0.015, 0.24, 0.015]} c="#64748b" />
      <B p={[0.88, 0.02, 0.06]} s={[0.015, 0.24, 0.015]} c="#64748b" />
      <B p={[0.74, 0.25, 0.06]} s={[0.3, 0.015, 0.015]} c="#64748b" />
      {[0.68, 0.8].map((x) => (
        <group key={x}>
          <B p={[x, 0.08, 0.06]} s={[0.004, 0.17, 0.004]} c="#94a3b8" />
          <B p={[x, 0.075, 0.06]} s={[0.06, 0.01, 0.035]} c={p.accent} />
        </group>
      ))}
      <Tree p={[0.9, 0.012, -0.36]} s={0.7} />
    </>
  ),
  high_school: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 1.9]} c="#86efac" />
      <B p={[0, 0.02, 0.45]} s={[1.6, 0.01, 0.7]} c="#c2410c" />
      <B p={[0, 0.03, 0.45]} s={[1.3, 0.01, 0.42]} c="#4ade80" />
      <B p={[0, 0, -0.45]} s={[1.6, 0.62, 0.8]} c={p.trim} />
      <B p={[0, 0.62, -0.45]} s={[1.66, 0.05, 0.86]} c={p.roof} />
      {[0.15, 0.4].map((y) => windows(7, 1.3, y, -0.049, 0.11))}
      <B p={[0, 0, -0.049]} s={[0.18, 0.26, 0.02]} c={p.door} />
      {sign(0.5, -0.03, 0.6, p.accent)}
    </>
  ),
  university: (p) => (
    <>
      <B p={[0, 0, 0]} s={[2.9, 0.02, 2.9]} c={GRASS} />
      <B p={[0, 0.02, 0.6]} s={[0.25, 0.01, 1.6]} c={CONCRETE} />
      <B p={[0, 0.02, 0.2]} s={[1.6, 0.01, 0.25]} c={CONCRETE} />
      <B p={[0, 0, -0.9]} s={[2.4, 0.8, 0.8]} c="#e7d3b8" />
      <B p={[-1.0, 0, 0.3]} s={[0.6, 0.6, 1.4]} c="#e7d3b8" />
      <B p={[1.0, 0, 0.3]} s={[0.6, 0.6, 1.4]} c="#e7d3b8" />
      <Roof p={[0, 0.8, -0.9]} s={[2.5, 0.3, 0.9]} c={p.roof} />
      <Roof p={[-1.0, 0.6, 0.3]} s={[0.7, 0.26, 1.5]} c={p.roof} />
      <Roof p={[1.0, 0.6, 0.3]} s={[0.7, 0.26, 1.5]} c={p.roof} />
      <B p={[0, 0.8, -0.9]} s={[0.4, 0.8, 0.4]} c="#e7d3b8" />
      <Roof p={[0, 1.6, -0.9]} s={[0.5, 0.45, 0.5]} c={p.roof} />
      {windows(9, 2.0, 0.35, -0.499, 0.11)}
      <Tree p={[-0.4, 0, 0.7]} s={1.1} crown="#16a34a" />
      <Tree p={[0.4, 0, 0.9]} s={1.0} crown="#22c55e" />
    </>
  ),
  library: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={CONCRETE} />
      <B p={[0, 0.02, -0.1]} s={[1.6, 0.48, 0.6]} c="#e7e5e4" />
      {Array.from({ length: 6 }, (_, i) => (
        <Cyl key={i} p={[-0.6 + i * 0.24, 0.02, 0.24]} r={0.035} h={0.46} c="#fafaf9" />
      ))}
      <Roof p={[0, 0.5, 0.0]} s={[1.7, 0.18, 0.84]} c={p.roof} />
      <B p={[0, 0.02, 0.201]} s={[0.16, 0.26, 0.02]} c={p.door} />
      <B p={[0, 0, 0.4]} s={[0.5, 0.04, 0.16]} c="#e7e5e4" />
    </>
  ),

  // ---------------- Recreation & community ----------------
  community: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={GRASS} />
      <B p={[-0.25, 0, -0.08]} s={[1.2, 0.44, 0.62]} c={p.wall} />
      <Roof p={[-0.25, 0.44, -0.08]} s={[1.32, 0.26, 0.76]} c={p.roof} />
      <B p={[-0.25, 0, 0.231]} s={[0.3, 0.26, 0.02]} c={WIN} />
      {sign(0.32, 0.25, 0.5, p.accent)}
      <Cyl p={[0.65, 0.02, 0.1]} r={0.22} h={0.02} c="#e7e5e4" />
      {[0.5, 0.8].map((x) => (
        <B key={x} p={[x, 0.02, 0.38]} s={[0.2, 0.06, 0.06]} c="#92400e" />
      ))}
    </>
  ),
  pool: () => (
    <>
      <B p={[0, 0, 0]} s={[0.92, 0.03, 0.92]} c="#e0f2fe" />
      <B p={[0, 0.03, -0.02]} s={[0.72, 0.012, 0.6]} c="#38bdf8" />
      {[-0.2, 0, 0.2].map((x) => (
        <B key={x} p={[x, 0.043, -0.02]} s={[0.012, 0.004, 0.56]} c="#f8fafc" />
      ))}
      <B p={[0.32, 0.03, -0.36]} s={[0.04, 0.2, 0.04]} c="#94a3b8" />
      <B p={[0.32, 0.23, -0.27]} s={[0.06, 0.02, 0.2]} c="#f8fafc" />
      {[-0.3, 0.3].map((x) => (
        <B key={x} p={[x, 0.03, 0.38]} s={[0.16, 0.03, 0.08]} c="#fb923c" />
      ))}
    </>
  ),
  gym: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={CONCRETE} />
      <B p={[0, 0, -0.08]} s={[1.6, 0.55, 0.62]} c={p.trim} />
      <B p={[0, 0.55, -0.08]} s={[1.66, 0.05, 0.68]} c={DARK} />
      <B p={[0, 0, 0.231]} s={[1.2, 0.38, 0.02]} c={p.glass} metal />
      <B p={[0, 0.42, 0.25]} s={[0.6, 0.1, 0.03]} c={p.accent} />
      <B p={[-0.12, 0.45, 0.27]} s={[0.04, 0.04, 0.02]} c={DARK} />
      <B p={[0.12, 0.45, 0.27]} s={[0.04, 0.04, 0.02]} c={DARK} />
    </>
  ),
  museum: (p) => (
    <>
      <B p={[0, 0, 0]} s={[2.9, 0.02, 0.96]} c={CONCRETE} />
      <B p={[0, 0.02, -0.08]} s={[2.6, 0.06, 0.7]} c="#e7e5e4" />
      <B p={[0, 0.08, -0.12]} s={[2.4, 0.5, 0.56]} c="#f5f5f4" />
      {Array.from({ length: 10 }, (_, i) => (
        <Cyl key={i} p={[-1.08 + i * 0.24, 0.08, 0.2]} r={0.03} h={0.48} c="#fafaf9" />
      ))}
      <Roof p={[0, 0.58, 0.0]} s={[2.6, 0.2, 0.8]} c="#e7e5e4" />
      <B p={[0, 0.08, 0.161]} s={[0.2, 0.3, 0.02]} c={p.door} />
      <B p={[-0.9, 0.02, 0.38]} s={[0.4, 0.06, 0.06]} c={p.accent} />
      <B p={[0.9, 0.02, 0.38]} s={[0.4, 0.06, 0.06]} c={p.accent} />
    </>
  ),
  golf: (p) => (
    <>
      <B p={[0, 0, 0]} s={[3.94, 0.02, 2.94]} c="#65a30d" />
      <B p={[-0.6, 0.02, -0.4]} s={[2.0, 0.008, 0.5]} c="#86efac" />
      <B p={[0.8, 0.02, 0.4]} s={[1.6, 0.008, 0.45]} c="#86efac" />
      <Cyl p={[1.4, 0.02, -0.6]} r={0.3} h={0.012} c="#bbf7d0" />
      <Cyl p={[-1.3, 0.02, 0.6]} r={0.28} h={0.012} c="#bbf7d0" />
      <Cyl p={[0.2, 0.02, -0.9]} r={0.22} h={0.01} c="#fde68a" />
      <Cyl p={[-0.3, 0.02, 0.9]} r={0.28} h={0.01} c="#38bdf8" />
      <Cyl p={[1.4, 0.02, -0.6]} r={0.008} h={0.3} c="#f8fafc" />
      <B p={[1.44, 0.26, -0.6]} s={[0.08, 0.05, 0.005]} c="#ef4444" />
      <Cyl p={[-1.3, 0.02, 0.6]} r={0.008} h={0.3} c="#f8fafc" />
      <B p={[-1.26, 0.26, 0.6]} s={[0.08, 0.05, 0.005]} c="#ef4444" />
      <B p={[1.5, 0.02, 1.15]} s={[0.6, 0.32, 0.4]} c={p.wall} />
      <Roof p={[1.5, 0.34, 1.15]} s={[0.72, 0.2, 0.52]} c={p.roof} />
      {[[-1.7, -1.2], [-1.6, 1.2], [0.6, -1.25], [1.8, 0.1], [-0.6, 0.2], [0.1, 1.2]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={1} pine={i % 2 === 0} crown="#15803d" />
      ))}
    </>
  ),
  stadium: (p) => (
    <>
      {/* Plaza around the stadium. */}
      <B p={[0, 0, 0]} s={[3.94, 0.02, 3.94]} c={CONCRETE} />
      {/* Football field running along x: mowed stripes, white yard lines, end zones in the team color, goal posts. */}
      <B p={[0, 0.02, 0]} s={[2.5, 0.01, 1.3]} c="#15803d" />
      {Array.from({ length: 10 }, (_, i) => (
        <B key={`s${i}`} p={[-0.9 + i * 0.2, 0.031, 0]} s={[0.1, 0.002, 1.2]} c="#16a34a" />
      ))}
      <B p={[-1.1, 0.032, 0]} s={[0.2, 0.003, 1.2]} c={p.accent} />
      <B p={[1.1, 0.032, 0]} s={[0.2, 0.003, 1.2]} c={p.accent} />
      {Array.from({ length: 11 }, (_, i) => (
        <B key={`y${i}`} p={[-1 + i * 0.2, 0.034, 0]} s={[0.012, 0.002, 1.2]} c="#f8fafc" />
      ))}
      <B p={[0, 0.034, 0.6]} s={[2.4, 0.002, 0.012]} c="#f8fafc" />
      <B p={[0, 0.034, -0.6]} s={[2.4, 0.002, 0.012]} c="#f8fafc" />
      {[-1.22, 1.22].map((x) => (
        <group key={x}>
          <B p={[x, 0.02, 0]} s={[0.02, 0.22, 0.02]} c="#facc15" />
          <B p={[x, 0.22, 0]} s={[0.02, 0.02, 0.3]} c="#facc15" />
          <B p={[x, 0.22, -0.15]} s={[0.015, 0.25, 0.015]} c="#facc15" />
          <B p={[x, 0.22, 0.15]} s={[0.015, 0.25, 0.015]} c="#facc15" />
        </group>
      ))}
      {/* Stands on both long sides: three tiers rising away from the field, with the team color on top. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2].map((tier) => (
            <B
              key={tier}
              p={[0, 0, side * (0.82 + tier * 0.22)]}
              s={[2.9, 0.16 + tier * 0.16, 0.24]}
              c={tier % 2 === 0 ? "#cbd5e1" : "#94a3b8"}
            />
          ))}
          <B p={[0, 0.48, side * 1.26]} s={[2.95, 0.06, 0.26]} c={p.accent} />
          {/* Rows of seats (colored strips on each tier). */}
          {[0, 1, 2].map((tier) => (
            <B key={`r${tier}`} p={[0, 0.16 + tier * 0.16, side * (0.74 + tier * 0.22)]} s={[2.86, 0.012, 0.05]} c={p.trim} />
          ))}
        </group>
      ))}
      {/* Smaller stands behind the end zones. */}
      {[-1, 1].map((side) => (
        <B key={`e${side}`} p={[side * 1.6, 0, 0]} s={[0.4, 0.22, 1.4]} c="#cbd5e1" />
      ))}
      {/* Scoreboard over one end, light towers at the corners. */}
      <B p={[1.75, 0, 0]} s={[0.06, 0.7, 0.06]} c="#475569" />
      <B p={[1.75, 0.7, 0]} s={[0.08, 0.3, 0.7]} c="#111827" />
      <B p={[1.7, 0.78, 0]} s={[0.01, 0.16, 0.56]} c="#f59e0b" />
      {[[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]].map(([x, z], i) => (
        <group key={i}>
          <Cyl p={[x, 0, z]} r={0.035} h={1.5} c="#e5e7eb" />
          <B p={[x, 1.5, z]} s={[0.28, 0.14, 0.08]} c="#fef9c3" />
        </group>
      ))}
    </>
  ),
  zoo: (p) => (
    <>
      <B p={[0, 0, 0]} s={[3.94, 0.02, 3.94]} c="#a3e635" />
      <B p={[0, 0.02, 0]} s={[0.3, 0.01, 3.6]} c="#d6d3d1" />
      <B p={[0, 0.02, 0]} s={[3.6, 0.01, 0.3]} c="#d6d3d1" />
      {/* Four enclosures: savanna, pond, forest, rocks. */}
      <B p={[-1.0, 0.02, -1.0]} s={[1.4, 0.01, 1.4]} c="#fcd34d" />
      <Cyl p={[1.0, 0.02, -1.0]} r={0.55} h={0.012} c="#38bdf8" />
      <B p={[-1.0, 0.02, 1.0]} s={[1.4, 0.01, 1.4]} c="#4d7c0f" />
      <B p={[1.0, 0.02, 1.0]} s={[1.4, 0.01, 1.4]} c="#a8a29e" />
      <B p={[-1.1, 0.03, -1.0]} s={[0.12, 0.3, 0.12]} c="#eab308" />
      <B p={[-1.1, 0.33, -0.94]} s={[0.08, 0.08, 0.14]} c="#eab308" />
      <B p={[-0.7, 0.03, -1.2]} s={[0.28, 0.14, 0.14]} c="#78716c" />
      <B p={[1.0, 0.03, 1.0]} s={[0.5, 0.3, 0.4]} c="#78716c" />
      <Tree p={[-1.2, 0, 1.2]} s={1.1} crown="#15803d" />
      <Tree p={[-0.8, 0, 0.8]} s={0.9} crown="#16a34a" />
      <Tree p={[-1.4, 0, 0.6]} s={1.0} pine />
      {[-1.9, 1.9].map((x) => (
        <B key={x} p={[x, 0.02, 0]} s={[0.04, 0.12, 3.8]} c="#92400e" />
      ))}
      <B p={[0, 0.02, 1.85]} s={[0.8, 0.4, 0.2]} c={p.wall} />
      <B p={[0, 0.42, 1.85]} s={[0.9, 0.06, 0.26]} c={p.roof} />
    </>
  ),

  // ---------------- Transportation ----------------
  gas_station: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.94, 0.02, 0.94]} c={CONCRETE} />
      <B p={[0, 0.4, 0.12]} s={[0.8, 0.05, 0.5]} c={p.accent} />
      {[-0.32, 0.32].map((x) => (
        <B key={x} p={[x, 0.02, 0.12]} s={[0.04, 0.38, 0.04]} c="#e5e7eb" />
      ))}
      {[-0.16, 0.16].map((x) => (
        <B key={x} p={[x, 0.02, 0.12]} s={[0.08, 0.16, 0.06]} c="#f8fafc" />
      ))}
      <B p={[0, 0, -0.32]} s={[0.6, 0.3, 0.24]} c={p.wall} />
      <B p={[0, 0, -0.199]} s={[0.4, 0.2, 0.02]} c={WIN} />
      <Cyl p={[0.38, 0.02, 0.4]} r={0.012} h={0.5} c="#e5e7eb" />
      <B p={[0.38, 0.5, 0.4]} s={[0.14, 0.12, 0.03]} c={p.accent} />
    </>
  ),
  bus_station: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.94, 0.02, 0.94]} c={ASPHALT} />
      <B p={[0, 0, -0.3]} s={[0.8, 0.3, 0.26]} c={p.wall} />
      <B p={[0, 0.34, -0.1]} s={[0.84, 0.04, 0.56]} c={p.roof} />
      {[-0.38, 0.38].map((x) => (
        <B key={x} p={[x, 0, 0.12]} s={[0.03, 0.34, 0.03]} c="#94a3b8" />
      ))}
      <B p={[0, 0.02, 0.32]} s={[0.66, 0.2, 0.2]} c="#facc15" />
      <B p={[0, 0.14, 0.43]} s={[0.56, 0.06, 0.02]} c={DARK} />
    </>
  ),
  parking: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.02, 0.96]} c={CONCRETE} />
      {[0, 0.24, 0.48].map((y) => (
        <group key={y}>
          <B p={[0, y, -0.05]} s={[1.7, 0.05, 0.8]} c="#9ca3af" />
          {y > 0 && [-0.8, 0, 0.8].map((x) => <B key={x} p={[x, y - 0.19, -0.05]} s={[0.06, 0.19, 0.06]} c="#6b7280" />)}
        </group>
      ))}
      <B p={[0, 0.53, -0.05]} s={[1.7, 0.03, 0.8]} c={p.roof} />
      {[-0.6, -0.2, 0.3, 0.65].map((x, i) => (
        <B key={x} p={[x, 0.05 + (i % 2) * 0.24, 0.1]} s={[0.16, 0.06, 0.26]} c={pick(PALETTE.accents, i + 3, 2)} />
      ))}
      <B p={[0.8, 0.3, 0.36]} s={[0.12, 0.12, 0.02]} c="#2563eb" />
    </>
  ),
  // Drawn for 3x3 and stretched to its 4x4 lot.
  airport: (p) => (
    <group scale={[4 / 3, 1, 4 / 3]}>
      <B p={[0, 0, 0]} s={[2.94, 0.02, 2.94]} c="#86efac" />
      <B p={[0, 0.02, -0.75]} s={[2.9, 0.01, 0.55]} c="#374151" />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} p={[-1.25 + i * 0.36, 0.031, -0.75]} s={[0.18, 0.004, 0.03]} c="#f8fafc" />
      ))}
      <B p={[-0.3, 0, 0.55]} s={[1.9, 0.5, 0.7]} c="#e2e8f0" />
      <B p={[-0.3, 0, 0.911]} s={[1.6, 0.36, 0.02]} c={p.glass} metal />
      <B p={[-0.3, 0.5, 0.55]} s={[2.0, 0.04, 0.8]} c={p.roof} />
      <B p={[1.1, 0, 0.5]} s={[0.24, 1.1, 0.24]} c="#e2e8f0" />
      <B p={[1.1, 1.1, 0.5]} s={[0.4, 0.2, 0.4]} c={p.glass} metal />
      {/* A parked plane. */}
      <group position={[0.2, 0.03, -0.1]}>
        <B p={[0, 0.06, 0]} s={[0.12, 0.12, 0.7]} c="#f8fafc" />
        <B p={[0, 0.1, 0.05]} s={[0.8, 0.02, 0.18]} c="#f8fafc" />
        <B p={[0, 0.12, -0.3]} s={[0.28, 0.02, 0.1]} c="#f8fafc" />
        <B p={[0, 0.16, -0.32]} s={[0.02, 0.14, 0.1]} c={p.accent} />
      </group>
    </group>
  ),

  // ---------------- Landmarks ----------------
  monument: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.9, 0.03, 1.9]} c="#e7e5e4" />
      <Cyl p={[0, 0.03, 0]} r={0.6} h={0.04} c="#d6d3d1" />
      <B p={[0, 0.07, 0]} s={[0.5, 0.3, 0.5]} c="#a8a29e" />
      <B p={[0, 0.37, 0]} s={[0.24, 0.9, 0.24]} c="#5eead4" />
      <B p={[0, 1.27, 0]} s={[0.14, 0.2, 0.14]} c="#5eead4" />
      <B p={[0.14, 1.1, 0]} s={[0.05, 0.42, 0.05]} c="#5eead4" />
      <B p={[0.14, 1.52, 0]} s={[0.1, 0.1, 0.1]} c="#fde047" />
      {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.9} crown={p.trim === "#fde68a" ? "#22c55e" : "#16a34a"} />
      ))}
    </>
  ),
};

/** Catalog models by building id (each gets its seeded palette). */
export const CATALOG_MODELS: Record<string, (seed: number) => ReactNode> = Object.fromEntries(
  Object.entries(MODELS).map(([id, make]) => [id, (seed: number) => make(palFor(seed), seed)]),
);

/** Rough top height of each catalog model, for markers floating above it. */
export const CATALOG_HEIGHT: Record<string, number> = {
  small_cottage: 0.6, suburban: 0.7, duplex: 0.85, luxury: 0.7, highrise: 3.6,
  grocery: 0.55, restaurant: 0.5, clothing: 0.55, bank: 0.7, cinema: 1.0, hotel: 2.3, mall: 1.1,
  small_factory: 0.8, warehouse: 0.6, distribution: 0.8,
  police: 0.55, hospital: 1.6, city_hall: 1.9,
  school: 0.7, high_school: 0.7, university: 2.0, library: 0.7,
  community: 0.75, pool: 0.3, gym: 0.6, museum: 0.8, golf: 0.6, stadium: 1.8, zoo: 0.6,
  gas_station: 0.6, bus_station: 0.45, parking: 0.6, airport: 1.3, monument: 1.6,
};

