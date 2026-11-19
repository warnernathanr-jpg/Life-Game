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
export function Tree({ p, s = 1, pine }: { p: V3; s?: number; pine?: boolean }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0, 0]} r={0.04} h={0.18} c="#78350f" />
      {pine ? (
        <mesh geometry={PINE} material={mat("#166534")} position={[0, 0.4, 0]} scale={[0.32, 0.5, 0.32]} castShadow />
      ) : (
        <mesh geometry={CROWN} material={mat("#22c55e")} position={[0, 0.32, 0]} scale={0.34} castShadow />
      )}
    </group>
  );
}

/** Rough top height of each model, for markers floating above it. */
export const MODEL_HEIGHT: Record<string, number> = {
  cottage: 0.75, house: 0.95, apartments: 1.75, corner_shop: 0.5, cafe: 0.5, office: 3.2, workshop: 0.7,
  warehouse: 0.6, factory: 1.5, park: 0.5, clinic: 0.65, school: 0.9, library: 0.7, fire_station: 0.85, community: 0.8,
};

function Model({ typeId }: { typeId: string }) {
  switch (typeId) {
    case "cottage":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.56, 0.36, 0.5]} c="#f5e6c8" />
          <Roof p={[0, 0.36, 0]} s={[0.74, 0.34, 0.66]} c="#c2410c" />
          <B p={[0, 0, 0.251]} s={[0.12, 0.2, 0.02]} c="#7c2d12" />
          <B p={[0.16, 0.14, 0.251]} s={[0.11, 0.1, 0.02]} c="#93c5fd" />
        </>
      );
    case "house":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.7, 0.48, 0.56]} c="#fde7c8" />
          <Roof p={[0, 0.48, 0]} s={[0.9, 0.4, 0.74]} c="#9a3412" />
          <B p={[0.2, 0.5, -0.1]} s={[0.1, 0.38, 0.1]} c="#78716c" />
          <B p={[-0.12, 0, 0.281]} s={[0.13, 0.24, 0.02]} c="#7c2d12" />
          <B p={[0.14, 0.2, 0.281]} s={[0.14, 0.12, 0.02]} c="#93c5fd" />
          <Tree p={[0.36, 0, 0.36]} s={0.7} />
        </>
      );
    case "apartments":
      return (
        <>
          <B p={[0, 0, 0]} s={[1.5, 1.6, 1.3]} c="#e7d3b8" />
          {[0.3, 0.7, 1.1, 1.45].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.52, 0.12, 1.32]} c="#64748b" />
          ))}
          <B p={[0, 1.6, 0]} s={[1.56, 0.08, 1.36]} c="#a8a29e" />
          <B p={[0.4, 1.68, 0.2]} s={[0.3, 0.15, 0.3]} c="#78716c" />
          <B p={[0, 0, 0.66]} s={[0.3, 0.26, 0.04]} c="#1e3a5f" />
        </>
      );
    case "corner_shop":
      return (
        <>
          <B p={[0, 0, -0.04]} s={[0.72, 0.38, 0.6]} c="#e0f2fe" />
          <B p={[0, 0.27, 0.32]} s={[0.76, 0.04, 0.16]} c="#0284c7" />
          <B p={[0, 0.38, -0.04]} s={[0.74, 0.08, 0.62]} c="#0369a1" />
          <B p={[0, 0.02, 0.261]} s={[0.5, 0.2, 0.02]} c="#bae6fd" />
        </>
      );
    case "cafe":
      return (
        <>
          <B p={[0, 0, -0.1]} s={[0.68, 0.36, 0.5]} c="#fef3c7" />
          <B p={[0, 0.27, 0.2]} s={[0.72, 0.04, 0.16]} c="#b45309" />
          <B p={[0, 0.36, -0.1]} s={[0.7, 0.06, 0.52]} c="#92400e" />
          <Cyl p={[-0.2, 0, 0.34]} r={0.07} h={0.12} c="#f8fafc" />
          <Cyl p={[0.2, 0, 0.34]} r={0.07} h={0.12} c="#f8fafc" />
        </>
      );
    case "office":
      return (
        <>
          <B p={[0, 0, 0]} s={[1.6, 0.3, 1.6]} c="#cbd5e1" />
          <B p={[0, 0.3, 0]} s={[1.1, 2.4, 1.1]} c="#38bdf8" metal />
          {[0.8, 1.4, 2.0, 2.6].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.12, 0.05, 1.12]} c="#e2e8f0" />
          ))}
          <B p={[0, 2.7, 0]} s={[0.7, 0.3, 0.7]} c="#0ea5e9" metal />
          <Cyl p={[0, 3.0, 0]} r={0.03} h={0.3} c="#94a3b8" />
        </>
      );
    case "workshop":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.74, 0.34, 0.6]} c="#d6d3d1" />
          <mesh geometry={BOX} material={mat("#57534e")} position={[-0.18, 0.42, 0]} rotation={[0, 0, 0.45]} scale={[0.42, 0.04, 0.62]} castShadow />
          <mesh geometry={BOX} material={mat("#57534e")} position={[0.18, 0.42, 0]} rotation={[0, 0, 0.45]} scale={[0.42, 0.04, 0.62]} castShadow />
          <Cyl p={[0.26, 0.34, -0.18]} r={0.05} h={0.34} c="#78716c" />
          <B p={[0, 0, 0.301]} s={[0.3, 0.22, 0.02]} c="#f59e0b" />
        </>
      );
    case "warehouse":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.86, 0.46, 0.72]} c="#a8a29e" />
          <B p={[0, 0.46, 0]} s={[0.88, 0.06, 0.74]} c="#78716c" />
          <B p={[-0.18, 0, 0.361]} s={[0.26, 0.3, 0.02]} c="#e7e5e4" />
          <B p={[0.18, 0, 0.361]} s={[0.26, 0.3, 0.02]} c="#e7e5e4" />
          <B p={[0.3, 0, -0.2]} s={[0.12, 0.1, 0.12]} c="#b45309" />
        </>
      );
    case "factory":
      return (
        <>
          <B p={[-0.15, 0, 0.1]} s={[1.2, 0.7, 1.1]} c="#a8a29e" />
          <B p={[0.55, 0, -0.3]} s={[0.6, 0.45, 0.6]} c="#78716c" />
          {[-0.45, 0.05].map((x) => (
            <group key={x}>
              <Cyl p={[x, 0.7, -0.25]} r={0.12} h={0.8} c="#57534e" />
              <Cyl p={[x, 1.25, -0.25]} r={0.125} h={0.1} c="#dc2626" />
            </group>
          ))}
          <B p={[-0.15, 0, 0.651]} s={[0.4, 0.35, 0.02]} c="#f59e0b" />
        </>
      );
    case "park":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.92, 0.04, 0.92]} c="#4ade80" />
          <B p={[0, 0.04, 0]} s={[0.92, 0.01, 0.14]} c="#e7e5e4" />
          <Tree p={[-0.26, 0.04, -0.24]} s={1.1} />
          <Tree p={[0.26, 0.04, -0.26]} s={0.9} pine />
          <Tree p={[0.24, 0.04, 0.26]} s={1} />
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
          <B p={[0, 0, 0]} s={[0.8, 0.42, 0.56]} c="#fdba74" />
          <Roof p={[0, 0.42, 0]} s={[0.96, 0.26, 0.72]} c="#7c2d12" />
          {[-0.24, 0, 0.24].map((x) => (
            <B key={x} p={[x, 0.18, 0.281]} s={[0.13, 0.12, 0.02]} c="#bfdbfe" />
          ))}
          <Cyl p={[0.38, 0, 0.38]} r={0.015} h={0.75} c="#e5e7eb" />
          <B p={[0.44, 0.6, 0.38]} s={[0.12, 0.08, 0.01]} c="#2563eb" />
        </>
      );
    case "library":
      return (
        <>
          <B p={[0, 0, -0.06]} s={[0.76, 0.42, 0.56]} c="#e7e5e4" />
          <B p={[0, 0, 0.26]} s={[0.76, 0.04, 0.16]} c="#d6d3d1" />
          {[-0.27, -0.09, 0.09, 0.27].map((x) => (
            <Cyl key={x} p={[x, 0.04, 0.28]} r={0.03} h={0.38} c="#fafaf9" />
          ))}
          <B p={[0, 0.42, 0.03]} s={[0.82, 0.05, 0.74]} c="#a8a29e" />
          <Roof p={[0, 0.47, 0.03]} s={[0.84, 0.18, 0.76]} c="#57534e" />
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
          <mesh geometry={TENT} material={mat("#a855f7")} position={[0, 0.38, 0]} scale={[0.78, 0.7, 0.78]} castShadow />
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
