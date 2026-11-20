"use client";

import { FIXED_COLOR_IDS } from "./models";

import {
  Ban,
  Car,
  Eye,
  EyeOff,
  UserPlus,
  ChartColumn,
  Flame,
  GraduationCap,
  HeartPulse,
  Layers,
  ShieldAlert,
  Factory as FactoryIcon,
  Gem as GemIcon,
  TrafficCone,
  Footprints,
  House,
  Maximize2,
  MousePointer2, Undo2,
  Music,
  VolumeX,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Pause,
  Siren,
  Play,
  RotateCw,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { BulldozeIcon, CoinIcon } from "@/components/icons";
import { cityExposure, computeLayer, LAYERS, type LayerId } from "@/lib/layers";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  BuildingTypeRow,
  PlacedBuildingRow,
  ProgressRow,
  RoadControlKind,
} from "@/lib/database.types";
import {
  MAX_CITY_SIZE,
  MAX_STROKE_TILES,
  ROAD_CONTROLS,
  cityStats,
  controlByType,
  milestoneFor,
  footprint,
  formatCoins,
  landPrice,
  lotFree,
  NEEDS_WATER,
  touchesWater,
  pointsToUnlock,
  roadControlTypes,
  sellRefund,
} from "@/lib/game";
import {
  BRIDGE_TYPE,
  ROAD_TIERS,
  connectedIds,
  isRoadType,
  key,
  nextFacing,
  roadSet,
  streetOf,
  strokePath,
  touchesRoad,
  type Lot,
  type Tile,
} from "@/lib/roads";
import { startMusic, stopMusic } from "@/lib/music";
import { playSfx, type Sfx } from "@/lib/sfx";
import type { TutorialState } from "@/lib/tutorial";
import { TutorialCoach } from "./tutorial-coach";
import {
  buyBuilding,
  buyLand,
  buyTiles,
  shiftCity,
  claimCityMilestone,
  moveBuilding,
  placeLandmark,
  placeRoadControl,
  recordInviteShared,
  removeRoadControl,
  sellBuilding,
  sellMany,
  setBuildingColor,
  setFacing,
  upgradeBuilding,
} from "../actions";
import type { City3DHandle } from "./city-3d";
import { useConfirm } from "@/components/confirm";
import { citizensFrom, placesFrom, roleText } from "@/lib/sim";
import { BuildOverlay } from "./build-overlay";
import type { CitizenInfo } from "./traffic";
import {
  CityName,
  CityStatsPanel,
  MilestonesPanel,
  SelectedPanel,
} from "./panels";

// three.js only loads on this page, in the browser.
const City3D = dynamic(() => import("./city-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      Loading 3D city…
    </div>
  ),
});

type Placed = Pick<
  PlacedBuildingRow,
  "id" | "type_id" | "x" | "y" | "price_paid" | "facing"
> & { rotated?: boolean; color_seed?: number | null };
/** Tiles painted by dragging: roads and landscaping. */
const PAINT_TYPES = ["dirt_road", "road", "avenue", "tree", "water"] as const;
type PaintType = (typeof PAINT_TYPES)[number];
const isPaint = (id: string): id is PaintType =>
  (PAINT_TYPES as readonly string[]).includes(id);

/** Icons for the map layers. */
function LayerIcon({ id }: { id: LayerId | null }) {
  const Icon =
    id === "traffic"
      ? TrafficCone
      : id === "fire"
        ? Flame
        : id === "crime"
          ? ShieldAlert
          : id === "education"
            ? GraduationCap
            : id === "health"
              ? HeartPulse
              : id === "pollution"
                ? FactoryIcon
                : id === "land_value"
                  ? GemIcon
                  : Ban;
  return <Icon className="inline size-4 shrink-0" aria-hidden />;
}

/** Load a page fresh (deliberately not client-side navigation: see enterFull). */
function hardNavigate(path: string) {
  window.location.assign(new URL(path, window.location.origin).href);
}

export type Mode =
  | { kind: "idle" }
  | { kind: "place"; typeId: string }
  | { kind: "selected"; id: string }
  | { kind: "move"; id: string }
  | { kind: "paint"; typeId: PaintType }
  | { kind: "bulldoze" }
  | { kind: "shift" }
  | { kind: "control"; control: RoadControlKind };

export function CityBoard(props: {
  cityName: string;
  size: number;
  landPurchases: number;
  placed: Placed[];
  /** Population milestones whose bonus has been collected. */
  claimedMilestones?: number[];
  /** Stop signs and traffic lights on crossings. */
  controls?: { x: number; y: number; kind: RoadControlKind }[];
  types: BuildingTypeRow[];
  progress: ProgressRow | null;
  balance: number;
  /** Building picked in the Shop (?place=…), placed right away if it's unlocked. */
  initialPlace?: string;
  /** The full-screen page (/play): only the map, with the build bar over it. */
  standalone?: boolean;
  /** Getting started guide state (full screen only; null when finished, skipped or claimed). */
  tutorial?: TutorialState | null;
  /** Visiting a friend's city: look around only (no building, selling or selecting). */
  visit?: { owner: string | null; inviteUrl: string };
}) {
  const { size, placed, types, progress, balance } = props;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const lots: (Lot & { price_paid: number })[] = useMemo(
    () =>
      placed.map((b) => ({
        ...b,
        ...footprint(typeById.get(b.type_id), b.rotated),
      })),
    [placed, typeById],
  );
  const roads = useMemo(() => roadSet(lots), [lots]);
  const controls = useMemo(
    () => new Map((props.controls ?? []).map((c) => [key(c.x, c.y), c.kind])),
    [props.controls],
  );
  // Crossings: road tiles (not bridges) where 3 or 4 roads meet; the only places for stop signs and lights.
  const crossings = useMemo(() => {
    const out = new Set<string>();
    for (const l of lots) {
      if (!isRoadType(l.type_id) || l.type_id === BRIDGE_TYPE) continue;
      let n = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (roads.has(key(l.x + dx, l.y + dy))) n++;
      if (n >= 3) out.add(key(l.x, l.y));
    }
    return out;
  }, [lots, roads]);
  const menuTypes = useMemo(() => [...types, ...roadControlTypes()], [types]);

  // Buildings (not roads or landscaping) without a road beside them.
  const needsRoad = useMemo(() => {
    const connected = connectedIds(lots);
    return new Set(
      lots
        .filter((l) => {
          const c = typeById.get(l.type_id)?.category;
          return c !== "road" && c !== "landscape" && !connected.has(l.id);
        })
        .map((l) => l.id),
    );
  }, [lots, typeById]);
  const occupant = useMemo(() => {
    const map = new Map<string, (typeof lots)[number]>();
    for (const b of lots)
      for (let dx = 0; dx < b.w; dx++)
        for (let dy = 0; dy < b.h; dy++) map.set(key(b.x + dx, b.y + dy), b);
    return map;
  }, [lots]);

  const [mode, setMode] = useState<Mode>(() => {
    const t = props.initialPlace
      ? types.find((x) => x.id === props.initialPlace)
      : undefined;
    if (!t || pointsToUnlock(t, progress) > 0) return { kind: "idle" };
    return isPaint(t.id)
      ? { kind: "paint", typeId: t.id }
      : { kind: "place", typeId: t.id };
  });
  const [message, setMessage] = useState<{
    text: string;
    tone: "good" | "bad";
  } | null>(null);
  const [stroke, setStroke] = useState<Tile[] | null>(null);
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  // Previews waiting for Confirm: a spot for a building being placed or moved, tiles being painted.
  const [draftSpot, setDraftSpot] = useState<Tile | null>(null);
  /** Scenic view: only the city, no menus or grid lines. */
  const [scenic, setScenic] = useState(false);
  useEffect(() => {
    if (!scenic) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation(); // just leave the scenic view, not full screen
      setScenic(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [scenic]);
  // Road / trees / water preview, built up stretch by stretch: on a phone by tapping points (each tap draws from the pin to the
  // tapped tile), with a mouse also by dragging. Undo takes back the last stretch.
  const [segments, setSegments] = useState<{ tiles: Tile[]; prevAnchor: Tile | null }[]>([]);
  const [anchor, setAnchor] = useState<Tile | null>(null);
  const draftTiles = useMemo(() => segments.flatMap((sg) => sg.tiles), [segments]);
  const clearDraft = () => {
    setSegments([]);
    setAnchor(null);
  };
  const [draftRot, setDraftRot] = useState(false);
  const modeKey =
    mode.kind === "paint"
      ? `paint:${mode.typeId}`
      : mode.kind === "place"
        ? `place:${mode.typeId}`
        : mode.kind === "move"
          ? `move:${mode.id}`
          : mode.kind === "control"
            ? `control:${mode.control}`
            : mode.kind;
  const [draftFor, setDraftFor] = useState(modeKey);
  if (draftFor !== modeKey) {
    // Switching tools or buildings drops the preview.
    setDraftFor(modeKey);
    setDraftSpot(null);
    clearDraft();
    setDraftRot(
      mode.kind === "move"
        ? !!placed.find((b) => b.id === mode.id)?.rotated
        : false,
    );
  }

  // The living city: named citizens who commute, shop and visit parks (see src/lib/sim.ts).
  const places = useMemo(() => placesFrom(lots, types), [lots, types]);
  const citizens = useMemo(() => citizensFrom(places), [places]);
  const placeById = useMemo(
    () => new Map(places.map((p) => [p.id, p])),
    [places],
  );
  // Pollution at homes and traffic jams lower happiness (same models as the map layers).
  const exposure = useMemo(
    () =>
      cityExposure(lots, types, {
        size,
        places,
        citizens,
        connected: connectedIds(lots),
        controls,
      }),
    [lots, types, size, places, citizens, controls],
  );
  const stats = useMemo(
    () => cityStats(placed, types, progress, exposure),
    [placed, types, progress, exposure],
  );
  const [paused, setPaused] = useState(false);
  // Fires and break-ins (emergencies.tsx): the latest line, cleared after a while.
  const [news, setNews] = useState<string | null>(null);
  const newsTimer = useRef<number | null>(null);
  const onNews = useCallback((text: string | null) => {
    setNews(text);
    if (newsTimer.current) window.clearTimeout(newsTimer.current);
    if (text) newsTimer.current = window.setTimeout(() => setNews(null), 9000);
  }, []);
  // Background music in full screen: off until turned on; the choice is remembered on this device.
  const [music, setMusic] = useState(false);
  useEffect(() => {
    if (!props.standalone) return;
    let saved = false;
    try {
      saved = localStorage.getItem("lifecity.music") === "on";
    } catch {}
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMusic(true);
  }, [props.standalone]);
  useEffect(() => {
    if (!music) return;
    // Browsers only allow sound after a tap: try now, and again on the first tap.
    const play = () => {
      if (document.visibilityState === "visible") startMusic();
    };
    play();
    const onVisible = () =>
      document.visibilityState === "visible" ? startMusic() : stopMusic();
    window.addEventListener("pointerdown", play, { once: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pointerdown", play);
      document.removeEventListener("visibilitychange", onVisible);
      stopMusic();
    };
  }, [music]);
  function toggleMusic() {
    const next = !music;
    if (next) startMusic(); // inside the tap, so the browser lets it play
    setMusic(next);
    try {
      localStorage.setItem("lifecity.music", next ? "on" : "off");
    } catch {}
  }

  const [citizenId, setCitizenId] = useState<string | null>(null);
  const [citizenInfo, setCitizenInfo] = useState<CitizenInfo | null>(null);
  // Map layers (full screen): which one is shown, and whether the list is open.
  const [layer, setLayer] = useState<LayerId | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const layerCells = useMemo(
    () =>
      layer
        ? computeLayer(layer, lots, types, {
            size,
            places,
            citizens,
            connected: connectedIds(lots),
            controls,
          })
        : null,
    [layer, lots, types, size, places, citizens],
  );
  const layerInfo = LAYERS.find((l) => l.id === layer);
  const sim = useMemo(
    () => ({
      places,
      citizens,
      paused,
      selectedId: citizenId,
      onSelect: (id: string | null) => {
        setCitizenId(id);
        if (id) setMode({ kind: "idle" });
      },
      onInfo: setCitizenInfo,
      onClock: () => {}, // the clock runs inside the simulation only; it isn't shown
      onNews,
    }),
    [places, citizens, paused, citizenId, onNews],
  );
  const city3d = useRef<City3DHandle>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  // A soft click for every button tapped over the full-screen map. "click" (not pointerdown) so starting to scroll the build
  // menu with a finger makes no sound: only a real tap does.
  useEffect(() => {
    const box = mapBox.current;
    if (!box || !props.standalone) return;
    const onTap = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName === "CANVAS") return; // a tap on the map isn't a button press
      const b = target.closest("button");
      if (b && !b.disabled && box.contains(b)) playSfx("click");
    };
    box.addEventListener("click", onTap, true);
    return () => box.removeEventListener("click", onTap, true);
  }, [props.standalone]);
  // City Stats as a panel over the map in full screen.
  const [statsOpen, setStatsOpen] = useState(false);
  // Full screen is its own page (/play) showing only the map, so it opens the same way every time.
  const full = !!props.standalone;
  const fullRef = useRef(full);
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    fullRef.current = full;
    modeRef.current = mode;
  });

  // A full page load (not client navigation), so the city page isn't kept alive in the background with a second 3D view.
  function enterFull() {
    hardNavigate("/play");
  }
  function exitFull() {
    hardNavigate(props.visit ? "/friends" : "/city");
  }
  async function invite() {
    if (!props.visit) return;
    const url = props.visit.inviteUrl;
    const text =
      "I'm building a city by getting things done in LifeCity. Come build yours and add me as a friend!";
    try {
      if (navigator.share) {
        await navigator.share({ title: "LifeCity", text, url });
        void recordInviteShared();
        return;
      }
    } catch {
      return; // share sheet closed
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      void recordInviteShared();
      say("Invite link copied. Paste it to a friend.");
    } catch {
      say(url);
    }
  }

  const placingType =
    mode.kind === "place" ? typeById.get(mode.typeId) : undefined;
  const paintType =
    mode.kind === "paint" ? typeById.get(mode.typeId) : undefined;
  const movingLot =
    mode.kind === "move" ? lots.find((b) => b.id === mode.id) : undefined;
  const selected =
    mode.kind === "selected" ? lots.find((b) => b.id === mode.id) : undefined;
  // Footprint of what's being placed or moved, turned or not (rectangles can be turned before confirming).
  const draftDims = placingType
    ? footprint(placingType, draftRot)
    : movingLot
      ? footprint(typeById.get(movingLot.type_id), draftRot)
      : null;
  const canTurn = !!draftDims && draftDims.w !== draftDims.h;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Escape first stops what you're doing, then leaves full screen.
      if (modeRef.current.kind === "idle" && fullRef.current)
        hardNavigate("/city");
      else setMode({ kind: "idle" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (
      (mode.kind === "selected" || mode.kind === "move") &&
      !lots.some((b) => b.id === mode.id)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode({ kind: "idle" });
    }
  }, [lots, mode]);

  // Move city: how far everything built is from each edge of the land, and sliding it one tile.
  const edges = useMemo(() => {
    if (lots.length === 0) return null;
    const minX = Math.min(...lots.map((l) => l.x));
    const minY = Math.min(...lots.map((l) => l.y));
    const maxX = Math.max(...lots.map((l) => l.x + l.w));
    const maxY = Math.max(...lots.map((l) => l.y + l.h));
    return { left: minX, top: minY, right: size - maxX, bottom: size - maxY };
  }, [lots, size]);
  const shiftingRef = useRef(false);
  const shift = useCallback(
    (dx: number, dy: number) => {
      if (shiftingRef.current || !edges) return;
      const room =
        dx < 0
          ? edges.left
          : dx > 0
            ? edges.right
            : dy < 0
              ? edges.top
              : edges.bottom;
      if (room <= 0) return;
      shiftingRef.current = true;
      start(async () => {
        const r = await shiftCity(dx, dy);
        shiftingRef.current = false;
        if (!r.ok) setMessage({ text: r.error, tone: "bad" });
      });
    },
    [edges],
  );
  useEffect(() => {
    if (mode.kind !== "shift") return;
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    function onKey(e: KeyboardEvent) {
      const d = dirs[e.key];
      if (!d) return;
      e.preventDefault();
      shift(d[0], d[1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode.kind, shift]);

  function say(text: string, tone: "good" | "bad" = "good", sound?: Sfx) {
    setMessage({ text, tone });
    if (sound) playSfx(sound);
  }

  /** Paint stroke: tiles that would be added (tiles already of that type are skipped), and whether it can be done. */
  function planPaint(tiles: Tile[], typeId: PaintType) {
    const cost1 = typeById.get(typeId)?.cost ?? 0;
    const at = (t: Tile) => occupant.get(key(t.x, t.y))?.type_id;
    const road = isRoadType(typeId);
    // A bridge already is road (of any kind) and already is water.
    const fresh = tiles.filter(
      (t) =>
        at(t) !== typeId &&
        !(at(t) === BRIDGE_TYPE && (road || typeId === "water")),
    );
    // Roads drawn over water become bridges; over another kind of road they replace it; trees are cleared.
    const bridges = road ? fresh.filter((t) => at(t) === "water").length : 0;
    const swaps = road
      ? fresh.filter(
          (t) => at(t) !== undefined && at(t) !== "water" && isRoadType(at(t)!),
        ).length
      : 0;
    const trees = fresh.filter((t) => at(t) === "tree").length;
    const free = (t: Tile) => {
      const here = at(t);
      return (
        here === undefined ||
        here === "tree" ||
        (road && (here === "water" || isRoadType(here)))
      );
    };
    const blocked = fresh.some(
      (t) => !free(t) || t.x < 0 || t.y < 0 || t.x >= size || t.y >= size,
    );
    // Roads can't run side by side: no 2x2 block of road tiles may include a new tile (the database checks too).
    let sideBySide = false;
    if (road && fresh.length > 0) {
      const all = new Set([...roads, ...fresh.map((t) => key(t.x, t.y))]);
      sideBySide = fresh.some((t) =>
        [
          [0, 0],
          [-1, 0],
          [0, -1],
          [-1, -1],
        ].some(([dx, dy]) =>
          [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].every(([ex, ey]) => all.has(key(t.x + dx + ex, t.y + dy + ey))),
        ),
      );
    }
    const cost =
      (fresh.length - bridges) * cost1 +
      bridges * (typeById.get(BRIDGE_TYPE)?.cost ?? 0);
    return {
      fresh,
      bridges,
      swaps,
      trees,
      blocked,
      sideBySide,
      cost,
      ok:
        !blocked &&
        !sideBySide &&
        cost <= balance &&
        fresh.length <= MAX_STROKE_TILES,
    };
  }
  function planDemolish(tiles: Tile[]) {
    const ids = [
      ...new Set(
        tiles
          .map((t) => occupant.get(key(t.x, t.y))?.id)
          .filter(Boolean) as string[],
      ),
    ];
    // Bridges go back to water with nothing back.
    const refund = ids.reduce((s, id) => {
      const l = lots.find((x) => x.id === id);
      return (
        s + (l && l.type_id !== BRIDGE_TYPE ? sellRefund(l.price_paid) : 0)
      );
    }, 0);
    return { ids, refund };
  }

  // Building is two steps: tap (or drag) shows a preview, then Confirm builds it. Nothing is bought by accident
  // (e.g. while zooming with two fingers).
  function onTile(x: number, y: number) {
    if (scenic) return setScenic(false); // a tap on the map leaves the scenic view
    if (props.visit || mode.kind === "shift") return; // just looking / moving the whole city
    if (mode.kind === "paint") return onStroke([{ x, y }]);
    if (mode.kind === "control") return void putControl(x, y, mode.control);
    if (mode.kind === "place" || mode.kind === "move") {
      // The preview goes where you tap (centred on it, kept on your land), even if it doesn't fit there: it shows red, and
      // you drag or turn it until it turns green. Build only works when it fits.
      if (!draftDims) return;
      setMessage(null);
      setDraftSpot(clampSpot(x - Math.floor((draftDims.w - 1) / 2), y - Math.floor((draftDims.h - 1) / 2)));
      return;
    }
    if (pending) return;
    if (mode.kind === "bulldoze") return onStroke([{ x, y }]);
    const b = occupant.get(key(x, y));
    setCitizenId(null);
    setMode(b ? { kind: "selected", id: b.id } : { kind: "idle" });
  }

  const draftTypeId = placingType?.id ?? movingLot?.type_id ?? null;
  /** Free of other things and inside your land. */
  function freeAt(x: number, y: number, dims = draftDims) {
    return !!dims && lotFree(size, { x, y, ...dims }, lots, movingLot?.id);
  }
  /** Free, and beside water for a beach. */
  function fitsAt(x: number, y: number, dims = draftDims) {
    if (!dims || !freeAt(x, y, dims)) return false;
    return !draftTypeId || !NEEDS_WATER.has(draftTypeId) || touchesWater({ x, y, ...dims }, lots);
  }
  /** Keep a footprint on your land. */
  function clampSpot(x: number, y: number, dims = draftDims): Tile {
    const w = dims?.w ?? 1;
    const h = dims?.h ?? 1;
    return { x: Math.max(0, Math.min(size - w, x)), y: Math.max(0, Math.min(size - h, y)) };
  }


  /** Build the previewed building (or move it) where the preview is. */
  function confirmSpot() {
    if (!draftSpot || pending) return;
    const { x, y } = draftSpot;
    if (mode.kind === "place" && placingType) {
      if (!fitsAt(x, y))
        return say("It doesn't fit there yet. Drag it until it turns green.", "bad");
      if (milestoneFor(placingType.id)) {
        start(async () => {
          const r = await placeLandmark(placingType.id, x, y, draftRot);
          if (!r.ok) return say(r.error, "bad");
          say(
            `${placingType.name} built. Congratulations on your city!`,
            "good",
            "fanfare",
          );
          setMode({ kind: "idle" });
        });
        return;
      }
      if (balance < placingType.cost)
        return say("Not enough coins yet. Finish some tasks!", "bad");
      start(async () => {
        const r = await buyBuilding(placingType.id, x, y, draftRot);
        if (!r.ok) return say(r.error, "bad");
        const nearRoad = connectedIds([
          ...lots,
          { id: r.id, type_id: placingType.id, x, y, ...(draftDims ?? { w: 1, h: 1 }) },
        ]).has(r.id);
        say(
          `Built a ${placingType.name} for ${formatCoins(placingType.cost)} coins.${nearRoad ? "" : " It needs a road beside it to count."}`,
          "good",
          "build",
        );
        // One building per pick: back to looking around (no Cancel needed).
        setMode({ kind: "idle" });
      });
      return;
    }
    if (mode.kind === "move" && movingLot) {
      if (!fitsAt(x, y)) return say("It doesn't fit there yet. Drag it until it turns green.", "bad");
      start(async () => {
        const r = await moveBuilding(movingLot.id, x, y, draftRot);
        if (!r.ok) return say(r.error, "bad");
        say("Moved.", "good", "build");
        setMode({ kind: "selected", id: movingLot.id });
      });
    }
  }

  /** Buy the previewed road / trees / water tiles. */
  function confirmPaint() {
    if (mode.kind !== "paint" || !paintType || draftTiles.length === 0) return;
    const typeId = mode.typeId;
    const plan = planPaint(draftTiles, typeId);
    if (plan.fresh.length === 0) return clearDraft();
    if (plan.blocked)
      return say(
        `${paintType.name} can't go on top of buildings or past the edge of your land.`,
        "bad",
      );
    if (plan.sideBySide)
      return say(
        "Roads can't run side by side. Leave a tile between them, or join them at a crossing.",
        "bad",
      );
    if (plan.fresh.length > MAX_STROKE_TILES)
      return say(`Paint at most ${MAX_STROKE_TILES} tiles at a time.`, "bad");
    if (plan.cost > balance)
      return say(
        `That costs ${formatCoins(plan.cost)} coins. You have ${formatCoins(balance)}.`,
        "bad",
      );
    clearDraft();
    start(async () => {
      const r = await buyTiles(
        typeId,
        plan.fresh.map((t) => [t.x, t.y]),
      );
      if (!r.ok) return say(r.error, "bad");
      // Back to Select after building, so the next tap doesn't start drawing more (tap Roads again to draw more).
      setMode({ kind: "idle" });
      const notes = [
        plan.bridges > 0 &&
          `${plan.bridges} bridge${plan.bridges === 1 ? "" : "s"}`,
        plan.trees > 0 &&
          `${plan.trees} tree tile${plan.trees === 1 ? "" : "s"} cleared`,
      ].filter(Boolean);
      const what =
        typeId === "tree"
          ? `Planted ${r.built} tree${r.built === 1 ? "" : "s"}`
          : typeId === "water"
            ? `Dug ${r.built} water tile${r.built === 1 ? "" : "s"}`
            : `Built ${r.built} ${paintType.name.toLowerCase()} tile${r.built === 1 ? "" : "s"}`;
      say(
        `${what}${notes.length ? ` (${notes.join(", ")})` : ""} for ${formatCoins(r.cost)} coins.`,
        "good",
        "build",
      );
    });
  }

  function onStroke(tiles: Tile[]) {
    if (tiles.length === 0 || (pending && mode.kind === "bulldoze")) return;
    if (mode.kind === "paint" && paintType) {
      setMessage(null);
      const same = (a: Tile | null, b: Tile) => !!a && a.x === b.x && a.y === b.y;
      const seen = new Set(draftTiles.map((t) => key(t.x, t.y)));
      if (mode.typeId === "tree" || mode.typeId === "water") {
        // Trees and water fill the box dragged (like the bulldozer); a single tap adds or takes out one tile.
        if (tiles.length === 1 && seen.has(key(tiles[0].x, tiles[0].y))) {
          const t = tiles[0];
          setSegments((old) => old.map((sg) => ({ ...sg, tiles: sg.tiles.filter((x) => x.x !== t.x || x.y !== t.y) })).filter((sg) => sg.tiles.length));
          return;
        }
        setSegments((old) => [...old, { tiles: tiles.filter((t) => !seen.has(key(t.x, t.y))), prevAnchor: null }]);
        return;
      }
      if (tiles.length === 1) {
        const t = tiles[0];
        // Tapping the pin again ends this road (the next tap starts a new one).
        if (same(anchor, t)) return setAnchor(null);
        // Tapping a tile already in the preview: carry on (branch) from there.
        if (seen.has(key(t.x, t.y))) return setAnchor(t);
        // First tap: the start of a road. Later taps: draw from the pin to here.
        const add = anchor ? strokePath(anchor, t).filter((p) => !seen.has(key(p.x, p.y))) : [t];
        setSegments((old) => [...old, { tiles: add, prevAnchor: anchor }]);
        setAnchor(t);
        return;
      }
      // A dragged stroke (mouse): add it as one stretch and carry on from its end.
      setSegments((old) => [...old, { tiles: tiles.filter((t) => !seen.has(key(t.x, t.y))), prevAnchor: anchor }]);
      setAnchor(tiles[tiles.length - 1]);
      return;
    }
    if (mode.kind === "bulldoze") {
      const { ids, refund } = planDemolish(tiles);
      if (ids.length === 0) return say("Nothing to demolish there.");
      if (ids.length > MAX_STROKE_TILES)
        return say(
          `Demolish at most ${MAX_STROKE_TILES} items at a time. Drag a smaller box.`,
          "bad",
        );
      const what =
        ids.length === 1
          ? `this ${typeById.get(lots.find((l) => l.id === ids[0])!.type_id)?.name ?? "item"}`
          : `these ${ids.length} items`;
      void confirm({
        title: `Demolish ${what}?`,
        message:
          refund > 0
            ? `You get ${formatCoins(refund)} coins back.`
            : "You don't get any coins back.",
        confirmLabel: "Demolish",
        tone: "danger",
      }).then((ok) => {
        if (!ok) return;
        start(async () => {
          const r = await sellMany(ids);
          if (!r.ok) return say(r.error, "bad");
          say(
            `Demolished ${r.sold} item${r.sold === 1 ? "" : "s"}. +${formatCoins(r.refund)} coins back.`,
            "good",
            "demolish",
          );
        });
      });
    }
  }

  async function sell(b: (typeof lots)[number]) {
    const t = typeById.get(b.type_id);
    const isBridge = b.type_id === BRIDGE_TYPE;
    const refund = isBridge ? 0 : sellRefund(b.price_paid);
    const ok = await confirm(
      isBridge
        ? {
            title: "Take down this bridge?",
            message: "The tile goes back to water.",
            confirmLabel: "Take down",
            tone: "danger",
          }
        : {
            title: `Demolish this ${t?.name ?? "building"}?`,
            message:
              refund > 0
                ? `You get ${formatCoins(refund)} coins back (half of what you paid).`
                : "You don't get any coins back.",
            confirmLabel: "Demolish",
            tone: "danger",
          },
    );
    if (!ok) return;
    start(async () => {
      const r = await sellBuilding(b.id);
      if (!r.ok) return say(r.error, "bad");
      say(
        `Demolished. +${formatCoins(r.refund)} coins back.`,
        "good",
        "demolish",
      );
      setMode({ kind: "idle" });
    });
  }

  function rotate(b: (typeof lots)[number]) {
    const next = nextFacing(b, roads);
    if (!next) return;
    start(async () => {
      const r = await setFacing(b.id, next);
      if (!r.ok) return say(r.error, "bad");
    });
  }

  /** The next upgrade for a building (if any), its price and why it can't happen yet. */
  function upgradeInfo(b: (typeof lots)[number]) {
    const from = typeById.get(b.type_id);
    const to = from?.upgrades_to ? typeById.get(from.upgrades_to) : undefined;
    if (!from || !to) return undefined;
    const cost = Math.max(0, to.cost - b.price_paid);
    const pts = pointsToUnlock(to, progress);
    let room = to.size <= from.size;
    for (let dy = 0; !room && dy <= to.size - from.size; dy++) {
      for (let dx = 0; !room && dx <= to.size - from.size; dx++) {
        if (
          lotFree(
            size,
            { x: b.x - dx, y: b.y - dy, w: to.w, h: to.d },
            lots,
            b.id,
          )
        )
          room = true;
      }
    }
    const blocked =
      pts > 0
        ? `Needs ${pts} more ${to.unlock_area ? to.unlock_area[0].toUpperCase() + to.unlock_area.slice(1) : ""} points.`
        : !room
          ? `Needs a free ${to.size}×${to.size} lot including this spot.`
          : balance < cost
            ? `${formatCoins(cost - balance)} more coins to go.`
            : undefined;
    return { to, cost, blocked };
  }

  function upgrade(b: (typeof lots)[number]) {
    const info = upgradeInfo(b);
    if (!info || info.blocked) return;
    start(async () => {
      const r = await upgradeBuilding(b.id);
      if (!r.ok) return say(r.error, "bad");
      say(
        `Upgraded to ${info.to.name} for ${formatCoins(r.cost)} coins.`,
        "good",
        "build",
      );
    });
  }

  /** Turn a rectangular building 90° where it stands (shifted by a tile if that's what it takes to fit). Free. */
  function turnInPlace(lot: Lot & { rotated?: boolean }) {
    const t = typeById.get(lot.type_id);
    if (!t) return;
    const rotated = !(lot as { rotated?: boolean }).rotated;
    const dims = footprint(t, rotated);
    // Anchors whose turned footprint still covers part of the old one, nearest first.
    const options: Tile[] = [];
    for (let dy = -(dims.h - 1); dy <= lot.h - 1; dy++)
      for (let dx = -(dims.w - 1); dx <= lot.w - 1; dx++)
        options.push({ x: lot.x + dx, y: lot.y + dy });
    options.sort(
      (a, b) =>
        Math.abs(a.x - lot.x) +
        Math.abs(a.y - lot.y) -
        (Math.abs(b.x - lot.x) + Math.abs(b.y - lot.y)),
    );
    const spot = options.find((o) =>
      lotFree(size, { x: o.x, y: o.y, ...dims }, lots, lot.id),
    );
    if (!spot)
      return say(
        "There isn't room to turn it here. Move it somewhere with more space.",
        "bad",
      );
    start(async () => {
      const r = await moveBuilding(lot.id, spot.x, spot.y, rotated);
      if (!r.ok) return say(r.error, "bad");
    });
  }

  // Milestone landmarks: free, one each, once the city has enough people.
  const placedTypes = useMemo(
    () => new Set(lots.map((l) => l.type_id)),
    [lots],
  );
  function landmarkState(t: BuildingTypeRow) {
    const m = milestoneFor(t.id);
    if (!m) return null;
    if (placedTypes.has(t.id))
      return { locked: true, note: "Already in your city" };
    // Once a milestone has been claimed its landmark stays unlocked, even if the population drops again.
    if (stats.population < m.population && !(props.claimedMilestones ?? []).includes(m.population))
      return {
        locked: true,
        note: `Reach ${formatCoins(m.population)} people`,
      };
    return {
      locked: false,
      note: `Your reward for reaching ${formatCoins(m.population)} people`,
    };
  }
  function claimMilestone(population: number) {
    start(async () => {
      const r = await claimCityMilestone(population);
      say(
        r.ok
          ? `+${formatCoins(r.coins)} coins for reaching ${formatCoins(population)} people!`
          : r.error,
        r.ok ? "good" : "bad",
        r.ok ? "fanfare" : undefined,
      );
    });
  }

  /** Put a stop sign or traffic light on a crossing (with a confirm). */
  async function putControl(x: number, y: number, kind: RoadControlKind) {
    const info = ROAD_CONTROLS.find((c) => c.kind === kind)!;
    if (!crossings.has(key(x, y)))
      return say(
        "Tap a highlighted crossing (where three or four roads meet).",
        "bad",
      );
    if (controls.get(key(x, y)) === kind)
      return say(`There's already a ${info.name.toLowerCase()} here.`, "bad");
    if (balance < info.cost)
      return say(
        `A ${info.name.toLowerCase()} costs ${formatCoins(info.cost)} coins. You have ${formatCoins(balance)}.`,
        "bad",
      );
    const replacing = controls.get(key(x, y));
    const ok = await confirm({
      title: `Put a ${info.name.toLowerCase()} here?`,
      message: `${formatCoins(info.cost)} coins.${replacing ? " It replaces the stop sign." : ""}`,
      confirmLabel: `Build · ${formatCoins(info.cost)}`,
    });
    if (!ok) return;
    start(async () => {
      const r = await placeRoadControl(x, y, kind);
      if (!r.ok) return say(r.error, "bad");
      say(
        `${info.name} built for ${formatCoins(r.cost)} coins.`,
        "good",
        "build",
      );
      setMode({ kind: "idle" });
    });
  }
  async function takeControl(x: number, y: number) {
    const kind = controls.get(key(x, y));
    if (!kind) return;
    const info = ROAD_CONTROLS.find((c) => c.kind === kind)!;
    const ok = await confirm({
      title: `Remove the ${info.name.toLowerCase()}?`,
      message: `You get ${formatCoins(Math.floor(info.cost / 2))} coins back.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const r = await removeRoadControl(x, y);
      if (!r.ok) return say(r.error, "bad");
      say(`Removed. +${formatCoins(r.refund)} coins back.`, "good", "demolish");
    });
  }

  /** Swap road tiles to another kind of road (paying the new kind's price per tile). */
  async function changeRoad(tiles: Tile[], to: BuildingTypeRow) {
    const cost = tiles.length * to.cost;
    if (cost > balance)
      return say(
        `That costs ${formatCoins(cost)} coins. You have ${formatCoins(balance)}.`,
        "bad",
      );
    const ok = await confirm({
      title: `Change ${tiles.length === 1 ? "this tile" : `${tiles.length} tiles`} to ${to.name}?`,
      message: `It costs ${formatCoins(cost)} coins.`,
      confirmLabel: "Change road",
    });
    if (!ok) return;
    start(async () => {
      const r = await buyTiles(
        to.id,
        tiles.map((t) => [t.x, t.y]),
      );
      if (!r.ok) return say(r.error, "bad");
      say(
        `Changed ${r.built} tile${r.built === 1 ? "" : "s"} to ${to.name} for ${formatCoins(r.cost)} coins.`,
        "good",
        "build",
      );
      setMode({ kind: "idle" });
    });
  }
  function roadChangeFor(lot: Lot) {
    const tier = (ROAD_TIERS as readonly string[]).indexOf(lot.type_id);
    if (tier < 0) return undefined;
    const street = streetOf(lot, (x, y) => occupant.get(key(x, y))?.type_id);
    const here = [{ x: lot.x, y: lot.y }];
    const options = ROAD_TIERS.map((id, i) => ({ t: typeById.get(id), i }))
      .filter(
        (o): o is { t: BuildingTypeRow; i: number } => !!o.t && o.i !== tier,
      )
      .map(({ t, i }) => ({
        to: t,
        up: i > tier,
        tileCost: t.cost,
        streetCost: t.cost * street.length,
        onTile: () => void changeRoad(here, t),
        onStreet: () => void changeRoad(street, t),
      }))
      .sort((a, b) => Number(b.up) - Number(a.up));
    const k = key(lot.x, lot.y);
    const here2 = controls.get(k);
    const control = crossings.has(k)
      ? {
          current: here2
            ? ROAD_CONTROLS.find((c) => c.kind === here2)!.name
            : null,
          options: ROAD_CONTROLS.filter((c) => c.kind !== here2).map((c) => ({
            name: c.name,
            cost: c.cost,
            onPick: () => void putControl(lot.x, lot.y, c.kind),
          })),
          onRemove: here2 ? () => void takeControl(lot.x, lot.y) : undefined,
          refund: here2
            ? Math.floor(ROAD_CONTROLS.find((c) => c.kind === here2)!.cost / 2)
            : 0,
        }
      : undefined;
    return { street: street.length, options, control };
  }

  async function expand() {
    const price = landPrice(props.landPurchases);
    if (balance < price)
      return say(
        `More land costs ${formatCoins(price)} coins. You have ${formatCoins(balance)}.`,
        "bad",
      );
    const ok = await confirm({
      title: `Buy more land for ${formatCoins(price)} coins?`,
      message: `Your city grows to ${size + 2}×${size + 2}.`,
      confirmLabel: "Buy land",
    });
    if (!ok) return;
    start(async () => {
      const r = await buyLand();
      if (!r.ok) return say(r.error, "bad");
      say(`Your city is now ${r.size}×${r.size}!`, "good", "fanfare");
    });
  }

  const tools: {
    id: string;
    label: string;
    icon: React.ReactNode;
    mode: Mode;
  }[] = [
    {
      id: "idle",
      label: "Select",
      icon: <MousePointer2 className="size-5" aria-hidden />,
      mode: { kind: "idle" },
    },
    {
      id: "bulldoze",
      label: "Bulldoze",
      icon: <BulldozeIcon className="size-5" />,
      mode: { kind: "bulldoze" },
    },
    {
      id: "shift",
      label: "Move city",
      icon: <Move className="size-5" aria-hidden />,
      mode: { kind: "shift" },
    },
  ];
  const activeTool =
    mode.kind === "paint"
      ? mode.typeId
      : mode.kind === "bulldoze"
        ? "bulldoze"
        : mode.kind === "shift"
          ? "shift"
          : mode.kind === "idle" || mode.kind === "selected"
            ? "idle"
            : null;
  const strokeInfo =
    stroke && mode.kind === "paint"
      ? (() => {
          const p = planPaint(stroke, mode.typeId);
          return {
            text: `${p.fresh.length} tile${p.fresh.length === 1 ? "" : "s"} · ${formatCoins(p.cost)} coins`,
            bad: !p.ok,
          };
        })()
      : stroke && mode.kind === "bulldoze"
        ? (() => {
            const p = planDemolish(stroke);
            return {
              text: `${p.ids.length} to demolish · +${formatCoins(p.refund)} back`,
              bad: false,
            };
          })()
        : null;

  const selectedType = selected ? typeById.get(selected.type_id) : undefined;

  // The confirmation bar for whatever is being previewed.
  const draftPlan =
    mode.kind === "paint" && draftTiles.length > 0
      ? planPaint(draftTiles, mode.typeId)
      : null;
  const draftBar: {
    title: string;
    detail: string;
    problem?: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    onTurn?: () => void;
    onUndo?: () => void;
  } | null =
    mode.kind === "paint" && paintType && draftPlan
      ? {
          title: `${draftPlan.fresh.length} ${paintType.name.toLowerCase()} tile${draftPlan.fresh.length === 1 ? "" : "s"} · ${formatCoins(draftPlan.cost)} coins`,
          detail:
            [
              draftPlan.bridges > 0 &&
                `${draftPlan.bridges} as bridge${draftPlan.bridges === 1 ? "" : "s"}`,
              draftPlan.swaps > 0 &&
                `replaces ${draftPlan.swaps} road tile${draftPlan.swaps === 1 ? "" : "s"}`,
              draftPlan.trees > 0 &&
                `clears ${draftPlan.trees} tree tile${draftPlan.trees === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ") ||
            (!isRoadType(mode.typeId)
              ? "Drag another box, tap a tile to take it out, or Build."
              : anchor
                ? "Tap to keep going, tap the pin to stop, or Build."
                : "Tap to start another stretch, or Build."),
          problem:
            draftPlan.fresh.length === 0
              ? "That's all there already."
              : draftPlan.blocked
                ? "Part of it is on a building or past your land. Undo that stretch and go around."
                : draftPlan.sideBySide
                  ? "Roads can't run side by side. Leave a tile between them."
                  : draftPlan.fresh.length > MAX_STROKE_TILES
                    ? `At most ${MAX_STROKE_TILES} tiles at a time.`
                    : draftPlan.cost > balance
                      ? `Not enough coins (you have ${formatCoins(balance)}).`
                      : undefined,
          confirmLabel: "Build",
          onConfirm: confirmPaint,
          onCancel: () => clearDraft(),
          onUndo: () => {
            const last = segments[segments.length - 1];
            if (!last) return;
            setSegments(segments.slice(0, -1));
            setAnchor(last.prevAnchor);
          },
        }
      : (mode.kind === "place" && placingType) ||
          (mode.kind === "move" && movingLot)
        ? draftSpot
          ? (() => {
              const dims = draftDims ?? { w: 1, h: 1 };
              const fits = freeAt(draftSpot.x, draftSpot.y, dims);
              const watery = fits && !fitsAt(draftSpot.x, draftSpot.y, dims);
              const covers = lots.filter(
                (l) =>
                  l.type_id === "tree" &&
                  l.x >= draftSpot.x &&
                  l.x < draftSpot.x + dims.w &&
                  l.y >= draftSpot.y &&
                  l.y < draftSpot.y + dims.h,
              ).length;
              return {
                title:
                  mode.kind === "place"
                    ? `${placingType!.name} · ${formatCoins(placingType!.cost)} coins`
                    : "Move here?",
                detail:
                  covers > 0
                    ? `Clears ${covers} tree tile${covers === 1 ? "" : "s"}. Tap elsewhere to move the preview.`
                    : "Drag it or tap elsewhere to move it.",
                problem: !fits
                  ? `Doesn't fit here.${canTurn ? " Drag it, or Turn it," : " Drag it"} to an empty spot until it turns green.`
                  : watery
                  ? "A beach has to touch water. Drag it right beside a pond or lake."
                  : mode.kind === "place" && balance < placingType!.cost
                    ? "Not enough coins yet."
                    : undefined,
                confirmLabel:
                  mode.kind === "place" ? "Build here" : "Move here",
                onConfirm: confirmSpot,
                onCancel: () => setDraftSpot(null),
                onTurn: canTurn
                  ? () => {
                      const turned = draftDims
                        ? { w: draftDims.h, h: draftDims.w }
                        : null;
                      // Turn where it is (kept on your land); it shows red until it fits.
                      if (draftSpot && turned) setDraftSpot(clampSpot(draftSpot.x, draftSpot.y, turned));
                      setDraftRot((r) => !r);
                    }
                  : undefined,
              };
            })()
          : null
        : null;
  const selectedPlace = selected ? placeById.get(selected.id) : undefined;
  const person = (c: (typeof citizens)[number], line: string) => ({
    id: c.id,
    name: c.name,
    age: c.age,
    line,
  });
  const people = !selectedPlace
    ? undefined
    : selectedPlace.homes > 0
      ? {
          title: "Who lives here",
          empty: "Nobody yet.",
          list: citizens
            .filter((c) => c.homeId === selectedPlace.id)
            .map((c) => person(c, roleText(c, placeById))),
        }
      : selectedPlace.school
        ? {
            title: "Students",
            empty:
              "No students yet. Children in homes connected by road come here.",
            list: citizens
              .filter((c) => c.schoolId === selectedPlace.id)
              .map((c) =>
                person(
                  c,
                  `Lives in a ${placeById.get(c.homeId)?.name ?? "home"}`,
                ),
              ),
          }
        : selectedPlace.jobs > 0
          ? {
              title: "Who works here",
              empty: selectedPlace.entrance
                ? "Nobody yet. Build homes so people can take these jobs."
                : "Nobody can get here without a road.",
              list: citizens
                .filter((c) => c.workId === selectedPlace.id)
                .map((c) =>
                  person(
                    c,
                    `Lives in a ${placeById.get(c.homeId)?.name ?? "home"}`,
                  ),
                ),
            }
          : undefined;
  const selectedPanel = selected ? (
    <SelectedPanel
      lot={selected}
      type={selectedType}
      pending={pending}
      warning={
        needsRoad.has(selected.id)
          ? touchesRoad(selected, roads)
            ? "Its road isn't joined to the rest of town, so nobody can get here and it doesn't count. Connect that road to your other roads."
            : "No road beside it, so it doesn't count yet. Build a road next to it."
          : [
              stats.noGoods.has(selected.id) &&
                `Short of goods: shops only get ${Math.round(stats.goodsSupply * 100)}% of the products they sell. Build industry (workshops, factories, warehouses) to supply them.`,
              stats.skilledShort.has(selected.id) &&
                "Not enough educated workers for its skilled jobs. Build a high school or university near your homes.",
              stats.understaffed.has(selected.id) && stats.staffing < 1 &&
                `Not enough workers: businesses are ${Math.round(stats.staffing * 100)}% staffed. Build homes so they can hire.`,
            ].filter(Boolean).join(" ") || undefined
      }
      canRotate={
        selectedType?.category !== "landscape" &&
        selectedType?.category !== "road" &&
        nextFacing(selected, roads) !== null
      }
      onRotate={() => rotate(selected)}
      upgrade={upgradeInfo(selected)}
      onUpgrade={() => upgrade(selected)}
      canMove={
        selectedType?.category !== "road" &&
        selectedType?.category !== "landscape"
      }
      canTurn={
        !!selectedType &&
        selectedType.w !== selectedType.d &&
        selectedType.category !== "road" &&
        selectedType.category !== "landscape"
      }
      onTurn={() => turnInPlace(selected)}
      onMove={() => setMode({ kind: "move", id: selected.id })}
      onSell={() => sell(selected)}
      people={people}
      onPerson={(id) => {
        setMode({ kind: "idle" });
        setCitizenId(id);
      }}
      onClose={() => setMode({ kind: "idle" })}
      roadChange={roadChangeFor(selected)}
      colors={
        selectedType &&
        selectedType.category !== "road" &&
        selectedType.category !== "landscape" &&
        !FIXED_COLOR_IDS.has(selectedType.id)
          ? {
              current: selected.color_seed ?? null,
              onPick: (seed) =>
                start(async () => {
                  const r = await setBuildingColor(selected.id, seed);
                  if (!r.ok) say(r.error, "bad");
                }),
            }
          : undefined
      }
    />
  ) : null;

  // Just a pause button (no clock): pausing makes it easy to tap a car or a person.
  const clockPill = (className: string) => (
    <div
      className={`flex min-w-0 max-w-full items-center bg-surface/95 p-1 shadow ring-1 ring-line ${news ? "rounded-2xl" : "rounded-full"} ${className}`}
    >
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        style={{ flexShrink: 0 }}
        aria-label={paused ? "Resume the city" : "Pause the city"}
        title={paused ? "Resume" : "Pause (then tap a car or a person)"}
        className={`flex size-8 items-center justify-center rounded-full ${paused ? "bg-accent text-on-accent" : "text-ink hover:bg-raised"}`}
      >
        {paused ? (
          <Play className="size-4" aria-hidden />
        ) : (
          <Pause className="size-4" aria-hidden />
        )}
      </button>
      {news && (
        <span role="status" className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-normal break-words px-2 text-xs font-medium text-ink">
          {/fire/i.test(news) ? (
            <Flame className="size-3.5 shrink-0 text-bad" aria-hidden />
          ) : (
            <Siren className="size-3.5 shrink-0 text-accent-text" aria-hidden />
          )}
          {news}
        </span>
      )}
    </div>
  );

  function pick(t: BuildingTypeRow) {
    setMessage(null);
    const control = controlByType(t.id);
    if (control) return setMode({ kind: "control", control: control.kind });
    const landmark = landmarkState(t);
    if (landmark?.locked)
      return say(`${t.name}: ${landmark.note.toLowerCase()}.`, "bad");
    setMode(
      isPaint(t.id)
        ? { kind: "paint", typeId: t.id }
        : { kind: "place", typeId: t.id },
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="-mb-1">
        <CityName name={props.cityName} />
        <p
          aria-live="polite"
          className={`text-sm empty:hidden ${message?.tone === "bad" ? "text-bad" : "text-good"}`}
        >
          {message?.text}
        </p>
      </div>

      <div>
        <div className="min-w-0 space-y-3">
          <div
            ref={mapBox}
            data-map={
              mode.kind === "paint" || mode.kind === "bulldoze"
                ? "paint"
                : full
                  ? "full"
                  : "browse"
            }
            className={
              full
                ? "fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-raised"
                : "relative h-[50vh] max-h-[720px] min-h-[300px] overflow-hidden sm:h-[58vh] rounded-2xl border-4 border-line bg-raised shadow-inner"
            }
            role={full ? "dialog" : undefined}
            aria-modal={full || undefined}
            aria-label={full ? `${props.cityName}, full screen` : undefined}
            data-scenic={scenic || undefined}
          >
            <City3D
              ref={city3d}
              size={size}
              lots={lots}
              needsRoad={needsRoad}
              understaffed={stats.understaffed}
              noGoods={stats.noGoods}
              selectedId={selected?.id}
              dimmedId={movingLot?.id}
              input={
                mode.kind === "paint" || mode.kind === "bulldoze"
                  ? "stroke"
                  : "point"
              }
              ghostDims={draftDims}
              ghostOk={(x, y) =>
                fitsAt(x, y) &&
                (!placingType || balance >= placingType.cost)
              }
              strokeOk={(tiles) =>
                mode.kind === "paint" ? planPaint(tiles, mode.typeId).ok : true
              }
              strokeColor={mode.kind === "bulldoze" ? "demolish" : "build"}
              paintTypeId={
                mode.kind === "paint"
                  ? mode.typeId
                  : mode.kind === "control"
                    ? "control"
                    : undefined
              }
              controls={controls}
              onTile={onTile}
              onStroke={onStroke}
              onStrokeChange={setStroke}
              ghostAt={draftSpot}
              anchorTile={mode.kind === "paint" && isRoadType(mode.typeId) ? anchor : null}
              onGhostMove={(t) => setDraftSpot(clampSpot(t.x, t.y))}
              previewTiles={
                mode.kind === "control"
                  ? [...crossings]
                      .filter((k) => controls.get(k) !== mode.control)
                      .map((k) => ({
                        x: Number(k.split(",")[0]),
                        y: Number(k.split(",")[1]),
                      }))
                  : draftTiles
              }
              previewOk={draftPlan ? draftPlan.ok : true}
              overlay={full ? layerCells : null}
              sim={sim}
              minutes={12 * 60}
              showGrid={!scenic}
            />
            {strokeInfo && (
              <div
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-bold shadow ${full ? "top-16" : "top-3"} ${
                  strokeInfo.bad
                    ? "bg-red-600 text-white"
                    : "bg-surface text-ink"
                }`}
              >
                {strokeInfo.text}
              </div>
            )}
            {pending && (
              <div
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow ${full ? "top-28" : "top-12"}`}
              >
                Saving…
              </div>
            )}
            {scenic && (
              <button
                type="button"
                data-keep
                onClick={() => setScenic(false)}
                className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2 flex min-h-10 items-center gap-1.5 rounded-xl bg-surface/90 px-3 text-sm font-semibold text-ink shadow ring-1 ring-line backdrop-blur"
              >
                <EyeOff className="size-4" aria-hidden /> Show menus
              </button>
            )}
            {draftBar && (
              <div
                className={`absolute left-1/2 z-10 flex w-[min(26rem,calc(100%-1rem))] -translate-x-1/2 flex-wrap items-center justify-end gap-2 rounded-2xl bg-surface/95 p-2 pl-3 text-ink shadow-xl ring-1 ring-line backdrop-blur ${
                  full
                    ? "bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]"
                    : "bottom-2"
                }`}
                role="group"
                aria-label="Confirm building"
              >
                {/* The text wraps instead of being cut off; on narrow screens the buttons drop to a row of their own. */}
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-bold break-words">
                    {draftBar.title}
                  </p>
                  <p
                    className={`text-xs break-words ${draftBar.problem ? "text-bad" : "text-muted"}`}
                  >
                    {draftBar.problem ?? draftBar.detail}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  {draftBar.onUndo && (
                    <button
                      type="button"
                      className="btn-secondary min-h-10 shrink-0 px-3 py-1 text-sm"
                      onClick={draftBar.onUndo}
                      aria-label="Undo the last stretch"
                    >
                      <Undo2 className="size-4" aria-hidden /> Undo
                    </button>
                  )}
                  {draftBar.onTurn && (
                    <button
                      type="button"
                      className="btn-secondary min-h-10 shrink-0 px-3 py-1 text-sm"
                      onClick={draftBar.onTurn}
                      aria-label="Turn the building"
                    >
                      <RotateCw className="size-4" aria-hidden /> Turn
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary min-h-10 shrink-0 px-3 py-1 text-sm"
                    onClick={draftBar.onCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary min-h-10 shrink-0 px-3 py-1 text-sm"
                    disabled={!!draftBar.problem || pending}
                    onClick={draftBar.onConfirm}
                  >
                    {draftBar.confirmLabel}
                  </button>
                </div>
              </div>
            )}
            {citizenInfo && !draftBar && (
              <div
                className={`absolute left-2 w-[min(20rem,calc(100%-4.5rem))] rounded-2xl bg-surface/95 p-3 text-ink shadow-xl ring-1 ring-line backdrop-blur ${
                  full
                    ? "bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]"
                    : "bottom-2"
                }`}
                role="status"
                aria-label={`${citizenInfo.name}: ${citizenInfo.status}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-xl"
                    aria-hidden
                  >
                    {citizenInfo.mode === "car" ? (
                      <Car className="size-5" aria-hidden />
                    ) : citizenInfo.mode === "walk" ? (
                      <Footprints className="size-5" aria-hidden />
                    ) : (
                      <House className="size-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {citizenInfo.name}, {citizenInfo.age}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {citizenInfo.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCitizenId(null)}
                    aria-label="Close"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-2 text-sm font-semibold">
                  {citizenInfo.status}
                </p>
                {citizenInfo.detail && (
                  <p className="text-xs text-muted">{citizenInfo.detail}</p>
                )}
              </div>
            )}
            {full && (
              <div className="absolute inset-x-0 top-0 flex flex-col gap-1.5 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 rounded-2xl bg-surface/95 px-3 py-1.5 shadow ring-1 ring-line backdrop-blur">
                    {props.visit ? (
                      <div className="min-w-0">
                        <p className="text-xs break-words text-muted">
                          {props.visit.owner
                            ? `${props.visit.owner}'s city`
                            : "Visiting"}
                        </p>
                        <p className="text-sm leading-tight font-bold break-words">
                          {props.cityName}
                        </p>
                      </div>
                    ) : (
                      <div className="min-w-0 text-sm leading-tight font-bold">
                        <div className="min-w-0 break-words">
                          <CityName name={props.cityName} compact />
                        </div>
                        <div className="text-xs text-coin">
                          <CoinIcon className="size-3" /> {formatCoins(balance)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={toggleMusic}
                      aria-pressed={music}
                      aria-label={
                        music ? "Turn the music off" : "Turn the music on"
                      }
                      title={music ? "Music on" : "Music off"}
                      className={`min-h-10 rounded-xl px-3 py-1 text-sm font-semibold shadow ${music ? "bg-accent text-on-accent" : "bg-surface/95 text-ink ring-1 ring-line"}`}
                    >
                      {music ? (
                        <Music className="size-4" aria-hidden />
                      ) : (
                        <VolumeX className="size-4" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScenic(true)}
                      aria-label="Scenic view (hide the menus and grid)"
                      title="Scenic view"
                      className="min-h-10 rounded-xl bg-surface/95 px-3 py-1 text-sm font-semibold text-ink shadow ring-1 ring-line"
                    >
                      <Eye className="size-4" aria-hidden />{" "}
                      <span className="hidden sm:inline">View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayersOpen((o) => !o);
                        setStatsOpen(false);
                      }}
                      aria-pressed={layersOpen || !!layer}
                      aria-label="Layers"
                      className={`min-h-10 rounded-xl px-3 py-1 text-sm font-semibold shadow ${layersOpen || layer ? "bg-accent text-on-accent" : "bg-surface/95 text-ink ring-1 ring-line"}`}
                    >
                      <Layers className="size-4" aria-hidden />{" "}
                      <span className="hidden sm:inline">Layers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatsOpen((o) => !o);
                        setLayersOpen(false);
                      }}
                      aria-pressed={statsOpen}
                      aria-label="Stats"
                      className={`min-h-10 rounded-xl px-3 py-1 text-sm font-semibold shadow ${statsOpen ? "bg-accent text-on-accent" : "bg-surface/95 text-ink ring-1 ring-line"}`}
                    >
                      <ChartColumn className="size-4" aria-hidden />{" "}
                      <span className="hidden sm:inline">Stats</span>
                    </button>
                    {props.visit && (
                      <button
                        type="button"
                        onClick={invite}
                        className="min-h-10 rounded-xl bg-coin px-3 py-1 text-sm font-semibold text-on-coin shadow"
                      >
                        <UserPlus className="size-4" aria-hidden />{" "}
                        <span className="hidden sm:inline">Invite friends</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={exitFull}
                      className="btn-primary min-h-10 px-3 py-1 text-sm shadow"
                    >
                      <X className="size-4" aria-hidden />{" "}
                      {props.visit ? "Back" : "Exit"}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {citizens.length > 0 &&
                    clockPill(news ? "" : "shrink-0 whitespace-nowrap")}
                  {/* Only problems and how-to lines here; routine updates ("Built a House…") aren't shown in full screen. */}
                  {message?.text && message.tone === "bad" ? (
                    <p
                      aria-live="polite"
                      className="rounded-full bg-surface/95 px-3 py-1.5 text-xs text-bad shadow ring-1 ring-line"
                    >
                      {message.text}
                    </p>
                  ) : (mode.kind === "place" && placingType) || mode.kind === "move" ? (
                    // How-to line with its own Cancel (kept out of the top row, where it squeezed the city name).
                    <p className="flex items-center gap-2 rounded-full bg-surface/95 py-1 pr-1 pl-3 text-xs text-ink shadow ring-1 ring-line">
                      <span>
                        {mode.kind === "place" && placingType
                          ? `Placing ${placingType.name}: tap a spot, then Build here.`
                          : "Moving: tap where it should go, then Move here."}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-full bg-raised px-3 py-1 font-semibold hover:bg-accent-soft"
                        onClick={() => setMode(movingLot ? { kind: "selected", id: movingLot.id } : { kind: "idle" })}
                      >
                        Cancel
                      </button>
                    </p>
                  ) : mode.kind === "paint" && paintType ? (
                    <p className="rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink shadow ring-1 ring-line">
                      {!isRoadType(mode.typeId)
                        ? `Drag a box to fill it with ${paintType.name.toLowerCase()}, then Build.`
                        : segments.length === 0
                          ? "Tap where the road starts, then where it ends."
                          : "Keep tapping to add more, then Build."}
                      {isRoadType(mode.typeId)
                        ? " Across water it builds a bridge."
                        : ""}
                    </p>
                  ) : mode.kind === "bulldoze" ? (
                    <p className="rounded-full bg-surface/95 px-3 py-1.5 text-xs text-ink shadow ring-1 ring-line">
                      Drag a box over things to demolish everything inside it.
                    </p>
                  ) : null}
                </div>
                {props.tutorial && !props.visit && (
                  <TutorialCoach
                    state={props.tutorial}
                    compact={mode.kind !== "idle"}
                    onReward={(coins) => say(`+${coins} coins for finishing Getting started!`, "good", "fanfare")}
                  />
                )}
              </div>
            )}
            {full && mode.kind === "shift" && (
              <div
                className="absolute left-1/2 z-10 w-[min(18rem,calc(100%-1rem))] -translate-x-1/2 rounded-2xl bg-surface/95 p-3 text-ink shadow-xl ring-1 ring-line backdrop-blur bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]"
                role="group"
                aria-label="Move the whole city"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">
                    <Move className="size-4" aria-hidden /> Move city
                  </p>
                  <button
                    type="button"
                    className="btn-secondary min-h-9 px-3 py-1 text-sm"
                    onClick={() => setMode({ kind: "idle" })}
                  >
                    Done
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Slide everything you&apos;ve built one tile at a time (free).
                  Arrow keys work too.
                </p>
                {edges ? (
                  <div className="mx-auto mt-2 grid w-max grid-cols-3 gap-1.5 text-center text-xs">
                    {[
                      {
                        at: "col-start-2",
                        dx: 0,
                        dy: -1,
                        room: edges.top,
                        Icon: ArrowUp,
                        label: "Up",
                      },
                      {
                        at: "col-start-1",
                        dx: -1,
                        dy: 0,
                        room: edges.left,
                        Icon: ArrowLeft,
                        label: "Left",
                      },
                      {
                        at: "col-start-3",
                        dx: 1,
                        dy: 0,
                        room: edges.right,
                        Icon: ArrowRight,
                        label: "Right",
                      },
                      {
                        at: "col-start-2",
                        dx: 0,
                        dy: 1,
                        room: edges.bottom,
                        Icon: ArrowDown,
                        label: "Down",
                      },
                    ].map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        disabled={b.room <= 0 || pending}
                        onClick={() => shift(b.dx, b.dy)}
                        aria-label={`Move the city ${b.label.toLowerCase()} (${b.room} tile${b.room === 1 ? "" : "s"} to the edge)`}
                        className={`${b.at} ${b.label === "Left" ? "row-start-2" : b.label === "Right" ? "row-start-2" : ""} flex size-14 flex-col items-center justify-center rounded-xl bg-raised font-semibold ring-1 ring-line hover:bg-accent-soft disabled:opacity-40`}
                      >
                        <b.Icon className="size-5" aria-hidden />
                        <span className="text-[10px] font-normal text-muted">
                          {b.room} to edge
                        </span>
                      </button>
                    ))}
                    <div className="col-start-2 row-start-2 flex size-14 items-center justify-center rounded-xl text-[10px] text-muted">
                      {size}×{size}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    Build something first.
                  </p>
                )}
              </div>
            )}
            {full && selected && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <div className="max-h-[50dvh] w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl">
                  {selectedPanel}
                </div>
              </div>
            )}
            {full && !selected && mode.kind !== "move" && !props.visit && (
              <BuildOverlay
                types={menuTypes}
                landmarkState={landmarkState}
                progress={progress}
                balance={balance}
                activeId={
                  placingType?.id ??
                  (mode.kind === "paint"
                    ? mode.typeId
                    : mode.kind === "control"
                      ? ROAD_CONTROLS.find((c) => c.kind === mode.control)!
                          .typeId
                      : undefined)
                }
                tools={tools}
                activeTool={activeTool}
                onTool={(id) => {
                  setMessage(null);
                  setMode(tools.find((t) => t.id === id)!.mode);
                }}
                onPick={pick}
                land={
                  size < MAX_CITY_SIZE
                    ? { price: landPrice(props.landPurchases), onBuy: expand }
                    : undefined
                }
              />
            )}
            {/* City page: just a picture of the whole city; tapping it (or the button) opens full screen, where you build. */}
            {!full && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={enterFull}
                  className="absolute inset-0 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={enterFull}
                  className="absolute right-3 bottom-3 flex min-h-10 items-center gap-1.5 rounded-xl bg-surface/95 px-3 text-sm font-semibold text-ink shadow ring-1 ring-line hover:bg-raised"
                >
                  <Maximize2 className="size-4" aria-hidden /> Full screen
                </button>
              </>
            )}
            {full && layersOpen && (
              <div
                role="dialog"
                aria-label="Map layers"
                className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] right-2 z-10 max-h-[calc(100%-11rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-2xl bg-surface/95 p-2 text-ink shadow-2xl ring-1 ring-line backdrop-blur"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <h2 className="font-bold">Map layers</h2>
                  <button
                    type="button"
                    onClick={() => setLayersOpen(false)}
                    aria-label="Close map layers"
                    className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-raised"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <ul>
                  {[{ id: null, label: "Off" } as const, ...LAYERS].map((l) => (
                    <li key={l.id ?? "off"}>
                      <button
                        type="button"
                        aria-pressed={layer === l.id}
                        onClick={() => {
                          setLayer(l.id);
                          setLayersOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${layer === l.id ? "bg-accent text-on-accent" : "hover:bg-raised"}`}
                      >
                        <LayerIcon id={l.id} />
                        <span className="font-medium">{l.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {full && layerInfo && !layersOpen && !statsOpen && (
              <div className="absolute left-2 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-10 w-[min(20rem,calc(100%-1rem))] rounded-2xl bg-surface/95 p-3 text-ink shadow-xl ring-1 ring-line backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">
                    <LayerIcon id={layerInfo.id} /> {layerInfo.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLayer(null)}
                    aria-label="Hide layer"
                    className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-raised"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
                <div
                  className="mt-2 h-2.5 rounded-full"
                  style={{
                    background:
                      "linear-gradient(to right, #22c55e, #eab308, #ef4444)",
                  }}
                  aria-hidden
                />
                <div className="mt-1 flex justify-between text-xs text-muted">
                  <span>{layerInfo.good}</span>
                  <span>{layerInfo.bad}</span>
                </div>
                <p className="mt-1.5 text-xs text-muted">{layerInfo.about}</p>
              </div>
            )}
            {full && statsOpen && (
              <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] right-2 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-10 w-[min(30rem,calc(100%-1rem))] overflow-y-auto rounded-2xl shadow-2xl">
                <CityStatsPanel
                  stats={stats}
                  onClose={() => setStatsOpen(false)}
                />
                <div className={props.visit ? "hidden" : "mt-3"}>
                  <MilestonesPanel
                    population={stats.population}
                    claimed={props.claimedMilestones ?? []}
                    placed={placedTypes}
                    names={new Map(types.map((t) => [t.id, t.name]))}
                    pending={pending}
                    onClaim={claimMilestone}
                  />
                </div>
              </div>
            )}
          </div>
          <CityStatsPanel stats={stats} />
          <MilestonesPanel
            population={stats.population}
            claimed={props.claimedMilestones ?? []}
            placed={placedTypes}
            names={new Map(types.map((t) => [t.id, t.name]))}
            pending={pending}
            onClaim={claimMilestone}
          />
        </div>
      </div>
    </div>
  );
}
