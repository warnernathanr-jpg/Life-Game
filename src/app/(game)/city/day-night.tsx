"use client";

// Day and night on the city clock: the sun crosses the sky, evening light warms and dims to a blue night, the sky color
// fades from the theme's sky to a night sky, and after dark building windows, shop lamps and street lights glow.
// No extra real lights at night (they're expensive on phones): windows and lamp heads glow through emissive materials,
// and street lights cast a soft additive pool of light on the road.
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { THEME_EVENT } from "@/lib/themes";
import { isRoadType, roadShape, type Lot } from "@/lib/roads";
import { mat, PALETTE } from "./models";

/** 1 in full daylight, 0 at night: dawn 5:30–7:00, dusk 18:00–19:30 (minutes since midnight). */
export function daylight(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440;
  const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (m - a) / (b - a)));
  if (m < 12 * 60) return ramp(5.5 * 60, 7 * 60);
  return 1 - ramp(18 * 60, 19.5 * 60);
}

/** Warm golden light near sunrise and sunset (0 … 1). */
function golden(minutes: number): number {
  const m = ((minutes % 1440) + 1440) % 1440;
  const near = (c: number) => Math.max(0, 1 - Math.abs(m - c) / 75);
  return Math.max(near(6.6 * 60), near(18.6 * 60));
}

// Window glass colors used by the models, and lamp heads; they glow at night.
const WINDOWS = ["#93c5fd", "#bfdbfe", "#bae6fd", "#7dd3fc"];
const LAMPS = ["#fef3c7"];
/** Car taillights (a red no model uses for anything else). */
export const TAIL_COLOR = "#c81e1e";
const NIGHT_SKY = new THREE.Color("#0b1230");
const WARM = new THREE.Color("#ffd27a");
const SUN_DAY = new THREE.Color("#ffffff");
const SUN_GOLD = new THREE.Color("#ffb067");
const MOON = new THREE.Color("#9db4ff");
const SKY_DAY = new THREE.Color("#e0f2fe");
const SKY_NIGHT = new THREE.Color("#6f83c4");
const GROUND_DAY = new THREE.Color("#4d7c0f");
const GROUND_NIGHT = new THREE.Color("#1e2a3a");

/** The ground's tile grid: lines are unlit, so they fade at night instead of glowing. */
export const GRID_MAT = new THREE.LineBasicMaterial({ color: "#7cb342", transparent: true, opacity: 0.55 });

function setGlow(night: number) {
  GRID_MAT.opacity = 0.55 * (1 - 0.8 * night);
  // Glass towers and shop fronts (the shiny "metal" glass only; the same colors are used matte elsewhere, e.g. grass):
  // a softer glow, since whole facades are glass.
  for (const [main, top] of PALETTE.glass) {
    for (const c of [main, top]) {
      const m = mat(c, { metal: true });
      m.emissive.copy(WARM);
      m.emissiveIntensity = night * 0.22;
    }
  }
  for (const c of WINDOWS) {
    const m = mat(c);
    m.emissive.copy(WARM);
    m.emissiveIntensity = night * 0.9;
  }
  const tail = mat(TAIL_COLOR);
  tail.emissive.set("#ff2a2a");
  tail.emissiveIntensity = night * 1.4;
  for (const c of LAMPS) {
    const m = mat(c);
    m.emissive.set("#ffe7a3");
    m.emissiveIntensity = night * 1.6;
  }
}

/** The sun / moon and sky light, and the background color, for the time `minutes`. */
export function DayNight({ minutes, size }: { minutes: number; size: number }) {
  const { gl, invalidate } = useThree();
  const [themeSky, setThemeSky] = useState("#1b2a55");
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    const read = () => setThemeSky(getComputedStyle(document.documentElement).getPropertyValue("--t-sky").trim() || "#1b2a55");
    read();
    window.addEventListener(THEME_EVENT, read);
    return () => window.removeEventListener(THEME_EVENT, read);
  }, []);

  const day = daylight(minutes);
  const gold = golden(minutes);
  // Sun from the east (morning) over the top to the west (evening); at night a fixed moon.
  const t = Math.min(1, Math.max(0, (((minutes % 1440) + 1440) % 1440 - 6 * 60) / (13.5 * 60)));
  const angle = Math.PI * t;
  const c = size / 2;
  const sunPos: [number, number, number] =
    day > 0 ? [c + Math.cos(angle) * (size * 0.6 + 8), 6 + Math.sin(angle) * 16, c - 6] : [c - 8, 16, c + 4];

  useLayoutEffect(() => {
    const night = 1 - day;
    gl.setClearColor(new THREE.Color(themeSky).lerp(NIGHT_SKY, night * 0.85));
    if (hemi.current) {
      hemi.current.intensity = 0.55 + 0.55 * day;
      hemi.current.color.copy(SKY_NIGHT).lerp(SKY_DAY, day);
      hemi.current.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, day);
    }
    if (sun.current) {
      sun.current.intensity = day > 0 ? 0.45 + 1.15 * day : 0.45;
      sun.current.color.copy(day > 0 ? SUN_DAY.clone().lerp(SUN_GOLD, gold) : MOON);
    }
    setGlow(night);
    invalidate();
  }, [day, gold, themeSky, gl, invalidate]);

  return (
    <>
      <hemisphereLight ref={hemi} args={["#e0f2fe", "#4d7c0f", 1.1]} />
      <directionalLight
        ref={sun}
        position={sunPos}
        intensity={1.6}
        castShadow
        shadow-mapSize={typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
        target-position={[c, 0, c]}
      />
    </>
  );
}

const POLE = new THREE.CylinderGeometry(0.012, 0.016, 1, 6);
const HEAD = new THREE.BoxGeometry(1, 1, 1);
const POOL = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const POLE_MAT = new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.6, metalness: 0.3 });
/** A soft round pool of light: bright in the middle, fading to nothing at the edge. */
function poolTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const POOL_MAT = new THREE.MeshBasicMaterial({ color: "#ffcf73", map: poolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

/**
 * Street lights along roads (not dirt roads or bridges): every other tile of a straight stretch or a corner, on the
 * curb, alternating sides. Their heads glow after dark and light a pool on the road.
 */
export function StreetLights({ lots, roads, minutes }: { lots: Lot[]; roads: Set<string>; minutes: number }) {
  const spots = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (const t of lots) {
      if (!isRoadType(t.type_id) || t.type_id === "dirt_road" || t.type_id === "bridge") continue;
      const s = roadShape(t.x, t.y, roads);
      const n = [s.n, s.s, s.e, s.w].filter(Boolean).length;
      if (n > 2) continue; // not in junctions
      const alongX = s.e || s.w;
      if (alongX && (t.x % 2 !== 0)) continue;
      if (!alongX && (t.y % 2 !== 0)) continue;
      const flip = (alongX ? t.x / 2 : t.y / 2) % 2 === 0 ? 1 : -1;
      const off = 0.43 * flip;
      out.push(alongX ? { x: t.x + 0.5, z: t.y + 0.5 + off } : { x: t.x + 0.5 + off, z: t.y + 0.5 });
    }
    return out;
  }, [lots, roads]);

  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const night = 1 - daylight(minutes);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach((p, i) => {
      poles.current?.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 0.2, p.z), q, new THREE.Vector3(1, 0.4, 1)));
      heads.current?.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 0.41, p.z), q, new THREE.Vector3(0.06, 0.025, 0.06)));
      pools.current?.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, 0.035, p.z), q, new THREE.Vector3(0.38, 1, 0.38)));
    });
    for (const r of [poles, heads, pools]) {
      if (!r.current) continue;
      r.current.count = spots.length;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
    invalidate();
  }, [spots, invalidate]);

  useLayoutEffect(() => {
    const dark = Math.max(0, (night - 0.4) / 0.6);
    POOL_MAT.opacity = 0.55 * dark;
    POOL_MAT.visible = dark > 0.02;
    invalidate();
  }, [night, invalidate]);

  if (spots.length === 0) return null;
  const cap = spots.length;
  return (
    <group>
      <instancedMesh key={`p${cap}`} ref={poles} args={[POLE, POLE_MAT, cap]} castShadow raycast={() => null} />
      <instancedMesh key={`h${cap}`} ref={heads} args={[HEAD, mat("#fef3c7"), cap]} raycast={() => null} />
      <instancedMesh key={`g${cap}`} ref={pools} args={[POOL, POOL_MAT, cap]} raycast={() => null} renderOrder={2} />
    </group>
  );
}
