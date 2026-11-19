"use client";

import { MapControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { THEME_EVENT } from "@/lib/themes";
import { FACING_ROTATION, facingFor, key, roadSet, roadShape, ROAD_TYPE, strokePath, type Lot, type Tile } from "@/lib/roads";
import { BOX, BuildingModel, MODEL_HEIGHT, NoRoadMarker, mat } from "./models";

export type Preview = { tiles: Tile[]; ok: boolean; height?: number } | null;

export type City3DProps = {
  size: number;
  lots: Lot[];
  connected: Set<string>;
  selectedId?: string;
  dimmedId?: string;
  /** "stroke": drag paints a path (roads, bulldozer); "point": tap a tile. */
  input: "point" | "stroke";
  /** Footprint size shown under the pointer in point mode (0 = no ghost). */
  ghostSize: number;
  ghostOk: (x: number, y: number) => boolean;
  strokeOk: (tiles: Tile[]) => boolean;
  strokeColor: "build" | "demolish";
  onTile: (x: number, y: number) => void;
  onStroke: (tiles: Tile[]) => void;
  onStrokeChange: (tiles: Tile[] | null) => void;
};

export type City3DHandle = { zoom: (factor: number) => void; rotate: (radians: number) => void; reset: () => void };

/** The 3D city. Client-only (loaded with next/dynamic, ssr: false). */
const City3D = forwardRef<City3DHandle, City3DProps>(function City3D(props, ref) {
  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.1, far: 500 }}
      gl={{ antialias: true }}
      aria-label="3D city map"
    >
      <ThemeSky />
      <Scene {...props} handleRef={ref} />
    </Canvas>
  );
});
export default City3D;

/** Sky color from the current theme (--t-sky); updates when the theme changes. */
function ThemeSky() {
  const { gl, invalidate } = useThree();
  useLayoutEffect(() => {
    function apply() {
      const sky = getComputedStyle(document.documentElement).getPropertyValue("--t-sky").trim() || "#1b2a55";
      gl.setClearColor(sky);
      invalidate();
    }
    apply();
    window.addEventListener(THEME_EVENT, apply);
    return () => window.removeEventListener(THEME_EVENT, apply);
  }, [gl, invalidate]);
  return null;
}

function Scene(props: City3DProps & { handleRef: React.ForwardedRef<City3DHandle> }) {
  const { size, lots, connected, input } = props;
  const roads = useMemo(() => roadSet(lots), [lots]);
  const buildings = useMemo(() => lots.filter((l) => l.type_id !== ROAD_TYPE), [lots]);
  const roadTiles = useMemo(() => lots.filter((l) => l.type_id === ROAD_TYPE), [lots]);
  const byTile = useMemo(() => {
    const m = new Map<string, Lot>();
    for (const l of lots) for (let dx = 0; dx < l.size; dx++) for (let dy = 0; dy < l.size; dy++) m.set(key(l.x + dx, l.y + dy), l);
    return m;
  }, [lots]);

  const [hover, setHover] = useState<Tile | null>(null);
  const [stroke, setStroke] = useState<{ start: Tile; end: Tile; pointer: number } | null>(null);
  const strokeTiles = useMemo(() => (stroke ? strokePath(stroke.start, stroke.end) : null), [stroke]);

  const tileFrom = useCallback(
    (e: ThreeEvent<PointerEvent | MouseEvent>): Tile | null => {
      const hit = e.intersections.find((i) => i.object.userData.ground);
      if (!hit) return null;
      const x = Math.floor(hit.point.x);
      const y = Math.floor(hit.point.z);
      return x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null;
    },
    [size],
  );

  function onMove(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    const t = tileFrom(e);
    if (t && (t.x !== hover?.x || t.y !== hover?.y)) setHover(t);
    if (stroke && e.pointerId === stroke.pointer && t && (t.x !== stroke.end.x || t.y !== stroke.end.y)) {
      const next = { ...stroke, end: t };
      setStroke(next);
      props.onStrokeChange(strokePath(next.start, next.end));
    }
  }

  function onDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (input !== "stroke" || e.button !== 0 || stroke) return;
    const t = tileFrom(e);
    if (!t) return;
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    setStroke({ start: t, end: t, pointer: e.pointerId });
    props.onStrokeChange([t]);
  }

  function onUp(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (!stroke || e.pointerId !== stroke.pointer) return;
    const tiles = strokePath(stroke.start, stroke.end);
    setStroke(null);
    props.onStrokeChange(null);
    props.onStroke(tiles);
  }

  function onClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation();
    if (input !== "point" || e.delta > 6) return; // a drag that moved the camera, not a tap
    // Prefer the building actually hit (tall buildings hide the ground behind them).
    const lotId = e.intersections.map((i) => lotIdOf(i.object)).find(Boolean);
    const lot = lotId ? lots.find((l) => l.id === lotId) : null;
    if (lot && props.ghostSize === 0) return props.onTile(lot.x, lot.y);
    const t = tileFrom(e);
    if (t) props.onTile(t.x, t.y);
  }

  const ghost =
    input === "point" && props.ghostSize > 0 && hover
      ? { x: hover.x, y: hover.y, size: props.ghostSize, ok: props.ghostOk(hover.x, hover.y) }
      : null;
  const strokeOk = strokeTiles ? props.strokeOk(strokeTiles) : true;

  return (
    <>
      <CameraRig size={size} handleRef={props.handleRef} panEnabled={input === "point"} />
      <hemisphereLight args={["#e0f2fe", "#4d7c0f", 1.1]} />
      <directionalLight
        position={[size * 0.4 + 8, 18, size * 0.2 - 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
        target-position={[size / 2, 0, size / 2]}
      />

      <group
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        onClick={onClick}
      >
        <Ground size={size} />
        <Roads tiles={roadTiles} roads={roads} />
        {buildings.map((b) => (
          <group key={b.id} position={[b.x + b.size / 2, 0, b.y + b.size / 2]} userData={{ lotId: b.id }}>
            {/* Turn the model so its front (doors, awnings) faces the road. */}
            <group rotation-y={FACING_ROTATION[facingFor(b, roads)]}>
              <BuildingModel typeId={b.type_id} />
            </group>
            {!connected.has(b.id) && <NoRoadMarker y={MODEL_HEIGHT[b.type_id] ?? 1} />}
          </group>
        ))}
      </group>

      {props.selectedId && <Selection lot={lots.find((l) => l.id === props.selectedId)} />}
      {props.dimmedId && <Selection lot={lots.find((l) => l.id === props.dimmedId)} color="#f59e0b" />}
      {ghost && <Footprint tiles={[{ x: ghost.x, y: ghost.y }]} size={ghost.size} ok={ghost.ok} raised />}
      {strokeTiles && (
        <Footprint
          tiles={strokeTiles}
          size={1}
          ok={strokeOk}
          demolish={props.strokeColor === "demolish"}
          skip={props.strokeColor === "build" ? (t) => byTile.get(key(t.x, t.y))?.type_id === ROAD_TYPE : undefined}
        />
      )}
      {input === "stroke" && hover && !stroke && <Footprint tiles={[hover]} size={1} ok demolish={props.strokeColor === "demolish"} />}
    </>
  );
}

/** The placed building an object belongs to (walks up from a mesh to its building group). */
function lotIdOf(object: THREE.Object3D | null): string | undefined {
  for (let o = object; o; o = o.parent) if (o.userData.lotId) return o.userData.lotId as string;
  return undefined;
}

// ---------------------------------------------------------------------------
// Camera: map-style controls kept over the city, with zoom/rotate/reset buttons.
// ---------------------------------------------------------------------------

function CameraRig({
  size,
  handleRef,
  panEnabled,
}: {
  size: number;
  handleRef: React.ForwardedRef<City3DHandle>;
  panEnabled: boolean;
}) {
  const controls = useRef<MapControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const center = useMemo(() => new THREE.Vector3(size / 2, 0, size / 2), [size]);

  const getState = useThree((s) => s.get);
  const reset = useCallback(() => {
    // Narrow (portrait) screens see less sideways, so pull back until the whole city fits.
    const { width, height } = getState().size;
    const aspect = height > 0 ? width / height : 1;
    const k = aspect < 1.2 ? Math.min(2.2, 1.2 / Math.max(aspect, 0.3)) : 1;
    const offset = new THREE.Vector3(size * 0.55, size * 0.85 + 3, size * 0.95 + 3).multiplyScalar(k);
    camera.position.copy(center).add(offset);
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
  }, [camera, center, size, invalidate, getState]);

  // Frame the whole city on first load and whenever the land grows.
  useLayoutEffect(() => {
    reset();
  }, [reset]);

  useImperativeHandle(
    handleRef,
    () => ({
      zoom(factor) {
        const c = controls.current;
        if (!c) return;
        const offset = camera.position.clone().sub(c.target);
        const len = THREE.MathUtils.clamp(offset.length() * factor, c.minDistance, c.maxDistance);
        camera.position.copy(c.target).add(offset.setLength(len));
        c.update();
        invalidate();
      },
      rotate(radians) {
        const c = controls.current;
        if (!c) return;
        const offset = camera.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
        camera.position.copy(c.target).add(offset);
        c.update();
        invalidate();
      },
      reset,
    }),
    [camera, invalidate, reset],
  );

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
      enablePan={panEnabled}
      minDistance={3}
      maxDistance={size * 2.6 + 10}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.25}
      onChange={() => {
        // Keep the view over the city.
        const t = controls.current?.target;
        if (!t) return;
        const margin = 4;
        const clamped = t.clone();
        clamped.x = THREE.MathUtils.clamp(t.x, -margin, size + margin);
        clamped.z = THREE.MathUtils.clamp(t.z, -margin, size + margin);
        clamped.y = 0;
        if (!clamped.equals(t)) {
          camera.position.add(clamped.clone().sub(t));
          t.copy(clamped);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Ground, roads and overlays
// ---------------------------------------------------------------------------

function Ground({ size }: { size: number }) {
  const lines = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i <= size; i++) {
      pts.push(i, 0.003, 0, i, 0.003, size, 0, 0.003, i, size, 0.003, i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [size]);
  const edge = 0.08;
  return (
    <>
      {/* Land beyond yours */}
      <mesh rotation-x={-Math.PI / 2} position={[size / 2, -0.02, size / 2]} receiveShadow>
        <planeGeometry args={[size + 60, size + 60]} />
        <meshStandardMaterial color="#7a9e63" />
      </mesh>
      {/* Your land */}
      <mesh rotation-x={-Math.PI / 2} position={[size / 2, 0, size / 2]} receiveShadow userData={{ ground: true }}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#9ccc65" />
      </mesh>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#7cb342" transparent opacity={0.55} />
      </lineSegments>
      {/* A low hedge marks the edge of your land */}
      {[
        [size / 2, -edge / 2, size + edge, edge],
        [size / 2, size + edge / 2, size + edge, edge],
        [-edge / 2, size / 2, edge, size + edge * 2],
        [size + edge / 2, size / 2, edge, size + edge * 2],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} geometry={BOX} material={mat("#3f6212")} position={[x, 0.06, z]} scale={[w, 0.12, d]} />
      ))}
    </>
  );
}

const ROAD_PARTS = {
  asphalt: mat("#4b5563"),
  curb: mat("#d1d5db"),
  line: mat("#facc15"),
};

/** All road tiles drawn as three instanced meshes (asphalt, curbs, lane marks). */
function Roads({ tiles, roads }: { tiles: Lot[]; roads: Set<string> }) {
  const asphaltRef = useRef<THREE.InstancedMesh>(null);
  const curbRef = useRef<THREE.InstancedMesh>(null);
  const lineRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();

  const parts = useMemo(() => {
    const asphalt: THREE.Matrix4[] = [];
    const curbs: THREE.Matrix4[] = [];
    const lines: THREE.Matrix4[] = [];
    const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const C = 0.12; // curb width
    for (const t of tiles) {
      const cx = t.x + 0.5;
      const cz = t.y + 0.5;
      asphalt.push(m(cx, 0.015, cz, 1, 0.03, 1));
      const s = roadShape(t.x, t.y, roads);
      // Curbs on sides without a neighboring road; corner posts always (makes junctions read cleanly).
      if (!s.n) curbs.push(m(cx, 0.04, t.y + C / 2, 1, 0.05, C));
      if (!s.s) curbs.push(m(cx, 0.04, t.y + 1 - C / 2, 1, 0.05, C));
      if (!s.w) curbs.push(m(t.x + C / 2, 0.04, cz, C, 0.05, 1));
      if (!s.e) curbs.push(m(t.x + 1 - C / 2, 0.04, cz, C, 0.05, 1));
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        curbs.push(m(t.x + C / 2 + dx * (1 - C), 0.04, t.y + C / 2 + dz * (1 - C), C, 0.05, C));
      }
      // Dashed centre line toward each connected neighbor (a lone tile gets a short dash).
      const arms = [s.n && [0, -1], s.s && [0, 1], s.w && [-1, 0], s.e && [1, 0]].filter(Boolean) as number[][];
      const count = arms.length;
      if (count === 0) lines.push(m(cx, 0.032, cz, 0.3, 0.004, 0.05));
      if (count <= 2 || count === 0) {
        for (const [ax, az] of arms) {
          lines.push(m(cx + ax * 0.3, 0.032, cz + az * 0.3, ax ? 0.22 : 0.05, 0.004, az ? 0.22 : 0.05));
        }
      }
    }
    return { asphalt, curbs, lines };
  }, [tiles, roads]);

  useLayoutEffect(() => {
    for (const [ref, list] of [
      [asphaltRef, parts.asphalt],
      [curbRef, parts.curbs],
      [lineRef, parts.lines],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    invalidate();
  }, [parts, invalidate]);

  const cap = (n: number) => Math.max(1, n);
  return (
    <>
      <instancedMesh key={`a${cap(parts.asphalt.length)}`} ref={asphaltRef} args={[BOX, ROAD_PARTS.asphalt, cap(parts.asphalt.length)]} receiveShadow />
      <instancedMesh key={`c${cap(parts.curbs.length)}`} ref={curbRef} args={[BOX, ROAD_PARTS.curb, cap(parts.curbs.length)]} receiveShadow />
      <instancedMesh key={`l${cap(parts.lines.length)}`} ref={lineRef} args={[BOX, ROAD_PARTS.line, cap(parts.lines.length)]} />
    </>
  );
}

const OVERLAY = {
  ok: new THREE.MeshBasicMaterial({ color: "#16a34a", transparent: true, opacity: 0.45, depthWrite: false }),
  bad: new THREE.MeshBasicMaterial({ color: "#dc2626", transparent: true, opacity: 0.45, depthWrite: false }),
  demolish: new THREE.MeshBasicMaterial({ color: "#f97316", transparent: true, opacity: 0.5, depthWrite: false }),
};

function Footprint({
  tiles,
  size,
  ok,
  raised,
  demolish,
  skip,
}: {
  tiles: Tile[];
  size: number;
  ok: boolean;
  raised?: boolean;
  demolish?: boolean;
  skip?: (t: Tile) => boolean;
}) {
  const material = demolish ? OVERLAY.demolish : ok ? OVERLAY.ok : OVERLAY.bad;
  const h = raised ? 0.5 : 0.06;
  return (
    <>
      {tiles.filter((t) => !skip?.(t)).map((t) => (
        <mesh
          key={`${t.x},${t.y}`}
          geometry={BOX}
          material={material}
          position={[t.x + size / 2, h / 2 + 0.01, t.y + size / 2]}
          scale={[size * 0.96, h, size * 0.96]}
          raycast={() => null}
        />
      ))}
    </>
  );
}

function Selection({ lot, color = "#fbbf24" }: { lot?: Lot; color?: string }) {
  if (!lot) return null;
  const s = lot.size;
  const w = 0.07;
  const m = mat(color);
  const cx = lot.x + s / 2;
  const cz = lot.y + s / 2;
  return (
    <group raycast={() => null}>
      {[
        [cx, lot.y + w / 2, s, w],
        [cx, lot.y + s - w / 2, s, w],
        [lot.x + w / 2, cz, w, s],
        [lot.x + s - w / 2, cz, w, s],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={BOX} material={m} position={[x, 0.06, z]} scale={[sx, 0.08, sz]} raycast={() => null} />
      ))}
    </group>
  );
}
