"use client";

import { MapControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import { THEME_EVENT } from "@/lib/themes";
import { AVENUE_TYPE, BRIDGE_TYPE, DIRT_ROAD_TYPE, effectiveFacing, isRoadType, FACING_ROTATION, key, rowJoins, roadSet, roadShape, ROAD_TYPE, strokePath, type Lot, type Tile } from "@/lib/roads";
import { Traffic, type SimProps } from "./traffic";
import { BOX, BuildingModel, CROWN, MODEL_HEIGHT, NoRoadMarker, OCTA, WorkerMarker, colorSeed, mat } from "./models";

export type Preview = { tiles: Tile[]; ok: boolean; height?: number } | null;

export type City3DProps = {
  size: number;
  lots: Lot[];
  /** Buildings with no road beside them (red marker). */
  needsRoad: Set<string>;
  /** Shops and industry short of workers (yellow marker). */
  understaffed: Set<string>;
  selectedId?: string;
  dimmedId?: string;
  /** "stroke": drag paints a path (roads, bulldozer); "point": tap a tile. */
  input: "point" | "stroke";
  /** Footprint shown under the pointer in point mode (null = no ghost). */
  ghostDims: { w: number; h: number } | null;
  ghostOk: (x: number, y: number) => boolean;
  strokeOk: (tiles: Tile[]) => boolean;
  strokeColor: "build" | "demolish";
  /** Type being painted (road, tree, water): tiles that already have it are free and not highlighted. */
  paintTypeId?: string;
  onTile: (x: number, y: number) => void;
  onStroke: (tiles: Tile[]) => void;
  onStrokeChange: (tiles: Tile[] | null) => void;
  /** A building preview held at this tile (waiting for Confirm) instead of following the pointer. */
  ghostAt?: Tile | null;
  /** Painted tiles waiting for Confirm (shown highlighted). */
  previewTiles?: Tile[];
  previewOk?: boolean;
  /** Citizens travelling around the city (cars and walkers), with pause and tap-to-inspect. */
  sim?: SimProps;
};

export type City3DHandle = { zoom: (factor: number) => void; rotate: (radians: number) => void; reset: () => void };

/** The 3D city. Client-only (loaded with next/dynamic, ssr: false). */
/** Phones and tablets (touch is the main pointer). */
const isCoarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Animations (cars, water) only keep the map redrawing while it's on screen and the page isn't being scrolled,
 * so a phone's scrolling never competes with the 3D view.
 */
const motion = { on: true };

function MotionGate() {
  const { gl, invalidate } = useThree();
  useLayoutEffect(() => {
    let visible = true;
    let scrolling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const was = motion.on;
      motion.on = visible && !scrolling && document.visibilityState === "visible";
      if (motion.on && !was) invalidate();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      update();
    });
    io.observe(gl.domElement);
    const onScroll = () => {
      scrolling = true;
      update();
      clearTimeout(timer);
      timer = setTimeout(() => {
        scrolling = false;
        update();
      }, 250);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", update);
      motion.on = true;
    };
  }, [gl, invalidate]);
  return null;
}

const City3D = forwardRef<City3DHandle, City3DProps>(function City3D(props, ref) {
  const [coarse] = useState(isCoarse);
  return (
    <Canvas
      shadows
      frameloop="demand"
      dpr={coarse ? [1, 1.5] : [1, 2]}
      camera={{ fov: 40, near: 0.1, far: 500 }}
      gl={{ antialias: true }}
      aria-label="3D city map"
    >
      <ThemeSky />
      <MotionGate />
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
  const { size, lots, needsRoad, understaffed, input } = props;
  const roads = useMemo(() => roadSet(lots), [lots]);
  const buildings = useMemo(() => lots.filter((l) => !isRoadType(l.type_id) && l.type_id !== WATER_TYPE), [lots]);
  // Bridges stand on water, so the pond keeps flowing underneath them.
  const waterTiles = useMemo(() => lots.filter((l) => l.type_id === WATER_TYPE || l.type_id === BRIDGE_TYPE), [lots]);
  const bridgeTiles = useMemo(() => lots.filter((l) => l.type_id === BRIDGE_TYPE), [lots]);
  // Townhomes side by side facing the same way join into a row.
  const joins = useMemo(() => rowJoins(lots, roadSet(lots), "house"), [lots]);
  const roadTiles = useMemo(
    () => ({
      dirt: lots.filter((l) => l.type_id === DIRT_ROAD_TYPE),
      two: lots.filter((l) => l.type_id === ROAD_TYPE),
      four: lots.filter((l) => l.type_id === AVENUE_TYPE),
    }),
    [lots],
  );
  const byTile = useMemo(() => {
    const m = new Map<string, Lot>();
    for (const l of lots) for (let dx = 0; dx < l.w; dx++) for (let dy = 0; dy < l.h; dy++) m.set(key(l.x + dx, l.y + dy), l);
    return m;
  }, [lots]);

  const [hover, setHover] = useState<Tile | null>(null);
  const [stroke, setStroke] = useState<{ start: Tile; end: Tile; pointer: number } | null>(null);
  // Only one finger draws: a second finger (pinch/zoom) cancels the stroke, and nothing is drawn until all fingers lift.
  const multiTouch = useRef(false);
  const gl = useThree((st) => st.gl);
  const onStrokeChangeRef = useRef(props.onStrokeChange);
  useLayoutEffect(() => {
    onStrokeChangeRef.current = props.onStrokeChange;
  });
  useLayoutEffect(() => {
    const el = gl.domElement;
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        if (!multiTouch.current) {
          multiTouch.current = true;
          setStroke(null);
          onStrokeChangeRef.current(null);
        }
      } else if (e.touches.length === 0) {
        multiTouch.current = false;
      }
    };
    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("touchend", onTouch, { passive: true });
    el.addEventListener("touchcancel", onTouch, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchend", onTouch);
      el.removeEventListener("touchcancel", onTouch);
    };
  }, [gl]);
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
    if (input !== "stroke" || e.button !== 0 || stroke || multiTouch.current) return;
    const t = tileFrom(e);
    if (!t) return;
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    setStroke({ start: t, end: t, pointer: e.pointerId });
    props.onStrokeChange([t]);
  }

  function onUp(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (!stroke || e.pointerId !== stroke.pointer || multiTouch.current) return;
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
    if (lot && !props.ghostDims) return props.onTile(lot.x, lot.y);
    const t = tileFrom(e);
    if (t) props.onTile(t.x, t.y);
  }

  const ghostTile = props.ghostAt ?? hover;
  const ghost =
    input === "point" && props.ghostDims && ghostTile
      ? { x: ghostTile.x, y: ghostTile.y, ...props.ghostDims, ok: props.ghostOk(ghostTile.x, ghostTile.y) }
      : null;
  const strokeOk = strokeTiles ? props.strokeOk(strokeTiles) : true;

  return (
    <>
      <CameraRig size={size} handleRef={props.handleRef} panEnabled={input === "point"} painting={input === "stroke"} />
      <hemisphereLight args={["#e0f2fe", "#4d7c0f", 1.1]} />
      <directionalLight
        position={[size * 0.4 + 8, 18, size * 0.2 - 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={isCoarse() ? [1024, 1024] : [2048, 2048]}
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
        <Roads tiles={roadTiles.dirt} roads={roads} variant="dirt" />
        <Roads tiles={roadTiles.two} roads={roads} variant="two" />
        <Roads tiles={roadTiles.four} roads={roads} variant="four" />
        <Water tiles={waterTiles} />
        <Bridges tiles={bridgeTiles} roads={roads} />
        {props.sim && <Traffic sim={props.sim} roads={roads} />}
        <Wilds size={size} occupied={byTile} />
        {buildings.map((b) => (
          <group key={b.id} position={[b.x + b.w / 2, 0, b.y + b.h / 2]} userData={{ lotId: b.id }}>
            {/* Turn the model so its front (doors, awnings) faces the road. */}
            <group rotation-y={FACING_ROTATION[effectiveFacing(b, roads)]}>
              <BuildingModel typeId={b.type_id} seed={colorSeed(b.id)} join={joins.get(b.id)} />
            </group>
            {needsRoad.has(b.id) && <NoRoadMarker y={MODEL_HEIGHT[b.type_id] ?? 1} />}
            {understaffed.has(b.id) && <WorkerMarker y={MODEL_HEIGHT[b.type_id] ?? 1} />}
          </group>
        ))}
      </group>

      {props.selectedId && <Selection lot={lots.find((l) => l.id === props.selectedId)} />}
      {props.dimmedId && <Selection lot={lots.find((l) => l.id === props.dimmedId)} color="#f59e0b" />}
      {ghost && <Footprint tiles={[{ x: ghost.x, y: ghost.y }]} w={ghost.w} h={ghost.h} ok={ghost.ok} raised />}
      {props.previewTiles && props.previewTiles.length > 0 && (
        <Footprint
          tiles={props.previewTiles}
          ok={props.previewOk ?? true}
          skip={(t) => alreadyPainted(byTile.get(key(t.x, t.y))?.type_id, props.paintTypeId ?? ROAD_TYPE)}
        />
      )}
      {strokeTiles && (
        <Footprint
          tiles={strokeTiles}
          ok={strokeOk}
          demolish={props.strokeColor === "demolish"}
          skip={props.strokeColor === "build" ? (t) => alreadyPainted(byTile.get(key(t.x, t.y))?.type_id, props.paintTypeId ?? ROAD_TYPE) : undefined}
        />
      )}
      {input === "stroke" && hover && !stroke && <Footprint tiles={[hover]} ok demolish={props.strokeColor === "demolish"} />}
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
  painting,
}: {
  size: number;
  handleRef: React.ForwardedRef<City3DHandle>;
  panEnabled: boolean;
  painting: boolean;
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

  // Touch gestures are handled here with plain touch events (the most reliable thing on phones, iPhones especially);
  // the controls only handle the mouse. One finger drags the map (unless painting, where it draws); two fingers pan,
  // pinch to zoom and twist to rotate. A tap still selects (no movement, so the browser still sends the click).
  const gl = useThree((st) => st.gl);
  const paintingRef = useRef(painting);
  useLayoutEffect(() => {
    paintingRef.current = painting;
  }, [painting]);
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.touches = { ONE: -1 as unknown as THREE.TOUCH, TWO: -1 as unknown as THREE.TOUCH };
    const el = gl.domElement;
    const persp = camera as THREE.PerspectiveCamera;
    let last: { x: number; y: number; dist: number; angle: number; n: number } | null = null;
    const read = (e: TouchEvent) => {
      const t = e.touches;
      if (t.length >= 2) {
        const dx = t[1].clientX - t[0].clientX;
        const dy = t[1].clientY - t[0].clientY;
        return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2, dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), n: 2 };
      }
      return { x: t[0].clientX, y: t[0].clientY, dist: 0, angle: 0, n: 1 };
    };
    const panBy = (dx: number, dy: number) => {
      const offset = camera.position.clone().sub(c.target);
      const dist = offset.length();
      const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) / Math.max(1, el.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
      const forward = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
      // The ground is foreshortened when tilted: a pixel up the screen covers more ground.
      const tilt = Math.max(0.35, offset.y / dist);
      const move = right.multiplyScalar(-dx * perPx).add(forward.multiplyScalar((dy * perPx) / tilt));
      camera.position.add(move);
      c.target.add(move);
    };
    const settle = () => {
      const margin = 4;
      const t = c.target;
      const clamped = new THREE.Vector3(THREE.MathUtils.clamp(t.x, -margin, size + margin), 0, THREE.MathUtils.clamp(t.z, -margin, size + margin));
      camera.position.add(clamped.clone().sub(t));
      t.copy(clamped);
      c.update();
      invalidate();
    };
    const onStart = (e: TouchEvent) => {
      last = e.touches.length === 1 && paintingRef.current ? null : read(e);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && paintingRef.current) return; // drawing a road/trees/water stroke
      const now = read(e);
      if (!last || last.n !== now.n) {
        last = now;
        return;
      }
      e.preventDefault();
      panBy(now.x - last.x, now.y - last.y);
      if (now.n === 2 && last.dist > 0 && now.dist > 0) {
        const offset = camera.position.clone().sub(c.target);
        const len = THREE.MathUtils.clamp(offset.length() * (last.dist / now.dist), c.minDistance, c.maxDistance);
        offset.setLength(len).applyAxisAngle(new THREE.Vector3(0, 1, 0), now.angle - last.angle);
        camera.position.copy(c.target).add(offset);
      }
      last = now;
      settle();
    };
    const onEnd = (e: TouchEvent) => {
      last = e.touches.length > 0 && !(e.touches.length === 1 && paintingRef.current) ? read(e) : null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [gl, camera, invalidate, size]);

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
      {/* Grid lines never take taps (a line's hit area is a whole tile wide, so it would block cars and buildings). */}
      <lineSegments geometry={lines} raycast={() => null}>
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
  asphaltDark: mat("#374151"),
  curb: mat("#d1d5db"),
  line: mat("#facc15"),
  white: mat("#f1f5f9"),
  dirt: mat("#a07a52"),
  rut: mat("#7a5a3a"),
};

type RoadVariant = "dirt" | "two" | "four";

/**
 * Road tiles of one kind, drawn as instanced boxes. Every kind joins up with every other (`roads` holds them all).
 * Dirt: packed earth with wheel ruts, no curbs. 2-lane: asphalt, curbs, a dashed yellow centre line. 4-lane: darker
 * asphalt, curbs, a double yellow centre line and white dashed lane lines.
 */
function Roads({ tiles, roads, variant }: { tiles: Lot[]; roads: Set<string>; variant: RoadVariant }) {
  const parts = useMemo(() => {
    const surface: THREE.Matrix4[] = [];
    const curbs: THREE.Matrix4[] = [];
    const yellow: THREE.Matrix4[] = [];
    const white: THREE.Matrix4[] = [];
    const ruts: THREE.Matrix4[] = [];
    const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const C = 0.12; // curb width
    for (const t of tiles) {
      const cx = t.x + 0.5;
      const cz = t.y + 0.5;
      surface.push(m(cx, variant === "dirt" ? 0.01 : 0.015, cz, 1, variant === "dirt" ? 0.02 : 0.03, 1));
      const s = roadShape(t.x, t.y, roads);
      const arms = [s.n && [0, -1], s.s && [0, 1], s.w && [-1, 0], s.e && [1, 0]].filter(Boolean) as number[][];
      // A strip from the centre toward an arm, offset sideways by `off` (perpendicular to the arm).
      const strip = (list: THREE.Matrix4[], ax: number, az: number, off: number, len: number, width: number, y: number, from = 0) => {
        const mid = from + len / 2;
        list.push(m(cx + ax * mid + (az ? off : 0), y, cz + az * mid + (ax ? off : 0), ax ? len : width, 0.004, az ? len : width));
      };
      if (variant === "dirt") {
        // Two wheel ruts along each arm (a lone tile gets a short pair).
        const list = arms.length ? arms : [[1, 0], [-1, 0]];
        for (const [ax, az] of list) for (const off of [-0.15, 0.15]) strip(ruts, ax, az, off, 0.5, 0.06, 0.022);
        continue;
      }
      // Curbs on sides without a neighboring road; corner posts always (junctions read cleanly).
      if (!s.n) curbs.push(m(cx, 0.04, t.y + C / 2, 1, 0.05, C));
      if (!s.s) curbs.push(m(cx, 0.04, t.y + 1 - C / 2, 1, 0.05, C));
      if (!s.w) curbs.push(m(t.x + C / 2, 0.04, cz, C, 0.05, 1));
      if (!s.e) curbs.push(m(t.x + 1 - C / 2, 0.04, cz, C, 0.05, 1));
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        curbs.push(m(t.x + C / 2 + dx * (1 - C), 0.04, t.y + C / 2 + dz * (1 - C), C, 0.05, C));
      }
      if (arms.length > 2) continue; // no paint in junctions
      if (variant === "two") {
        if (arms.length === 0) yellow.push(m(cx, 0.032, cz, 0.3, 0.004, 0.05));
        for (const [ax, az] of arms) strip(yellow, ax, az, 0, 0.22, 0.05, 0.032, 0.19);
      } else {
        const list = arms.length ? arms : [[1, 0], [-1, 0]];
        for (const [ax, az] of list) {
          strip(yellow, ax, az, -0.025, 0.5, 0.025, 0.032); // double yellow
          strip(yellow, ax, az, 0.025, 0.5, 0.025, 0.032);
          strip(white, ax, az, -0.21, 0.2, 0.025, 0.032, 0.2); // lane dashes
          strip(white, ax, az, 0.21, 0.2, 0.025, 0.032, 0.2);
        }
      }
    }
    return { surface, curbs, yellow, white, ruts };
  }, [tiles, roads, variant]);

  if (tiles.length === 0) return null;
  return (
    <>
      <Boxes list={parts.surface} material={variant === "dirt" ? ROAD_PARTS.dirt : variant === "four" ? ROAD_PARTS.asphaltDark : ROAD_PARTS.asphalt} />
      {variant === "dirt" ? (
        <Boxes list={parts.ruts} material={ROAD_PARTS.rut} />
      ) : (
        <>
          <Boxes list={parts.curbs} material={ROAD_PARTS.curb} />
          <Boxes list={parts.yellow} material={ROAD_PARTS.line} />
          {variant === "four" && <Boxes list={parts.white} material={ROAD_PARTS.white} />}
        </>
      )}
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
  w = 1,
  h: d = 1,
  ok,
  raised,
  demolish,
  skip,
}: {
  tiles: Tile[];
  w?: number;
  h?: number;
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
          position={[t.x + w / 2, h / 2 + 0.01, t.y + d / 2]}
          scale={[w - 0.04, h, d - 0.04]}
          raycast={() => null}
        />
      ))}
    </>
  );
}

function Selection({ lot, color = "#fbbf24" }: { lot?: Lot; color?: string }) {
  if (!lot) return null;
  const sw = lot.w;
  const sh = lot.h;
  const w = 0.07;
  const m = mat(color);
  const cx = lot.x + sw / 2;
  const cz = lot.y + sh / 2;
  return (
    <group raycast={() => null}>
      {[
        [cx, lot.y + w / 2, sw, w],
        [cx, lot.y + sh - w / 2, sw, w],
        [lot.x + w / 2, cz, w, sh],
        [lot.x + sw - w / 2, cz, w, sh],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={BOX} material={m} position={[x, 0.06, z]} scale={[sx, 0.08, sz]} raycast={() => null} />
      ))}
    </group>
  );
}

const WATER_TYPE = "water";

/** Is this tile already what the paint tool would make? (A bridge already is road and already is water.) */
function alreadyPainted(current: string | undefined, paint: string) {
  return current === paint || (current === BRIDGE_TYPE && (isRoadType(paint) || paint === WATER_TYPE));
}

const BRIDGE_DECK = 0.03; // top of a bridge deck: level with the road surface
const BRIDGE = { deck: mat("#4b5563"), wall: mat("#a8a29e"), wallTop: mat("#d6d3d1"), rail: mat("#e2e8f0"), line: mat("#fde047") };

/** Bridge tiles: a deck level with the road, with railings along the direction the road runs. */
function Bridges({ tiles, roads }: { tiles: Lot[]; roads: Set<string> }) {
  return (
    <>
      {tiles.map((t) => {
        const s = roadShape(t.x, t.y, roads);
        // Runs east-west when there's road to the east or west (or nothing either way), otherwise north-south.
        const alongX = s.e || s.w || !(s.n || s.s);
        return (
          <group key={t.id} position={[t.x + 0.5, 0, t.y + 0.5]} rotation-y={alongX ? 0 : Math.PI / 2} userData={{ lotId: t.id }}>
            <mesh geometry={BOX} material={BRIDGE.deck} position={[0, BRIDGE_DECK / 2, 0]} scale={[1, BRIDGE_DECK, 0.92]} castShadow receiveShadow />
            {/* Side walls: a low concrete parapet with a capstone and a metal guardrail on posts. */}
            {[-0.42, 0.42].map((z) => (
              <group key={z}>
                <mesh geometry={BOX} material={BRIDGE.wall} position={[0, BRIDGE_DECK + 0.04, z]} scale={[1, 0.1, 0.07]} castShadow receiveShadow />
                <mesh geometry={BOX} material={BRIDGE.wallTop} position={[0, BRIDGE_DECK + 0.095, z]} scale={[1, 0.015, 0.09]} />
                {[-0.375, -0.125, 0.125, 0.375].map((x) => (
                  <mesh key={x} geometry={BOX} material={BRIDGE.rail} position={[x, BRIDGE_DECK + 0.135, z]} scale={[0.03, 0.07, 0.03]} />
                ))}
                <mesh geometry={BOX} material={BRIDGE.rail} position={[0, BRIDGE_DECK + 0.17, z]} scale={[1, 0.022, 0.035]} castShadow />
              </group>
            ))}
            <mesh geometry={BOX} material={BRIDGE.line} position={[0, BRIDGE_DECK + 0.002, 0]} scale={[0.28, 0.004, 0.04]} raycast={() => null} />
          </group>
        );
      })}
    </>
  );
}

/** Hash of a tile position (stable "random" per tile). */
function tileHash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ salt * 83492791, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// The bank: lusher, darker grass than the lawn, with mossy rocks and reeds.
const WATER_PARTS = { bank: mat("#4a8a32"), rock: mat("#8b8f87"), rockDark: mat("#62675f"), reed: mat("#5b8c22"), reedTip: mat("#8a6a3b") };

/** Shared clock for the water shader (seconds). */
const waterTime = { value: 0 };

/**
 * Stylized water: one smooth surface per pond, deep blue in the middle fading to lighter shallows at the shore
 * (a per-vertex "shallow" value) and a soft foam line breathing along the shore.
 */
const WATER_MATERIAL = new THREE.ShaderMaterial({
  uniforms: { uTime: waterTime },
  vertexShader: `
    attribute float aShallow;
    varying float vShallow;
    varying vec2 vXZ;
    void main() {
      vShallow = aShallow;
      vXZ = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime;
    varying float vShallow;
    varying vec2 vXZ;
    void main() {
      vec3 deep = vec3(0.010, 0.095, 0.30); // linear, about #1a5596
      vec3 shallow = vec3(0.04, 0.28, 0.45); // linear, about #3a8fb3
      vec3 col = mix(deep, shallow, smoothstep(0.0, 1.0, vShallow));
      // Shore foam: a thin light band that slowly moves in and out.
      float edge = vShallow + 0.06 * sin(uTime * 1.4 + vXZ.x * 3.0 + vXZ.y * 2.3);
      float foam = smoothstep(0.95, 1.0, edge);
      col = mix(col, vec3(0.55, 0.72, 0.78), foam * 0.35);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});

/** One surface for all water tiles, 3x3 vertices per tile; shallow = 1 at land, 0 a tile or more away. */
function waterGeometry(tiles: Lot[]) {
  const water = new Set(tiles.map((t) => key(t.x, t.y)));
  const shallowAt = (px: number, pz: number) => {
    let d = 9;
    for (let tx = Math.floor(px) - 2; tx <= Math.floor(px) + 1; tx++) {
      for (let tz = Math.floor(pz) - 2; tz <= Math.floor(pz) + 1; tz++) {
        if (water.has(key(tx, tz))) continue;
        const dx = Math.max(tx - px, 0, px - (tx + 1));
        const dz = Math.max(tz - pz, 0, pz - (tz + 1));
        d = Math.min(d, Math.hypot(dx, dz));
      }
    }
    return 1 - Math.min(d / 0.9, 1);
  };
  const pos: number[] = [];
  const shallow: number[] = [];
  const index: number[] = [];
  const Y = 0.02;
  for (const t of tiles) {
    const base = pos.length / 3;
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= 2; i++) {
        const x = t.x + i / 2;
        const z = t.y + j / 2;
        pos.push(x, Y, z);
        shallow.push(shallowAt(x, z));
      }
    }
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const a = base + j * 3 + i;
        index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aShallow", new THREE.Float32BufferAttribute(shallow, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Instanced boxes from a list of matrices (re-uploaded when the list changes). */
function Boxes({ list, material, shadow }: { list: THREE.Matrix4[]; material: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [list, invalidate]);
  const cap = Math.max(1, list.length);
  return <instancedMesh key={cap} ref={ref} args={[BOX, material, cap]} castShadow={shadow} receiveShadow raycast={() => null} />;
}

/** Water tiles joined into ponds and lakes, edged by a grassy bank with rocks and reeds on sides without water. */
function Water({ tiles }: { tiles: Lot[] }) {
  const { invalidate } = useThree();
  const geometry = useMemo(() => waterGeometry(tiles), [tiles]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const bank = useMemo(() => {
    const set = new Set(tiles.map((t) => key(t.x, t.y)));
    const banks: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const darkRocks: THREE.Matrix4[] = [];
    const reeds: THREE.Matrix4[] = [];
    const tips: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y + sy / 2, z), rot ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot) : q, new THREE.Vector3(sx, sy, sz));
    const W = 0.13; // bank width
    for (const t of tiles) {
      const s = roadShape(t.x, t.y, set);
      // Each open side: [along-x?, fixed coordinate of the bank's centre line]
      const sides: [boolean, number, number][] = [];
      if (!s.n) sides.push([true, t.y + W / 2, 0]);
      if (!s.s) sides.push([true, t.y + 1 - W / 2, 1]);
      if (!s.w) sides.push([false, t.x + W / 2, 2]);
      if (!s.e) sides.push([false, t.x + 1 - W / 2, 3]);
      for (const [alongX, c, side] of sides) {
        banks.push(alongX ? box(t.x + 0.5, 0, c, 1, 0.035, W) : box(c, 0, t.y + 0.5, W, 0.035, 1));
        // 0–2 rocks and 0–2 reed clumps per side, placed by the tile's hash so they stay put.
        for (let k = 0; k < 4; k++) {
          const h = tileHash(t.x * 4 + side, t.y * 4 + k, 31);
          const along = 0.12 + tileHash(t.x, t.y * 7 + side * 3 + k, 32) * 0.76;
          const x = alongX ? t.x + along : c;
          const z = alongX ? c : t.y + along;
          if (k < 2 && h < 0.55) {
            const sz = 0.05 + tileHash(t.y, t.x + k, 33) * 0.06;
            (h < 0.25 ? darkRocks : rocks).push(box(x, 0.02, z, sz * 1.3, sz * 0.8, sz, h * 6));
          } else if (k >= 2 && h < 0.5) {
            for (let r = 0; r < 3; r++) {
              const ox = (r - 1) * 0.025;
              const hgt = 0.1 + tileHash(t.x + r, t.y + k, 34) * 0.08;
              const rx = x + (alongX ? ox : 0);
              const rz = z + (alongX ? 0 : ox);
              reeds.push(box(rx, 0.02, rz, 0.012, hgt, 0.012));
              if (r === 1) tips.push(box(rx, 0.02 + hgt, rz, 0.022, 0.04, 0.022));
            }
          }
        }
      }
    }
    return { banks, rocks, darkRocks, reeds, tips };
  }, [tiles]);

  useFrame((_, delta) => {
    if (tiles.length === 0) return;
    waterTime.value += Math.min(delta, 0.05);
    if (motion.on) invalidate(); // keep the water moving
  });

  if (tiles.length === 0) return null;
  return (
    <>
      <mesh geometry={geometry} material={WATER_MATERIAL} raycast={() => null} />
      <Boxes list={bank.banks} material={WATER_PARTS.bank} />
      <Boxes list={bank.rocks} material={WATER_PARTS.rock} shadow />
      <Boxes list={bank.darkRocks} material={WATER_PARTS.rockDark} shadow />
      <Boxes list={bank.reeds} material={WATER_PARTS.reed} />
      <Boxes list={bank.tips} material={WATER_PARTS.reedTip} />
    </>
  );
}

const WILD = {
  rock: mat("#a8a29e"),
  rockDark: mat("#78716c"),
  tuft: mat("#65a30d"),
  bush: mat("#3f6212"),
  trunk: mat("#78350f"),
  crown: mat("#2f7d32"),
  pine: mat("#1f5f2a"),
};

/**
 * Undeveloped land: grass tufts, rocks and the odd wild bush, placed the same way every time (from the tile position).
 * Anything built on a tile clears it. Drawn as instanced meshes that ignore clicks.
 */
function Wilds({ size, occupied }: { size: number; occupied: Map<string, Lot> }) {
  const MARGIN = 10;
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const tuftRef = useRef<THREE.InstancedMesh>(null);
  const bushRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const pineRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const parts = useMemo(() => {
    const rock: THREE.Matrix4[] = [];
    const tuft: THREE.Matrix4[] = [];
    const bush: THREE.Matrix4[] = [];
    const trunk: THREE.Matrix4[] = [];
    const crown: THREE.Matrix4[] = [];
    const pine: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rot = 0) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(sx, sy, sz));
    for (let x = -MARGIN; x < size + MARGIN; x++) {
      for (let y = -MARGIN; y < size + MARGIN; y++) {
        const outside = x < 0 || y < 0 || x >= size || y >= size;
        if (outside) {
          // Beyond your land: woods that thin out near the hedge, with rocks in the clearings.
          const edge = Math.min(Math.abs(x < 0 ? x + 1 : x - size), Math.abs(y < 0 ? y + 1 : y - size), MARGIN);
          const near = x >= -1 && y >= -1 && x <= size && y <= size; // the strip right outside the hedge
          const r = tileHash(x, y, 7);
          const treeChance = near ? 0.12 : 0.28 + Math.min(0.3, edge * 0.04);
          if (r < treeChance) {
            const count = 1 + Math.floor(tileHash(x, y, 8) * 2);
            for (let i = 0; i < count; i++) {
              const tx = x + 0.2 + tileHash(x, y, 40 + i) * 0.6;
              const tz = y + 0.2 + tileHash(x, y, 50 + i) * 0.6;
              const sc = 0.8 + tileHash(x, y, 60 + i) * 0.7;
              trunk.push(m(tx, 0.09 * sc, tz, 0.08 * sc, 0.18 * sc, 0.08 * sc));
              if (tileHash(x, y, 70 + i) < 0.45) pine.push(m(tx, 0.42 * sc, tz, 0.34 * sc, 0.55 * sc, 0.34 * sc));
              else crown.push(m(tx, 0.34 * sc, tz, 0.36 * sc, 0.34 * sc, 0.36 * sc, tileHash(x, y, 80 + i) * 6));
            }
            continue;
          }
          if (r < treeChance + 0.08) {
            const sc = 0.08 + tileHash(x, y, 3) * 0.12;
            rock.push(m(x + 0.5, sc * 0.4, y + 0.5, sc * 1.3, sc, sc, tileHash(x, y, 4) * 6));
            continue;
          }
          const tufts = 1 + Math.floor(tileHash(x, y, 6) * 3);
          for (let i = 0; i < tufts; i++) {
            tuft.push(m(x + 0.15 + tileHash(x, y, 10 + i) * 0.7, 0.015, y + 0.15 + tileHash(x, y, 20 + i) * 0.7, 0.035, 0.08, 0.035, tileHash(x, y, 30 + i) * 6));
          }
          continue;
        }
        if (occupied.has(key(x, y))) continue;
        const r = tileHash(x, y);
        const jx = x + 0.2 + tileHash(x, y, 1) * 0.6;
        const jz = y + 0.2 + tileHash(x, y, 2) * 0.6;
        if (r < 0.14) {
          const sc = 0.07 + tileHash(x, y, 3) * 0.08;
          rock.push(m(jx, sc * 0.4, jz, sc * 1.3, sc, sc, tileHash(x, y, 4) * 6));
          if (tileHash(x, y, 5) < 0.5) rock.push(m(jx + 0.12, 0.025, jz + 0.08, 0.05, 0.04, 0.05, 1));
        } else if (r < 0.2) {
          bush.push(m(jx, 0.08, jz, 0.16, 0.13, 0.16));
        }
        // Grass tufts on most empty tiles.
        const tufts = Math.floor(tileHash(x, y, 6) * 3);
        for (let i = 0; i < tufts; i++) {
          tuft.push(m(x + 0.15 + tileHash(x, y, 10 + i) * 0.7, 0.035, y + 0.15 + tileHash(x, y, 20 + i) * 0.7, 0.03, 0.07, 0.03, tileHash(x, y, 30 + i) * 6));
        }
      }
    }
    return { rock, tuft, bush, trunk, crown, pine };
  }, [size, occupied]);
  useLayoutEffect(() => {
    for (const [ref, list] of [
      [rockRef, parts.rock],
      [tuftRef, parts.tuft],
      [bushRef, parts.bush],
      [trunkRef, parts.trunk],
      [crownRef, parts.crown],
      [pineRef, parts.pine],
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
  const none = () => null;
  return (
    <>
      <instancedMesh key={`r${cap(parts.rock.length)}`} ref={rockRef} args={[OCTA, WILD.rock, cap(parts.rock.length)]} castShadow raycast={none} />
      <instancedMesh key={`t${cap(parts.tuft.length)}`} ref={tuftRef} args={[TUFT, WILD.tuft, cap(parts.tuft.length)]} raycast={none} />
      <instancedMesh key={`b${cap(parts.bush.length)}`} ref={bushRef} args={[CROWN, WILD.bush, cap(parts.bush.length)]} castShadow raycast={none} />
      <instancedMesh key={`k${cap(parts.trunk.length)}`} ref={trunkRef} args={[TRUNK, WILD.trunk, cap(parts.trunk.length)]} raycast={none} />
      <instancedMesh key={`c${cap(parts.crown.length)}`} ref={crownRef} args={[CROWN, WILD.crown, cap(parts.crown.length)]} raycast={none} />
      <instancedMesh key={`p${cap(parts.pine.length)}`} ref={pineRef} args={[PINE_WILD, WILD.pine, cap(parts.pine.length)]} raycast={none} />
    </>
  );
}

const TUFT = new THREE.ConeGeometry(0.5, 1, 4);
const TRUNK = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const PINE_WILD = new THREE.ConeGeometry(0.5, 1, 6);

// ---------------------------------------------------------------------------
// Traffic: a few cars wander the road network, keeping to the right-hand lane.
// ---------------------------------------------------------------------------

