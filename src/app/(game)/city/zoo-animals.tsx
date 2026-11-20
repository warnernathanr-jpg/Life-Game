"use client";

// Animals wandering their zoo enclosures: giraffes and zebras on the savanna, penguins around the pond, bears in the
// forest and goats on the rocks. Each walks to a random spot in its enclosure, pauses, and picks another. Drawn in the
// zoo's own frame (enclosure layout from the zoo model in models-catalog.tsx). They move whenever the city is animating.
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { B } from "./models";

type Kind = "giraffe" | "zebra" | "penguin" | "bear" | "goat";
/** Enclosure: centre and half-size (or a ring for the pond). */
type Area = { x: number; z: number; half: number; ring?: boolean };

const SAVANNA: Area = { x: -1, z: -1, half: 0.58 };
const POND: Area = { x: 1, z: -1, half: 0.6, ring: true };
const FOREST: Area = { x: -1, z: 1, half: 0.55 };
const ROCKS: Area = { x: 1, z: 1, half: 0.58 };

const ANIMALS: { kind: Kind; area: Area; speed: number }[] = [
  { kind: "giraffe", area: SAVANNA, speed: 0.18 },
  { kind: "giraffe", area: SAVANNA, speed: 0.16 },
  { kind: "zebra", area: SAVANNA, speed: 0.24 },
  { kind: "zebra", area: SAVANNA, speed: 0.22 },
  { kind: "penguin", area: POND, speed: 0.12 },
  { kind: "penguin", area: POND, speed: 0.1 },
  { kind: "penguin", area: POND, speed: 0.11 },
  { kind: "bear", area: FOREST, speed: 0.14 },
  { kind: "bear", area: FOREST, speed: 0.12 },
  { kind: "goat", area: ROCKS, speed: 0.2 },
  { kind: "goat", area: ROCKS, speed: 0.18 },
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function spotIn(a: Area, r: () => number): [number, number] {
  if (a.ring) {
    const t = r() * Math.PI * 2;
    const rad = a.half * (0.85 + r() * 0.2);
    return [a.x + Math.cos(t) * rad, a.z + Math.sin(t) * rad];
  }
  return [a.x + (r() * 2 - 1) * a.half, a.z + (r() * 2 - 1) * a.half];
}

/** A small low-poly animal facing +z. */
function Animal({ kind }: { kind: Kind }) {
  switch (kind) {
    case "giraffe":
      return (
        <>
          <B p={[0, 0.12, 0]} s={[0.07, 0.08, 0.16]} c="#eab308" />
          {[[-0.025, -0.05], [0.025, -0.05], [-0.025, 0.05], [0.025, 0.05]].map(([x, z], i) => (
            <B key={i} p={[x, 0, z]} s={[0.015, 0.12, 0.015]} c="#ca8a04" />
          ))}
          <B p={[0, 0.18, 0.06]} s={[0.03, 0.18, 0.03]} c="#eab308" />
          <B p={[0, 0.35, 0.08]} s={[0.04, 0.035, 0.07]} c="#ca8a04" />
          <B p={[0.015, 0.14, -0.02]} s={[0.02, 0.02, 0.03]} c="#92400e" />
        </>
      );
    case "zebra":
      return (
        <>
          <B p={[0, 0.07, 0]} s={[0.07, 0.06, 0.15]} c="#f8fafc" />
          {[-0.04, 0, 0.04].map((z) => (
            <B key={z} p={[0, 0.07, z]} s={[0.072, 0.062, 0.015]} c="#111827" />
          ))}
          {[[-0.025, -0.05], [0.025, -0.05], [-0.025, 0.05], [0.025, 0.05]].map(([x, z], i) => (
            <B key={i} p={[x, 0, z]} s={[0.014, 0.07, 0.014]} c="#e5e7eb" />
          ))}
          <B p={[0, 0.11, 0.09]} s={[0.035, 0.045, 0.06]} c="#f8fafc" />
        </>
      );
    case "penguin":
      return (
        <>
          <B p={[0, 0, 0]} s={[0.04, 0.07, 0.035]} c="#111827" />
          <B p={[0, 0.005, 0.018]} s={[0.03, 0.055, 0.002]} c="#f8fafc" />
          <B p={[0, 0.07, 0]} s={[0.03, 0.025, 0.03]} c="#111827" />
          <B p={[0, 0.075, 0.018]} s={[0.012, 0.008, 0.012]} c="#f59e0b" />
        </>
      );
    case "bear":
      return (
        <>
          <B p={[0, 0.03, 0]} s={[0.09, 0.07, 0.14]} c="#78350f" />
          {[[-0.03, -0.045], [0.03, -0.045], [-0.03, 0.045], [0.03, 0.045]].map(([x, z], i) => (
            <B key={i} p={[x, 0, z]} s={[0.025, 0.035, 0.025]} c="#451a03" />
          ))}
          <B p={[0, 0.06, 0.085]} s={[0.06, 0.055, 0.05]} c="#78350f" />
          <B p={[0, 0.06, 0.112]} s={[0.025, 0.02, 0.012]} c="#d6d3d1" />
        </>
      );
    case "goat":
      return (
        <>
          <B p={[0, 0.045, 0]} s={[0.05, 0.045, 0.09]} c="#f5f5f4" />
          {[[-0.017, -0.03], [0.017, -0.03], [-0.017, 0.03], [0.017, 0.03]].map(([x, z], i) => (
            <B key={i} p={[x, 0, z]} s={[0.01, 0.045, 0.01]} c="#a8a29e" />
          ))}
          <B p={[0, 0.08, 0.05]} s={[0.03, 0.035, 0.035]} c="#f5f5f4" />
          <B p={[0, 0.105, 0.045]} s={[0.03, 0.015, 0.008]} c="#57534e" />
        </>
      );
  }
}

type State = { x: number; z: number; tx: number; tz: number; wait: number; heading: number };

export function ZooAnimals({ seed }: { seed: number }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  // Each zoo's random walk, and where every animal starts (made once per zoo).
  const [{ r, list }] = useState(() => {
    const r = rng(seed);
    const list: State[] = ANIMALS.map((a) => {
      const [x, z] = spotIn(a.area, r);
      const [tx, tz] = spotIn(a.area, r);
      return { x, z, tx, tz, wait: r() * 3, heading: 0 };
    });
    return { r, list };
  });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    ANIMALS.forEach((a, i) => {
      const s = list[i];
      const g = refs.current[i];
      if (!g) return;
      if (s.wait > 0) {
        s.wait -= dt;
      } else {
        const dx = s.tx - s.x;
        const dz = s.tz - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.02) {
          // Arrived: graze or look around for a bit, then pick somewhere new.
          s.wait = 1 + r() * 4;
          [s.tx, s.tz] = spotIn(a.area, r);
        } else {
          const step = Math.min(dist, a.speed * dt);
          s.x += (dx / dist) * step;
          s.z += (dz / dist) * step;
          const want = Math.atan2(dx, dz);
          let turn = want - s.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          s.heading += turn * Math.min(1, dt * 6);
        }
      }
      // Goats stand on top of the big rock when they wander over it.
      const onRock = a.area === ROCKS && Math.abs(s.x - 1) < 0.25 && Math.abs(s.z - 1) < 0.2 ? 0.3 : 0;
      g.position.set(s.x, 0.03 + onRock, s.z);
      g.rotation.y = s.heading;
    });
  });

  return (
    <>
      {ANIMALS.map((a, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <Animal kind={a.kind} />
        </group>
      ))}
    </>
  );
}
