"use client";

// The amusement park's moving rides (the rest of the park is in models-catalog.tsx): the Ferris wheel turns slowly with its
// cabins hanging upright, and every so often the coaster train leaves the station, runs the whole track (slower up the hills,
// faster down) and parks again. Both stop when the city is paused.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { B } from "./models";
import { coasterCurve } from "./models-catalog";

const SPIN = 0.22; // radians a second
const CABINS = 8;
const RADIUS = 0.65;
const RIDE_EVERY = 25; // seconds between coaster runs
const RIDE_TIME = 9; // seconds a run takes
const CARS = [0, 0.035, 0.07]; // spacing along the track
const STATION = 0.04; // where the train waits

export function ParkRides({ moving, colors, seed }: { moving: () => boolean; colors: string[]; seed: number }) {
  const { invalidate } = useThree();
  const wheel = useRef<THREE.Group>(null);
  const cabins = useRef<(THREE.Group | null)[]>([]);
  const cars = useRef<(THREE.Group | null)[]>([]);
  const time = useRef((seed % 1000) / 1000 * RIDE_EVERY); // parks don't all ride at once
  const curve = useMemo(() => coasterCurve(), []);

  useFrame((_, delta) => {
    const go = moving();
    if (go) time.current += Math.min(delta, 0.1);
    const t = time.current;
    // Ferris wheel.
    const angle = t * SPIN;
    if (wheel.current) wheel.current.rotation.x = angle;
    for (const c of cabins.current) if (c) c.rotation.x = -angle;
    // Coaster: a run is a smooth trip once round the loop; otherwise the train waits at the station.
    const into = t % RIDE_EVERY;
    const run = into < RIDE_TIME ? into / RIDE_TIME : 0;
    const eased = run - Math.sin(run * Math.PI * 2) / (Math.PI * 2) * 0.6; // a slower start and end
    cars.current.forEach((car, i) => {
      if (!car) return;
      const u = (((STATION + eased - CARS[i]) % 1) + 1) % 1;
      const at = curve.getPointAt(u);
      const ahead = curve.getTangentAt(u);
      car.position.set(at.x, at.y + 0.05, at.z);
      car.rotation.set(-Math.asin(Math.max(-1, Math.min(1, ahead.y))), Math.atan2(ahead.x, ahead.z), 0, "YXZ");
    });
    if (go) invalidate();
  });

  return (
    <>
      <group position={[-1.1, 0, -1.1]}>
        <B p={[-0.12, 0.02, 0]} s={[0.04, 1.0, 0.04]} c="#94a3b8" />
        <B p={[0.12, 0.02, 0]} s={[0.04, 1.0, 0.04]} c="#94a3b8" />
        <group ref={wheel} position={[0, 1.0, 0]}>
          <mesh rotation-y={Math.PI / 2} castShadow>
            <torusGeometry args={[RADIUS, 0.025, 6, 32]} />
            <meshStandardMaterial color={colors[0]} />
          </mesh>
          {Array.from({ length: CABINS }, (_, i) => {
            const a = (i / CABINS) * Math.PI * 2;
            return (
              <group key={i}>
                <mesh position={[0, Math.sin(a) * (RADIUS / 2), Math.cos(a) * (RADIUS / 2)]} rotation-x={-a} scale={[0.015, 0.015, RADIUS]}>
                  <boxGeometry />
                  <meshStandardMaterial color="#cbd5e1" />
                </mesh>
                <group position={[0, Math.sin(a) * RADIUS, Math.cos(a) * RADIUS]} ref={(el) => { cabins.current[i] = el; }}>
                  <mesh position={[0, -0.08, 0]} scale={[0.12, 0.1, 0.1]} castShadow>
                    <boxGeometry />
                    <meshStandardMaterial color={colors[1 + (i % 3)]} />
                  </mesh>
                </group>
              </group>
            );
          })}
        </group>
      </group>
      {CARS.map((_, i) => (
        <group key={i} ref={(el) => { cars.current[i] = el; }}>
          <mesh castShadow scale={[0.1, 0.06, 0.13]}>
            <boxGeometry />
            <meshStandardMaterial color={i === 1 ? "#2563eb" : "#facc15"} />
          </mesh>
        </group>
      ))}
    </>
  );
}
