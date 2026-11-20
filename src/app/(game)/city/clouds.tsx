"use client";

// Soft low-poly clouds in the distant sky around the world, slowly circling it. Seeded, so they start in the same places every visit. They move whenever the city is animating.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const PUFF = new THREE.IcosahedronGeometry(1, 1);
const CLOUD_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#e2e8f0", emissiveIntensity: 0.35, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
const SPEED = 0.012; // radians per second (one lap in about 9 minutes)

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Clouds in the distant sky, in a ring around the world (`from`..`to` is its extent), slowly circling. */
export function Clouds({ from, to, moving }: { from: number; to: number; moving: () => boolean }) {
  const { invalidate } = useThree();
  const half = (to - from) / 2;
  const centre = from + half;
  const clouds = useMemo(() => {
    const r = rng(20261128);
    return Array.from({ length: 30 }, (_, i) => {
      const puffs = Array.from({ length: 4 + Math.floor(r() * 4) }, (_, k) => ({
        x: (k - 2) * (0.9 + r() * 0.5),
        y: r() * 0.5,
        z: (r() - 0.5) * 1.6,
        s: 0.9 + r() * 0.9,
      }));
      const angle = (i / 30) * Math.PI * 2 + r() * 0.25;
      const radius = half * 1.15 + 8 + r() * 16;
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: 4 + r() * 9, scale: 1.1 + r() * 0.9, puffs, turn: -angle };
    });
  }, [half]);
  const ring = useRef<THREE.Group>(null);
  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ camera }, delta) => {
    if (!ring.current) return;
    ring.current.rotation.y += Math.min(delta, 0.1) * SPEED;
    // Only the far side of the ring shows: clouds between the camera and the city would block the view.
    const cx = camera.position.x - centre;
    const cz = camera.position.z - centre;
    const len = Math.hypot(cx, cz) || 1;
    const turn = ring.current.rotation.y;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    clouds.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const wx = c.x * cos + c.z * sin; // the ring's rotation about y
      const wz = -c.x * sin + c.z * cos;
      g.visible = (wx * cx + wz * cz) / (Math.hypot(wx, wz) * len) < -0.15;
    });
    if (moving()) invalidate();
  });

  return (
    <group ref={ring} position={[centre, 0, centre]}>
      {clouds.map((c, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }} position={[c.x, c.y, c.z]} rotation-y={c.turn} scale={c.scale}>
          {c.puffs.map((p, k) => (
            <mesh key={k} geometry={PUFF} material={CLOUD_MAT} position={[p.x, p.y, p.z]} scale={[p.s * 1.3, p.s * 0.7, p.s]} raycast={() => null} />
          ))}
        </group>
      ))}
    </group>
  );
}
