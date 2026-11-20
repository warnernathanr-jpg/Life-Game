"use client";

// Models for the full building catalog. Each is centred on its footprint at y = 0, w tiles wide along x and d deep
// along z, with its front (doors, signs) facing +z. Colors come from one small palette per building (picked by its
// seed), so the same building always looks the same. Nothing here runs at import time (models.tsx imports this file).
import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { B, BOX, Cyl, PALETTE, PYRAMID, Roof, Tree, colorsFor, mat, pick } from "./models";

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

/** The amusement park's arched entrance on the road side, with a sign. */
function ParkGate({ c, accent }: { c: string; accent: string }) {
  return (
    <group position={[0, 0.02, 1.82]}>
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <B p={[x, 0, 0]} s={[0.1, 0.5, 0.1]} c="#f8fafc" />
          <mesh position={[x, 0.56, 0]} castShadow>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color={accent} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.5, 0]} castShadow>
        <torusGeometry args={[0.42, 0.04, 6, 24, Math.PI]} />
        <meshStandardMaterial color={c} />
      </mesh>
      <B p={[0, 0.72, 0.03]} s={[0.5, 0.12, 0.03]} c="#facc15" />
      <B p={[0, 0.755, 0.047]} s={[0.36, 0.04, 0.005]} c={c} />
    </group>
  );
}

/** The coaster track's shape (the train in park-rides.tsx follows the same curve). */
export function coasterCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    [
      [0.35, 0.28, 0.35], [0.9, 0.3, 0.55], [1.55, 0.4, 0.35], [1.75, 0.95, -0.25], [1.55, 1.15, -0.85],
      [1.05, 0.45, -1.5], [0.55, 0.75, -1.65], [0.25, 0.95, -1.15], [0.45, 0.45, -0.55], [0.25, 0.32, -0.05],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    "catmullrom",
    0.5,
  );
}

/** A roller coaster track: one continuous red tube over two hills on white supports, with a station. */
function Coaster() {
  const { tube, posts } = useMemo(() => {
    const curve = coasterCurve();
    const tube = new THREE.TubeGeometry(curve, 160, 0.028, 6, true);
    const posts = Array.from({ length: 26 }, (_, i) => curve.getPointAt(i / 26));
    return { tube, posts };
  }, []);
  return (
    <group>
      <mesh geometry={tube} castShadow>
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      {posts.map((pt, i) => (
        <mesh key={i} position={[pt.x, (pt.y + 0.02) / 2, pt.z]} scale={[0.018, pt.y - 0.02, 0.018]} castShadow>
          <boxGeometry />
          <meshStandardMaterial color="#f1f5f9" />
        </mesh>
      ))}
      {/* Station platform where the ride starts. */}
      <B p={[0.75, 0.02, 0.62]} s={[0.6, 0.18, 0.22]} c="#f8fafc" />
      <B p={[0.75, 0.2, 0.62]} s={[0.66, 0.04, 0.28]} c="#dc2626" />
    </group>
  );
}

/** A carousel: white platform, poles with horses, a striped cone roof with a scalloped trim and a gold top. */
function Carousel({ roof, trim }: { roof: string; trim: string }) {
  return (
    <group position={[-1.05, 0.02, 0.95]}>
      <Cyl p={[0, 0, 0]} r={0.46} h={0.04} c="#facc15" />
      <Cyl p={[0, 0.04, 0]} r={0.44} h={0.03} c="#f8fafc" />
      <Cyl p={[0, 0.07, 0]} r={0.08} h={0.34} c={trim} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * 0.32;
        const z = Math.sin(a) * 0.32;
        return (
          <group key={i} position={[x, 0.07, z]} rotation-y={-a}>
            <Cyl p={[0, 0, 0]} r={0.008} h={0.34} c="#fde68a" />
            <B p={[0, 0.1 + (i % 2) * 0.05, 0]} s={[0.04, 0.06, 0.12]} c={i % 2 ? "#f8fafc" : "#a16207"} />
            <B p={[0, 0.15 + (i % 2) * 0.05, 0.05]} s={[0.035, 0.06, 0.03]} c={i % 2 ? "#f8fafc" : "#a16207"} />
          </group>
        );
      })}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[0, 0.53, 0]} rotation-y={(i / 12) * Math.PI * 2} castShadow>
          <coneGeometry args={[0.52, 0.24, 2, 1, true, 0, Math.PI / 6]} />
          <meshStandardMaterial color={i % 2 ? "#f8fafc" : roof} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0.41, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.5, 0.025, 6, 24]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
    </group>
  );
}

/** A little snack stand with a striped awning and a counter. */
function SnackStand({ position, stripe }: { position: [number, number, number]; stripe: string }) {
  return (
    <group position={position}>
      <B p={[0, 0, 0]} s={[0.36, 0.26, 0.26]} c="#f8fafc" />
      <B p={[0, 0.1, 0.131]} s={[0.28, 0.08, 0.01]} c="#1e293b" />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-0.15 + i * 0.06, 0.29, 0.17]} rotation-x={0.45} castShadow>
          <boxGeometry args={[0.06, 0.01, 0.16]} />
          <meshStandardMaterial color={i % 2 ? "#f8fafc" : stripe} />
        </mesh>
      ))}
      <B p={[0, 0.26, -0.02]} s={[0.38, 0.03, 0.28]} c={stripe} />
      <Cyl p={[0.24, 0, 0.16]} r={0.05} h={0.12} c="#f87171" />
    </group>
  );
}

/** One color set per building. */
export type Pal = { wall: string; roof: string; trim: string; accent: string; glass: string; door: string; siding: string; awning: string };

export function palFor(seed: number): Pal {
  const c = colorsFor(seed);
  return {
    wall: c.wall, roof: c.roof, trim: c.facade, accent: c.accent, glass: c.glass, siding: c.siding, awning: c.awning,
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

/** A row of windows on a side wall (facing ±x): n windows spread over `length` along z, centred on zc. */
function sideWindows(n: number, length: number, y: number, x: number, zc = 0, size = 0.1, color = WIN): ReactNode[] {
  return Array.from({ length: n }, (_, i) => {
    const z = zc + (n === 1 ? 0 : -length / 2 + (length * i) / (n - 1));
    return <B key={`s${x}-${y}-${i}`} p={[x, y, z]} s={[0.02, size, size]} c={color} />;
  });
}

/** Windows on the front and back walls, skipping the middle (for a door). */
function windowsAround(n: number, width: number, y: number, z: number, size = 0.1, color = WIN, gap = 0.2): ReactNode[] {
  return windows(n, width, y, z, size, color).filter((_, i) => Math.abs(n === 1 ? 0 : -width / 2 + (width * i) / (n - 1)) > gap);
}

/**
 * A clock face on each side of a square tower: dark rim, white dial, four hour marks and hands at ten past ten.
 * y = height of the clock's centre, half = half the tower's width, r = the dial's radius (rim included).
 */
function clockFaces(y: number, half: number, r: number, pin = "#b45309"): ReactNode {
  const k = r / 0.15;
  return [0, 1, 2, 3].map((i) => (
    <group key={`clock${i}`} rotation-y={(i * Math.PI) / 2}>
      <group position={[0, y, half]} rotation-x={Math.PI / 2}>
        <Cyl p={[0, 0, 0]} r={r} h={0.012} c="#1f2937" />
        <Cyl p={[0, 0.012, 0]} r={0.13 * k} h={0.01} c="#f8fafc" />
      </group>
      {[0, 1, 2, 3].map((m) => (
        <group key={m} position={[0, y, half + 0.023]} rotation-z={(m * Math.PI) / 2}>
          <B p={[0, 0.095 * k, 0]} s={[0.014 * k, 0.03 * k, 0.004]} c="#1f2937" />
        </group>
      ))}
      <group position={[0, y, half + 0.026]} rotation-z={Math.PI / 3}>
        <B p={[0, 0, 0]} s={[0.016 * k, 0.07 * k, 0.004]} c="#111827" />
      </group>
      <group position={[0, y, half + 0.029]} rotation-z={-Math.PI / 3}>
        <B p={[0, 0, 0]} s={[0.011 * k, 0.105 * k, 0.004]} c="#111827" />
      </group>
      <Cyl p={[0, y, half + 0.03]} r={0.012 * k} h={0.004} c={pin} />
    </group>
  ));
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
      {/* Garage driveway over the lawn, out to the road. */}
      <B p={[0.3, 0.02, 0.335]} s={[0.22, 0.008, 0.33]} c={CONCRETE} />
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
      {/* Two-storey main house toward the front, with a garage wing; the back yard has the pool. */}
      <B p={[-0.25, 0, 0]} s={[1.0, 0.55, 0.7]} c={p.wall} />
      <B p={[0.5, 0, -0.05]} s={[0.5, 0.36, 0.6]} c={p.trim} />
      <B p={[-0.25, 0.55, 0]} s={[1.06, 0.05, 0.76]} c={p.roof} />
      <B p={[0.5, 0.36, -0.05]} s={[0.56, 0.05, 0.66]} c={p.roof} />
      {/* Front: door with a little porch roof, windows on both floors, garage door. */}
      <B p={[-0.45, 0, 0.351]} s={[0.14, 0.27, 0.02]} c={p.door} />
      <B p={[-0.45, 0.29, 0.39]} s={[0.24, 0.025, 0.1]} c={p.roof} />
      {[-0.65, -0.2, 0.05].map((x) => (
        <B key={`g${x}`} p={[x, 0.1, 0.351]} s={[0.16, 0.14, 0.02]} c={WIN} />
      ))}
      {[-0.65, -0.45, -0.2, 0.05].map((x) => (
        <B key={`u${x}`} p={[x, 0.36, 0.351]} s={[0.14, 0.12, 0.02]} c={WIN} />
      ))}
      <B p={[0.5, 0, 0.251]} s={[0.36, 0.26, 0.02]} c="#e5e7eb" />
      {/* Side and back windows. */}
      {[-0.15, 0.15].map((z) => (
        <B key={`s${z}`} p={[-0.751, 0.32, z]} s={[0.02, 0.12, 0.14]} c={WIN} />
      ))}
      {[-0.55, -0.25, 0.05].map((x) => (
        <B key={`b${x}`} p={[x, 0.32, -0.351]} s={[0.14, 0.12, 0.02]} c={WIN} />
      ))}
      <B p={[-0.25, 0, -0.38]} s={[0.3, 0.012, 0.06]} c="#d6d3d1" />
      {/* Back yard: pool with a paved surround and two loungers. */}
      <B p={[0.3, 0.02, -0.72]} s={[0.86, 0.012, 0.42]} c="#e7e5e4" />
      <B p={[0.3, 0.03, -0.72]} s={[0.66, 0.01, 0.28]} c="#38bdf8" />
      {[0.82, 0.92].map((x) => (
        <B key={`l${x}`} p={[x - 0.1, 0.032, -0.72]} s={[0.06, 0.02, 0.18]} c="#f8fafc" />
      ))}
      <Tree p={[-0.75, 0, -0.72]} s={1.0} crown="#16a34a" />
      <Tree p={[-0.4, 0, -0.82]} s={0.8} crown="#22c55e" />
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
      {/* A beam across the column tops with the gold sign on it, and the roof centred over the hall (back at -0.33) and the
          columns (front at about 0.26). */}
      <B p={[0, 0.44, 0.13]} s={[0.7, 0.08, 0.27]} c="#e7e5e4" />
      <B p={[0, 0.455, 0.267]} s={[0.24, 0.05, 0.01]} c="#ca8a04" />
      <Roof p={[0, 0.52, -0.04]} s={[0.8, 0.16, 0.68]} c="#e7e5e4" />
      <B p={[0, 0.06, 0.171]} s={[0.12, 0.24, 0.02]} c={p.door} />
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
      {Array.from({ length: 7 }, (_, row) => (
        <group key={row}>
          {windows(5, 0.9, 0.45 + row * 0.24, 0.201, 0.1, p.glass)}
          {windows(5, 0.9, 0.45 + row * 0.24, -0.701, 0.1, p.glass)}
          {sideWindows(3, 0.6, 0.45 + row * 0.24, 0.601, -0.25, 0.1, p.glass)}
          {sideWindows(3, 0.6, 0.45 + row * 0.24, -0.601, -0.25, 0.1, p.glass)}
        </group>
      ))}
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
      <B p={[-0.05, 0, -0.05]} s={[0.62, 0.36, 0.56]} c={p.siding} />
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
      <B p={[0, 0, -0.08]} s={[1.7, 0.5, 0.66]} c={p.siding} />
      <B p={[0, 0.5, -0.08]} s={[1.76, 0.05, 0.72]} c={p.roof} />
      {[-0.55, 0, 0.55].map((x) => (
        <B key={x} p={[x, 0, 0.261]} s={[0.36, 0.34, 0.02]} c="#a8a29e" />
      ))}
      {/* Crates stacked at the corner, clear of the loading doors. */}
      <B p={[-0.86, 0.02, 0.32]} s={[0.14, 0.12, 0.12]} c="#b45309" />
      <B p={[-0.86, 0.14, 0.32]} s={[0.1, 0.08, 0.1]} c="#92400e" />
    </>
  ),
  distribution: (p) => (
    <>
      <B p={[0, 0, 0]} s={[2.9, 0.02, 2.9]} c={ASPHALT} />
      <B p={[0, 0, -0.45]} s={[2.6, 0.7, 1.7]} c={p.siding} />
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
      {/* Roof over the hall (back at -0.65) and the portico columns (front at about 0.24), centred between them. */}
      <Roof p={[0, 0.72, -0.2]} s={[1.4, 0.22, 1.0]} c={p.roof} />
      <B p={[0, 0.72, -0.25]} s={[0.36, 0.7, 0.36]} c="#f5f5f4" />
      <group position={[0, 0, -0.25]}>{clockFaces(1.17, 0.18, 0.12, p.roof)}</group>
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
      {/* Windows stand just proud of the wall (front face at -0.05); the lower row leaves the middle free for the door. */}
      {windowsAround(7, 1.3, 0.15, -0.042, 0.11, WIN, 0.15)}
      {windows(7, 1.3, 0.4, -0.042, 0.11)}
      <B p={[0, 0, -0.035]} s={[0.2, 0.27, 0.03]} c={p.door} />
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
      {/* Main hall: two rows of windows front and back, a door with steps in the middle of the front. */}
      {[0.18, 0.52].map((y) => (
        <group key={y}>
          {windowsAround(9, 2.0, y, -0.499, 0.11, WIN, 0.2)}
          {windows(9, 2.0, y, -1.301, 0.11)}
          {sideWindows(3, 0.5, y, 1.201, -0.9, 0.11)}
          {sideWindows(3, 0.5, y, -1.201, -0.9, 0.11)}
        </group>
      ))}
      <B p={[0, 0, -0.49]} s={[0.3, 0.42, 0.02]} c={p.door} />
      <B p={[0, 0.42, -0.485]} s={[0.38, 0.05, 0.04]} c={p.trim} />
      <B p={[0, 0.02, -0.42]} s={[0.5, 0.04, 0.14]} c={CONCRETE} />
      {/* Tower windows */}
      {windows(1, 0, 1.15, -0.699, 0.12)}
      {/* Wings: windows on the courtyard side, the outer side and the front, a door at each wing's front. */}
      {[0.16, 0.42].map((y) => (
        <group key={y}>
          {sideWindows(4, 1.1, y, 0.699, 0.35, 0.1)}
          {sideWindows(4, 1.1, y, -0.699, 0.35, 0.1)}
          {sideWindows(4, 1.1, y, 1.301, 0.35, 0.1)}
          {sideWindows(4, 1.1, y, -1.301, 0.35, 0.1)}
          {[-1.0, 1.0].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              {y > 0.3 ? windows(2, 0.3, y, 1.001, 0.1) : null}
            </group>
          ))}
        </group>
      ))}
      {[-1.0, 1.0].map((x) => (
        <B key={x} p={[x, 0, 1.0]} s={[0.16, 0.28, 0.02]} c={p.door} />
      ))}
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
  soccer_field: (p) => (
    <>
      {/* 3x3 pitch: striped grass, white lines, a centre circle, two goals and bleachers along the back. */}
      <B p={[0, 0, 0]} s={[2.94, 0.02, 2.94]} c="#15803d" />
      {Array.from({ length: 7 }, (_, i) => (
        <B key={i} p={[-1.2 + i * 0.4, 0.02, 0.15]} s={[0.2, 0.004, 2.1]} c={i % 2 ? "#16a34a" : "#22c55e"} />
      ))}
      {[
        [0, 1.2, 2.5, 0.03], [0, -0.9, 2.5, 0.03], [-1.25, 0.15, 0.03, 2.1], [1.25, 0.15, 0.03, 2.1], [0, 0.15, 0.03, 2.1],
        [-1.05, 0.15, 0.03, 0.8], [1.05, 0.15, 0.03, 0.8], [-1.15, -0.25, 0.2, 0.03], [-1.15, 0.55, 0.2, 0.03], [1.15, -0.25, 0.2, 0.03], [1.15, 0.55, 0.2, 0.03],
      ].map(([x, z, w, d], i) => (
        <B key={`l${i}`} p={[x, 0.025, z]} s={[w, 0.004, d]} c="#f8fafc" />
      ))}
      <mesh position={[0, 0.03, 0.15]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.24, 0.27, 32]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.3, 0.02, 0.15]}>
          <B p={[0, 0, -0.22]} s={[0.03, 0.18, 0.03]} c="#f8fafc" />
          <B p={[0, 0, 0.22]} s={[0.03, 0.18, 0.03]} c="#f8fafc" />
          <B p={[0, 0.18, 0]} s={[0.03, 0.03, 0.47]} c="#f8fafc" />
          <B p={[side * 0.08, 0, 0]} s={[0.12, 0.17, 0.44]} c="#e2e8f0" />
        </group>
      ))}
      {[0, 1, 2].map((r) => (
        <B key={`s${r}`} p={[0, 0.02 + r * 0.07, -1.18 - r * 0.1]} s={[2.4, 0.07, 0.14]} c={r % 2 ? p.accent : p.trim} />
      ))}
      <B p={[0, 0.02, -1.4]} s={[2.5, 0.28, 0.06]} c={p.wall} />
    </>
  ),
  beach: (p) => (
    <>
      {/* 3x1 beach: a boardwalk on the road side, sand down to wet sand at the water's edge (the back), umbrellas, towels and
          a lifeguard tower. */}
      <B p={[0, 0, 0]} s={[2.96, 0.03, 0.96]} c="#fde68a" />
      <B p={[0, 0.03, -0.38]} s={[2.96, 0.005, 0.2]} c="#e7c873" />
      <B p={[0, 0.03, 0.4]} s={[2.96, 0.03, 0.16]} c="#a16207" />
      {Array.from({ length: 12 }, (_, i) => (
        <B key={`b${i}`} p={[-1.38 + i * 0.25, 0.061, 0.4]} s={[0.012, 0.002, 0.16]} c="#713f12" />
      ))}
      {[-1.0, -0.2, 0.6].map((x, i) => (
        <group key={x} position={[x, 0.03, -0.02]}>
          <Cyl p={[0, 0, 0]} r={0.008} h={0.3} c="#e5e7eb" />
          <mesh position={[0, 0.3, 0]} scale={[0.3, 0.08, 0.3]} castShadow>
            <coneGeometry args={[0.5, 1, 8]} />
            <meshStandardMaterial color={[p.accent, p.awning, p.roof][i]} />
          </mesh>
          <B p={[0.12, 0, 0.06]} s={[0.1, 0.006, 0.2]} c={[p.awning, p.roof, p.accent][i]} />
        </group>
      ))}
      <group position={[1.25, 0.03, -0.05]}>
        {[[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]].map(([x, z], i) => (
          <B key={i} p={[x, 0, z]} s={[0.015, 0.3, 0.015]} c="#f8fafc" />
        ))}
        <B p={[0, 0.3, 0]} s={[0.18, 0.12, 0.18]} c="#dc2626" />
        <B p={[0, 0.42, 0]} s={[0.22, 0.02, 0.22]} c="#f8fafc" />
      </group>
      <Cyl p={[-1.35, 0.03, -0.25]} r={0.05} h={0.02} c="#f472b6" />
    </>
  ),
  amusement_park: (p) => (
    <>
      {/* 4x4 amusement park: a paved plaza, an arched entrance on the road side, the Ferris wheel, a roller
          coaster on white supports, a carousel and a snack stand. */}
      <B p={[0, 0, 0]} s={[3.94, 0.02, 3.94]} c="#86efac" />
      <B p={[-0.2, 0.02, 0.5]} s={[3.2, 0.012, 2.6]} c="#e7dcc8" />
      <B p={[0, 0.02, 1.55]} s={[0.7, 0.012, 0.9]} c="#e7dcc8" />
      <ParkGate c={p.roof} accent={p.accent} />
      {/* The Ferris wheel and the coaster train move (park-rides.tsx). */}
      <Coaster />
      <Carousel roof={p.roof} trim={p.awning} />
      <SnackStand position={[0.95, 0.02, 1.25]} stripe={p.accent} />
      {[[-1.75, -0.2], [-1.75, 0.6], [1.75, 0.9], [-0.2, -1.75]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.85} crown={i % 2 ? "#16a34a" : "#22c55e"} />
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
      {/* The animals walk around (zoo-animals.tsx). */}
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
      {/* Taxi depot: a garage with two bays at the back, a checkered band, two taxis waiting out front and a sign. */}
      <B p={[0, 0, 0]} s={[0.94, 0.02, 0.94]} c={ASPHALT} />
      <B p={[0, 0.02, -0.27]} s={[0.84, 0.36, 0.36]} c={p.wall} />
      <B p={[0, 0.38, -0.27]} s={[0.88, 0.04, 0.4]} c={p.roof} />
      {Array.from({ length: 8 }, (_, i) => (
        <B key={i} p={[-0.385 + i * 0.11, 0.31, -0.088]} s={[0.11, 0.05, 0.01]} c={i % 2 ? "#111827" : "#facc15"} />
      ))}
      {[-0.2, 0.2].map((x) => (
        <B key={x} p={[x, 0.02, -0.088]} s={[0.3, 0.24, 0.01]} c="#9ca3af" />
      ))}
      {[-0.2, 0.2].map((x) => (
        <group key={x} position={[x, 0.02, 0.22]}>
          <B p={[0, 0.03, 0]} s={[0.15, 0.06, 0.26]} c="#facc15" />
          <B p={[0, 0.08, -0.02]} s={[0.12, 0.05, 0.13]} c="#1e293b" />
          <B p={[0, 0.115, -0.02]} s={[0.06, 0.02, 0.03]} c="#f8fafc" />
        </group>
      ))}
      <Cyl p={[0.42, 0.02, 0.42]} r={0.012} h={0.5} c="#e5e7eb" />
      <B p={[0.42, 0.5, 0.42]} s={[0.16, 0.1, 0.03]} c="#facc15" />
      <B p={[0.42, 0.5, 0.437]} s={[0.12, 0.03, 0.005]} c="#111827" />
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
      {/* "P" sign on a post at the entrance corner. */}
      <B p={[0.86, 0.02, 0.42]} s={[0.025, 0.3, 0.025]} c="#6b7280" />
      <B p={[0.86, 0.3, 0.435]} s={[0.14, 0.14, 0.015]} c="#2563eb" />
      <B p={[0.835, 0.32, 0.444]} s={[0.022, 0.1, 0.004]} c="#f8fafc" />
      <B p={[0.865, 0.395, 0.444]} s={[0.05, 0.022, 0.004]} c="#f8fafc" />
      <B p={[0.865, 0.355, 0.444]} s={[0.05, 0.022, 0.004]} c="#f8fafc" />
      <B p={[0.886, 0.355, 0.444]} s={[0.018, 0.062, 0.004]} c="#f8fafc" />
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

  // Milestone landmarks (can't be bought: one each, for reaching a population).
  welcome_arch: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.96, 0.015, 0.96]} c="#d6d3d1" />
      <B p={[-0.32, 0.015, 0]} s={[0.12, 0.62, 0.16]} c="#f5f5f4" />
      <B p={[0.32, 0.015, 0]} s={[0.12, 0.62, 0.16]} c="#f5f5f4" />
      <B p={[0, 0.6, 0]} s={[0.84, 0.14, 0.2]} c={p.accent} />
      <B p={[0, 0.63, 0.101]} s={[0.6, 0.08, 0.01]} c="#fef3c7" />
      <B p={[0, 0.74, 0]} s={[0.9, 0.04, 0.22]} c="#f5f5f4" />
      {[-0.42, 0.42].map((x) => (
        <Tree key={x} p={[x, 0.015, 0.36]} s={0.45} />
      ))}
    </>
  ),
  clock_tower: (p) => (
    <>
      <B p={[0, 0, 0]} s={[0.9, 0.015, 0.9]} c="#d6d3d1" />
      <B p={[0, 0.015, 0]} s={[0.36, 1.2, 0.36]} c="#b45309" />
      <B p={[0, 1.2, 0]} s={[0.42, 0.06, 0.42]} c="#f5f5f4" />
      {/* A clock face on each side: dark rim, white dial, four hour marks and hands at ten past ten. */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * Math.PI) / 2}>
          <group position={[0, 0.98, 0.18]} rotation-x={Math.PI / 2}>
            <Cyl p={[0, 0, 0]} r={0.15} h={0.012} c="#1f2937" />
            <Cyl p={[0, 0.012, 0]} r={0.13} h={0.01} c="#f8fafc" />
          </group>
          {[0, 1, 2, 3].map((m) => (
            <group key={m} position={[0, 0.98, 0.203]} rotation-z={(m * Math.PI) / 2}>
              <B p={[0, 0.095, 0]} s={[0.014, 0.03, 0.004]} c="#1f2937" />
            </group>
          ))}
          <group position={[0, 0.98, 0.206]} rotation-z={Math.PI / 3}>
            <B p={[0, 0, 0]} s={[0.016, 0.07, 0.004]} c="#111827" />
          </group>
          <group position={[0, 0.98, 0.209]} rotation-z={-Math.PI / 3}>
            <B p={[0, 0, 0]} s={[0.011, 0.105, 0.004]} c="#111827" />
          </group>
          <Cyl p={[0, 0.98, 0.21]} r={0.012} h={0.004} c="#b45309" />
        </group>
      ))}
      <B p={[0, 1.26, 0]} s={[0.3, 0.24, 0.3]} c="#b45309" />
      <Roof p={[0, 1.5, 0]} s={[0.42, 0.42, 0.42]} c={p.roof} />
    </>
  ),
  fountain: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.94, 0.02, 1.94]} c="#e7e5e4" />
      <B p={[0, 0.02, 0]} s={[1.6, 0.006, 1.6]} c="#d6d3d1" />
      <Cyl p={[0, 0.02, 0]} r={0.6} h={0.14} c="#cbd5e1" />
      <Cyl p={[0, 0.06, 0]} r={0.55} h={0.12} c="#38bdf8" />
      <Cyl p={[0, 0.02, 0]} r={0.14} h={0.42} c="#e2e8f0" />
      <Cyl p={[0, 0.44, 0]} r={0.26} h={0.05} c="#cbd5e1" />
      <Cyl p={[0, 0.45, 0]} r={0.22} h={0.04} c="#7dd3fc" />
      <Cyl p={[0, 0.49, 0]} r={0.04} h={0.22} c="#bae6fd" />
      {[[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0.02, z]} s={0.6} crown={p.accent === "#dc2626" ? "#16a34a" : "#22c55e"} />
      ))}
      {[[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]].map(([x, z], i) => (
        <B key={`b${i}`} p={[x, 0.02, z]} s={x ? [0.06, 0.04, 0.22] : [0.22, 0.04, 0.06]} c="#92400e" />
      ))}
    </>
  ),
  founders_statue: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.94, 0.02, 1.94]} c="#bbf7d0" />
      <B p={[0, 0.02, 0]} s={[1.3, 0.04, 1.3]} c="#e7e5e4" />
      <B p={[0, 0.06, 0]} s={[0.6, 0.36, 0.6]} c="#a8a29e" />
      <B p={[0, 0.42, 0]} s={[0.66, 0.05, 0.66]} c="#d6d3d1" />
      {/* A golden figure raising a lantern. */}
      <B p={[0, 0.47, 0]} s={[0.22, 0.42, 0.16]} c="#eab308" />
      <B p={[0, 0.89, 0]} s={[0.12, 0.12, 0.12]} c="#eab308" />
      <B p={[0.13, 0.75, 0]} s={[0.05, 0.34, 0.05]} c="#eab308" />
      <B p={[0.13, 1.09, 0]} s={[0.08, 0.08, 0.08]} c="#fde047" />
      {[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z], i) => (
        <Tree key={i} p={[x, 0.02, z]} s={0.55} />
      ))}
      <B p={[0, 0.02, 0.8]} s={[0.24, 0.005, 0.32]} c="#e7e5e4" />
    </>
  ),
  observation_tower: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.94, 0.02, 1.94]} c="#e7e5e4" />
      <Cyl p={[0, 0.02, 0]} r={0.5} h={0.18} c="#cbd5e1" />
      <Cyl p={[0, 0.2, 0]} r={0.12} h={2.6} c="#e2e8f0" />
      <Cyl p={[0, 2.8, 0]} r={0.42} h={0.16} c="#94a3b8" />
      <Cyl p={[0, 2.96, 0]} r={0.38} h={0.18} c={p.glass} />
      <Cyl p={[0, 3.14, 0]} r={0.42} h={0.06} c="#94a3b8" />
      <Cyl p={[0, 3.2, 0]} r={0.03} h={0.6} c="#f8fafc" />
      <B p={[0, 3.78, 0]} s={[0.06, 0.06, 0.06]} c="#ef4444" />
    </>
  ),
  crystal_spire: (p) => (
    <>
      <B p={[0, 0, 0]} s={[1.94, 0.02, 1.94]} c="#e2e8f0" />
      <Cyl p={[0, 0.02, 0]} r={0.8} h={0.05} c="#cbd5e1" />
      <Cyl p={[0, 0.07, 0]} r={0.66} h={0.004} c="#7dd3fc" />
      {/* Four glass fins rising to a point, with a glowing tip. */}
      {[0, 1, 2, 3].map((i) => (
        <group key={i} rotation-y={(i * Math.PI) / 2}>
          <mesh geometry={PYRAMID} material={mat("#7dd3fc", { metal: true })} position={[0.22, 1.3, 0]} scale={[0.28, 2.6, 0.12]} castShadow />
        </group>
      ))}
      <mesh geometry={PYRAMID} material={mat("#bae6fd", { metal: true })} position={[0, 1.7, 0]} scale={[0.36, 3.4, 0.36]} castShadow />
      <B p={[0, 3.36, 0]} s={[0.08, 0.08, 0.08]} c="#fef3c7" />
      {[[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].map(([x, z], i) => (
        <B key={i} p={[x, 0.02, z]} s={[0.12, 0.3, 0.12]} c={p.accent} />
      ))}
    </>
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
  soccer_field: 0.4, beach: 0.5, amusement_park: 1.6,
  welcome_arch: 0.8, clock_tower: 1.95, fountain: 0.75, founders_statue: 1.2, observation_tower: 3.9, crystal_spire: 3.5,
  gas_station: 0.6, bus_station: 0.45, parking: 0.6, airport: 1.3, monument: 1.6,
};

