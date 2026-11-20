"use client";

// A jet taking off from an airport every so often: it waits at the start of the runway, rolls down it speeding up, lifts
// off, climbs away over the city and disappears, then the next one lines up. Drawn in the airport's own frame (the runway
// runs along x at the back of the lot, see the airport model in models-catalog.tsx).
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { B } from "./models";

/** Seconds between take-offs (each airport is offset a little so two don't go at once). */
const CYCLE = 25;
const RUNWAY_Z = -1.0; // runway centre line (the model's runway, scaled to 4×4)
const START_X = -1.75;

export function Airplanes({ seed, accent }: { seed: number; accent: string }) {
  const plane = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offset = (seed % 1000) / 1000 * CYCLE;

  useFrame((state) => {
    const g = plane.current;
    if (!g) return;
    const t = (state.clock.elapsedTime + offset) % CYCLE;
    // 0–2 s: waiting at the start; 2–13 s: roll, lift off, climb away; then gone until the next one.
    const s = Math.max(0, t - 2);
    const x = START_X + 0.13 * s * s;
    const y = x > 0.1 ? 0.03 + 0.22 * Math.pow(x - 0.1, 1.25) : 0.03;
    const flying = t < 13 && x < 14;
    g.visible = flying;
    if (flying) {
      const ahead = START_X + 0.13 * (s + 0.05) * (s + 0.05);
      const yAhead = ahead > 0.1 ? 0.03 + 0.22 * Math.pow(ahead - 0.1, 1.25) : 0.03;
      g.position.set(x, y, RUNWAY_Z);
      g.rotation.z = Math.atan2(yAhead - y, Math.max(0.0001, ahead - x)); // nose up as it climbs
      invalidate(); // keep animating while it's in the air
    } else if (!wake.current) {
      // Nothing to draw until the next take-off: wake the renderer up then.
      wake.current = setTimeout(() => {
        wake.current = null;
        invalidate();
      }, (CYCLE - t) * 1000);
    }
  });

  // A small jet, nose toward +x.
  return (
    <group ref={plane} visible={false}>
      <B p={[0, 0, 0]} s={[0.62, 0.1, 0.1]} c="#f8fafc" />
      <B p={[0.33, 0.01, 0]} s={[0.06, 0.07, 0.07]} c="#e2e8f0" />
      <B p={[0.02, 0.03, 0]} s={[0.16, 0.02, 0.74]} c="#f8fafc" />
      <B p={[-0.27, 0.06, 0]} s={[0.08, 0.02, 0.26]} c="#f8fafc" />
      <B p={[-0.28, 0.08, 0]} s={[0.1, 0.14, 0.02]} c={accent} />
      <B p={[0.06, -0.01, 0.2]} s={[0.12, 0.05, 0.05]} c="#94a3b8" />
      <B p={[0.06, -0.01, -0.2]} s={[0.12, 0.05, 0.05]} c="#94a3b8" />
      {/* Cabin windows along both sides. */}
      <B p={[0.05, 0.055, 0.051]} s={[0.4, 0.02, 0.002]} c="#60a5fa" />
      <B p={[0.05, 0.055, -0.051]} s={[0.4, 0.02, 0.002]} c="#60a5fa" />
    </group>
  );
}
