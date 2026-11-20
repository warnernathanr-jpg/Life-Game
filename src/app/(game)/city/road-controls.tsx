"use client";

// Stop signs and traffic lights on crossings. Stop signs stand on the corners; traffic lights hang on two corner poles,
// one head for traffic along x and one for traffic along y, changing with the game clock (lightFor in traffic.tsx).
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { RoadControlKind } from "@/lib/database.types";
import { gameClock, lightFor } from "./traffic";
import { mat } from "./models";

const POLE = new THREE.CylinderGeometry(0.01, 0.012, 1, 6);
const OCTAGON = new THREE.CylinderGeometry(0.07, 0.07, 0.01, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const LAMP = new THREE.SphereGeometry(1, 8, 6);
const COLORS = { green: "#22c55e", yellow: "#facc15", red: "#ef4444", off: "#1f2937" };

function StopSign({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={POLE} material={mat("#9ca3af")} position={[0, 0.16, 0]} scale={[1.3, 0.32, 1.3]} castShadow />
      <mesh geometry={OCTAGON} material={mat("#dc2626")} position={[0, 0.34, 0.01]} castShadow />
      <mesh geometry={BOX} material={mat("#f8fafc")} position={[0, 0.34, 0.016]} scale={[0.08, 0.018, 0.002]} />
    </group>
  );
}

/** One signal head: three lamps (red, yellow, green), lit by `state`. */
function Head({ x, z, rot, materials }: { x: number; z: number; rot: number; materials: THREE.MeshStandardMaterial[] }) {
  return (
    <group position={[x, 0, z]} rotation-y={rot} scale={1.5}>
      <mesh geometry={POLE} material={mat("#374151")} position={[0, 0.17, 0]} scale={[1.2, 0.34, 1.2]} castShadow />
      <mesh geometry={BOX} material={mat("#111827")} position={[0, 0.33, 0]} scale={[0.045, 0.12, 0.035]} castShadow />
      {materials.map((m, i) => (
        <mesh key={i} geometry={LAMP} material={m} position={[0, 0.367 - i * 0.037, 0.019]} scale={0.012} />
      ))}
    </group>
  );
}

function lampMaterials() {
  return (["red", "yellow", "green"] as const).map(
    () => new THREE.MeshStandardMaterial({ color: COLORS.off, emissive: new THREE.Color("#000000"), roughness: 0.4 }),
  );
}

// Shared lamp materials: every light in the city runs on the same cycle.
const X_LAMPS = lampMaterials();
const Y_LAMPS = lampMaterials();

export function RoadControls({ controls }: { controls: Map<string, RoadControlKind> }) {
  const list = useMemo(
    () => [...controls].map(([k, kind]) => ({ x: Number(k.split(",")[0]), y: Number(k.split(",")[1]), kind })),
    [controls],
  );
  const xLamps = X_LAMPS;
  const yLamps = Y_LAMPS;
  const last = useRef("");
  useFrame(() => {
    const t = gameClock();
    const sx = lightFor("x", t);
    const sy = lightFor("y", t);
    if (`${sx}${sy}` === last.current) return;
    last.current = `${sx}${sy}`;
    for (const [lamps, state] of [[xLamps, sx], [yLamps, sy]] as const) {
      (["red", "yellow", "green"] as const).forEach((c, i) => {
        const on = c === state;
        lamps[i].color.set(on ? COLORS[c] : COLORS.off);
        lamps[i].emissive.set(on ? COLORS[c] : "#000000");
        lamps[i].emissiveIntensity = on ? 1.4 : 0;
      });
    }
  });

  return (
    <>
      {list.map((c) => {
        const cx = c.x + 0.5;
        const cz = c.y + 0.5;
        const o = 0.44;
        return c.kind === "stop" ? (
          <group key={`${c.x},${c.y}`}>
            {/* One sign per corner, each facing the traffic coming toward it on the right-hand side. */}
            <StopSign x={cx + o} z={cz + o} rot={0} />
            <StopSign x={cx - o} z={cz - o} rot={Math.PI} />
            <StopSign x={cx - o} z={cz + o} rot={-Math.PI / 2} />
            <StopSign x={cx + o} z={cz - o} rot={Math.PI / 2} />
          </group>
        ) : (
          <group key={`${c.x},${c.y}`}>
            {/* Heads for traffic along x face east/west; heads for traffic along y face north/south. */}
            <Head x={cx + o} z={cz + o} rot={0} materials={yLamps} />
            <Head x={cx - o} z={cz - o} rot={Math.PI} materials={yLamps} />
            <Head x={cx - o} z={cz + o} rot={-Math.PI / 2} materials={xLamps} />
            <Head x={cx + o} z={cz - o} rot={Math.PI / 2} materials={xLamps} />
          </group>
        );
      })}
    </>
  );
}
