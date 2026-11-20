"use client";

// Running water for the Fountain Plaza (model in models-catalog.tsx): droplets arc from the spout into the top bowl, and
// water spills from the bowl's rim down into the pool. One instanced mesh; it moves whenever the city is animating.
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const JET = 48;
const FALL = 36;
const GEO = new THREE.SphereGeometry(1, 6, 4);
const MAT = new THREE.MeshStandardMaterial({ color: "#e0f2fe", emissive: "#7dd3fc", emissiveIntensity: 0.45, transparent: true, opacity: 0.9, roughness: 0.2 });

export function FountainWater({ moving }: { moving: () => boolean }) {
  const { invalidate } = useThree();
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const time = useRef(0);

  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    time.current += Math.min(delta, 0.1);
    const t0 = time.current;
    for (let i = 0; i < JET + FALL; i++) {
      const jet = i < JET;
      const k = jet ? i : i - JET;
      const n = jet ? JET : FALL;
      const angle = (k / n) * Math.PI * 2 * 3; // three turns, so droplets on the same side are spread in time
      const t = (t0 / (jet ? 1.1 : 0.8) + k / n) % 1;
      let r: number;
      let y: number;
      if (jet) {
        // From the top of the spout (0.71) up and out, landing in the top bowl (0.49) at radius 0.22.
        r = 0.22 * t;
        y = 0.71 + 0.25 * t - 0.47 * t * t;
      } else {
        // Over the bowl's rim (radius 0.26) and down into the pool (water surface 0.18).
        r = 0.27 + 0.06 * t;
        y = 0.49 - 0.31 * t * t;
      }
      dummy.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
      const s = jet ? 0.014 : 0.012;
      dummy.scale.set(s, jet ? s : s * 1.8, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (moving()) invalidate(); // keep the water running
  });

  return <instancedMesh ref={ref} args={[GEO, MAT, JET + FALL]} frustumCulled={false} />;
}
