"use client";

import { Ban, Car, ChartColumn, Flame, GraduationCap, HeartPulse, Layers, ShieldAlert, Factory as FactoryIcon, Gem as GemIcon, TrafficCone, Footprints, House, LocateFixed, Maximize2, Minimize2, Moon, MousePointer2, Pause, Play, RotateCcw, RotateCw, Sun, Sunrise, Sunset, X, ZoomIn, ZoomOut } from "lucide-react";
import dynamic from "next/dynamic";
import { BuildingIcon, BulldozeIcon, CoinIcon } from "@/components/icons";
import { cityExposure, computeLayer, LAYERS, type LayerId } from "@/lib/layers";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { MAX_CITY_SIZE, MAX_STROKE_TILES, cityStats, footprint, formatCoins, landPrice, lotFree, pointsToUnlock, sellRefund } from "@/lib/game";
import { BRIDGE_TYPE, connectedIds, isRoadType, key, nextFacing, roadSet, type Lot, type Tile } from "@/lib/roads";
import { buyBuilding, buyLand, buyTiles, moveBuilding, sellBuilding, sellMany, setFacing, upgradeBuilding } from "../actions";
import type { City3DHandle } from "./city-3d";
import { useConfirm } from "@/components/confirm";
import { citizensFrom, clockText, minuteOfDay, placesFrom, roleText } from "@/lib/sim";
import { BuildOverlay } from "./build-overlay";
import type { CitizenInfo } from "./traffic";
import { CityName, CityStatsPanel, SelectedPanel, Shop } from "./panels";

// three.js only loads on this page, in the browser.
const City3D = dynamic(() => import("./city-3d"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D city…</div>,
});

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid" | "facing"> & { rotated?: boolean };
/** Tiles painted by dragging: roads and landscaping. */
const PAINT_TYPES = ["dirt_road", "road", "avenue", "tree", "water"] as const;
type PaintType = (typeof PAINT_TYPES)[number];
const isPaint = (id: string): id is PaintType => (PAINT_TYPES as readonly string[]).includes(id);

/** Icons for the map layers. */
function LayerIcon({ id }: { id: LayerId | null }) {
  const Icon =
    id === "traffic" ? TrafficCone
    : id === "fire" ? Flame
    : id === "crime" ? ShieldAlert
    : id === "education" ? GraduationCap
    : id === "health" ? HeartPulse
    : id === "pollution" ? FactoryIcon
    : id === "land_value" ? GemIcon
    : Ban;
  return <Icon className="inline size-4 shrink-0" aria-hidden />;
}

/** Load a page fresh (deliberately not client-side navigation: see enterFull). */
function hardNavigate(path: string) {
  window.location.assign(new URL(path, window.location.origin).href);
}

/** Sky for the city clock. */
function DayIcon({ t }: { t: number }) {
  const m = minuteOfDay(Math.floor(t));
  const Icon = m < 6 * 60 || m >= 21 * 60 ? Moon : m < 9 * 60 ? Sunrise : m < 18 * 60 ? Sun : Sunset;
  return <Icon className="size-4 text-coin" aria-hidden />;
}

export type Mode =
  | { kind: "idle" }
  | { kind: "place"; typeId: string }
  | { kind: "selected"; id: string }
  | { kind: "move"; id: string }
  | { kind: "paint"; typeId: PaintType }
  | { kind: "bulldoze" };

const VIEW_BUTTONS = [
  { action: "in", label: "Zoom in", Icon: ZoomIn },
  { action: "out", label: "Zoom out", Icon: ZoomOut },
  { action: "left", label: "Rotate left", Icon: RotateCcw },
  { action: "right", label: "Rotate right", Icon: RotateCw },
  { action: "reset", label: "Reset view", Icon: LocateFixed },
] as const;

export function CityBoard(props: {
  cityName: string;
  size: number;
  landPurchases: number;
  placed: Placed[];
  types: BuildingTypeRow[];
  progress: ProgressRow | null;
  balance: number;
  /** Building picked in the Shop (?place=…), placed right away if it's unlocked. */
  initialPlace?: string;
  /** The full-screen page (/play): only the map, with the build bar over it. */
  standalone?: boolean;
}) {
  const { size, placed, types, progress, balance } = props;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const lots: (Lot & { price_paid: number })[] = useMemo(
    () => placed.map((b) => ({ ...b, ...footprint(typeById.get(b.type_id), b.rotated) })),
    [placed, typeById],
  );
  const roads = useMemo(() => roadSet(lots), [lots]);

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
    for (const b of lots) for (let dx = 0; dx < b.w; dx++) for (let dy = 0; dy < b.h; dy++) map.set(key(b.x + dx, b.y + dy), b);
    return map;
  }, [lots]);

  const [mode, setMode] = useState<Mode>(() => {
    const t = props.initialPlace ? types.find((x) => x.id === props.initialPlace) : undefined;
    if (!t || pointsToUnlock(t, progress) > 0) return { kind: "idle" };
    return isPaint(t.id) ? { kind: "paint", typeId: t.id } : { kind: "place", typeId: t.id };
  });
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [stroke, setStroke] = useState<Tile[] | null>(null);
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  // Previews waiting for Confirm: a spot for a building being placed or moved, tiles being painted.
  const [draftSpot, setDraftSpot] = useState<Tile | null>(null);
  const [draftTiles, setDraftTiles] = useState<Tile[]>([]);
  const [draftRot, setDraftRot] = useState(false);
  const modeKey = mode.kind === "paint" ? `paint:${mode.typeId}` : mode.kind === "place" ? `place:${mode.typeId}` : mode.kind === "move" ? `move:${mode.id}` : mode.kind;
  const [draftFor, setDraftFor] = useState(modeKey);
  if (draftFor !== modeKey) {
    // Switching tools or buildings drops the preview.
    setDraftFor(modeKey);
    setDraftSpot(null);
    setDraftTiles([]);
    setDraftRot(mode.kind === "move" ? !!placed.find((b) => b.id === mode.id)?.rotated : false);
  }

  // The living city: named citizens who commute, shop and visit parks (see src/lib/sim.ts).
  const places = useMemo(() => placesFrom(lots, types), [lots, types]);
  const citizens = useMemo(() => citizensFrom(places), [places]);
  const placeById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  // Pollution at homes and traffic jams lower happiness (same models as the map layers).
  const exposure = useMemo(() => cityExposure(lots, types, { size, places, citizens, connected: connectedIds(lots) }), [lots, types, size, places, citizens]);
  const stats = useMemo(() => cityStats(placed, types, progress, exposure), [placed, types, progress, exposure]);
  const [paused, setPaused] = useState(false);
  const [simClock, setSimClock] = useState(7 * 60 + 15);
  const [citizenId, setCitizenId] = useState<string | null>(null);
  const [citizenInfo, setCitizenInfo] = useState<CitizenInfo | null>(null);
  // Map layers (full screen): which one is shown, and whether the list is open.
  const [layer, setLayer] = useState<LayerId | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const layerCells = useMemo(
    () => (layer ? computeLayer(layer, lots, types, { size, places, citizens, connected: connectedIds(lots) }) : null),
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
      onClock: setSimClock,
    }),
    [places, citizens, paused, citizenId],
  );
  const city3d = useRef<City3DHandle>(null);
  const mapBox = useRef<HTMLDivElement>(null);
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
    hardNavigate("/city");
  }


  const placingType = mode.kind === "place" ? typeById.get(mode.typeId) : undefined;
  const paintType = mode.kind === "paint" ? typeById.get(mode.typeId) : undefined;
  const movingLot = mode.kind === "move" ? lots.find((b) => b.id === mode.id) : undefined;
  const selected = mode.kind === "selected" ? lots.find((b) => b.id === mode.id) : undefined;
  // Footprint of what's being placed or moved, turned or not (rectangles can be turned before confirming).
  const draftDims = placingType ? footprint(placingType, draftRot) : movingLot ? footprint(typeById.get(movingLot.type_id), draftRot) : null;
  const canTurn = !!draftDims && draftDims.w !== draftDims.h;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Escape first stops what you're doing, then leaves full screen.
      if (modeRef.current.kind === "idle" && fullRef.current) hardNavigate("/city");
      else setMode({ kind: "idle" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if ((mode.kind === "selected" || mode.kind === "move") && !lots.some((b) => b.id === mode.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode({ kind: "idle" });
    }
  }, [lots, mode]);

  function say(text: string, tone: "good" | "bad" = "good") {
    setMessage({ text, tone });
  }

  /** Paint stroke: tiles that would be added (tiles already of that type are skipped), and whether it can be done. */
  function planPaint(tiles: Tile[], typeId: PaintType) {
    const cost1 = typeById.get(typeId)?.cost ?? 0;
    const at = (t: Tile) => occupant.get(key(t.x, t.y))?.type_id;
    const road = isRoadType(typeId);
    // A bridge already is road (of any kind) and already is water.
    const fresh = tiles.filter((t) => at(t) !== typeId && !(at(t) === BRIDGE_TYPE && (road || typeId === "water")));
    // Roads drawn over water become bridges; over another kind of road they replace it; trees are cleared.
    const bridges = road ? fresh.filter((t) => at(t) === "water").length : 0;
    const swaps = road ? fresh.filter((t) => at(t) !== undefined && at(t) !== "water" && isRoadType(at(t)!)).length : 0;
    const trees = fresh.filter((t) => at(t) === "tree").length;
    const free = (t: Tile) => {
      const here = at(t);
      return here === undefined || here === "tree" || (road && (here === "water" || isRoadType(here)));
    };
    const blocked = fresh.some((t) => !free(t) || t.x < 0 || t.y < 0 || t.x >= size || t.y >= size);
    // Roads can't run side by side: no 2x2 block of road tiles may include a new tile (the database checks too).
    let sideBySide = false;
    if (road && fresh.length > 0) {
      const all = new Set([...roads, ...fresh.map((t) => key(t.x, t.y))]);
      sideBySide = fresh.some((t) =>
        [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) =>
          [[0, 0], [1, 0], [0, 1], [1, 1]].every(([ex, ey]) => all.has(key(t.x + dx + ex, t.y + dy + ey))),
        ),
      );
    }
    const cost = (fresh.length - bridges) * cost1 + bridges * (typeById.get(BRIDGE_TYPE)?.cost ?? 0);
    return { fresh, bridges, swaps, trees, blocked, sideBySide, cost, ok: !blocked && !sideBySide && cost <= balance && fresh.length <= MAX_STROKE_TILES };
  }
  function planDemolish(tiles: Tile[]) {
    const ids = [...new Set(tiles.map((t) => occupant.get(key(t.x, t.y))?.id).filter(Boolean) as string[])];
    // Bridges go back to water with nothing back.
    const refund = ids.reduce((s, id) => {
      const l = lots.find((x) => x.id === id);
      return s + (l && l.type_id !== BRIDGE_TYPE ? sellRefund(l.price_paid) : 0);
    }, 0);
    return { ids, refund };
  }

  // Building is two steps: tap (or drag) shows a preview, then Confirm builds it. Nothing is bought by accident
  // (e.g. while zooming with two fingers).
  function onTile(x: number, y: number) {
    if (mode.kind === "paint") return onStroke([{ x, y }]);
    if (mode.kind === "place" || mode.kind === "move") {
      // The preview only goes where the building fits (never on roads, water or other buildings): the tapped spot,
      // or the nearest free spot that still covers or touches it.
      const spot = nearestFit(x, y);
      if (!spot) return say("That spot is taken. Pick an empty patch of grass.", "bad");
      setMessage(null);
      setDraftSpot(spot);
      return;
    }
    if (pending) return;
    if (mode.kind === "bulldoze") return onStroke([{ x, y }]);
    const b = occupant.get(key(x, y));
    setCitizenId(null);
    setMode(b ? { kind: "selected", id: b.id } : { kind: "idle" });
  }

  function fitsAt(x: number, y: number, dims = draftDims) {
    return !!dims && lotFree(size, { x, y, ...dims }, lots, movingLot?.id);
  }
  function nearestFit(x: number, y: number, dims = draftDims): Tile | null {
    if (!dims) return null;
    let best: Tile | null = null;
    let bestD = Infinity;
    // Anchors whose footprint covers the tapped tile first, then ones a tile away.
    for (let dy = -dims.h; dy <= 1; dy++) {
      for (let dx = -dims.w; dx <= 1; dx++) {
        const ax = x + dx, ay = y + dy;
        if (!fitsAt(ax, ay, dims)) continue;
        const cx = ax + (dims.w - 1) / 2, cy = ay + (dims.h - 1) / 2;
        const d = Math.hypot(cx - x, cy - y);
        if (d < bestD) { bestD = d; best = { x: ax, y: ay }; }
      }
    }
    return best;
  }

  /** Build the previewed building (or move it) where the preview is. */
  function confirmSpot() {
    if (!draftSpot || pending) return;
    const { x, y } = draftSpot;
    if (mode.kind === "place" && placingType) {
      if (!draftDims || !lotFree(size, { x, y, ...draftDims }, lots)) return say("That spot is taken or doesn't fit.", "bad");
      if (balance < placingType.cost) return say("Not enough coins yet. Finish some tasks!", "bad");
      start(async () => {
        const r = await buyBuilding(placingType.id, x, y, draftRot);
        if (!r.ok) return say(r.error, "bad");
        const nearRoad = connectedIds([...lots, { id: r.id, type_id: placingType.id, x, y, ...draftDims }]).has(r.id);
        say(`Built a ${placingType.name} for ${formatCoins(placingType.cost)} coins.${nearRoad ? "" : " It needs a road beside it to count."}`);
        // One building per pick: back to looking around (no Cancel needed).
        setMode({ kind: "idle" });
      });
      return;
    }
    if (mode.kind === "move" && movingLot) {
      if (!draftDims || !lotFree(size, { x, y, ...draftDims }, lots, movingLot.id)) return say("That spot is taken or doesn't fit.", "bad");
      start(async () => {
        const r = await moveBuilding(movingLot.id, x, y, draftRot);
        if (!r.ok) return say(r.error, "bad");
        say("Moved.");
        setMode({ kind: "selected", id: movingLot.id });
      });
    }
  }

  /** Buy the previewed road / trees / water tiles. */
  function confirmPaint() {
    if (mode.kind !== "paint" || !paintType || draftTiles.length === 0) return;
    const typeId = mode.typeId;
    const plan = planPaint(draftTiles, typeId);
    if (plan.fresh.length === 0) return setDraftTiles([]);
    if (plan.blocked) return say(`${paintType.name} can't go on top of buildings or past the edge of your land.`, "bad");
    if (plan.sideBySide) return say("Roads can't run side by side. Leave a tile between them, or join them at a crossing.", "bad");
    if (plan.fresh.length > MAX_STROKE_TILES) return say(`Paint at most ${MAX_STROKE_TILES} tiles at a time.`, "bad");
    if (plan.cost > balance) return say(`That costs ${formatCoins(plan.cost)} coins. You have ${formatCoins(balance)}.`, "bad");
    setDraftTiles([]);
    start(async () => {
      const r = await buyTiles(typeId, plan.fresh.map((t) => [t.x, t.y]));
      if (!r.ok) return say(r.error, "bad");
      const notes = [plan.bridges > 0 && `${plan.bridges} bridge${plan.bridges === 1 ? "" : "s"}`, plan.trees > 0 && `${plan.trees} tree tile${plan.trees === 1 ? "" : "s"} cleared`].filter(Boolean);
      const what = typeId === "tree" ? `Planted ${r.built} tree${r.built === 1 ? "" : "s"}` : typeId === "water" ? `Dug ${r.built} water tile${r.built === 1 ? "" : "s"}` : `Built ${r.built} ${paintType.name.toLowerCase()} tile${r.built === 1 ? "" : "s"}`;
      say(`${what}${notes.length ? ` (${notes.join(", ")})` : ""} for ${formatCoins(r.cost)} coins.`);
    });
  }

  function onStroke(tiles: Tile[]) {
    if (tiles.length === 0 || (pending && mode.kind === "bulldoze")) return;
    if (mode.kind === "paint" && paintType) {
      // Add the stroke to the preview (several strokes can be confirmed together).
      setMessage(null);
      setDraftTiles((old) => {
        const seen = new Set(old.map((t) => key(t.x, t.y)));
        // Tapping a single tile that's already in the preview takes it out again (to fix mistakes before Build).
        if (tiles.length === 1 && seen.has(key(tiles[0].x, tiles[0].y))) return old.filter((t) => t.x !== tiles[0].x || t.y !== tiles[0].y);
        return [...old, ...tiles.filter((t) => !seen.has(key(t.x, t.y)))];
      });
      return;
    }
    if (mode.kind === "bulldoze") {
      const { ids, refund } = planDemolish(tiles);
      if (ids.length === 0) return say("Nothing to demolish there.");
      const what = ids.length === 1 ? `this ${typeById.get(lots.find((l) => l.id === ids[0])!.type_id)?.name ?? "item"}` : `these ${ids.length} items`;
      void confirm({
        title: `Demolish ${what}?`,
        message: refund > 0 ? `You get ${formatCoins(refund)} coins back.` : "You don't get any coins back.",
        confirmLabel: "Demolish",
        tone: "danger",
      }).then((ok) => {
        if (!ok) return;
        start(async () => {
          const r = await sellMany(ids);
          if (!r.ok) return say(r.error, "bad");
          say(`Demolished ${r.sold} item${r.sold === 1 ? "" : "s"}. +${formatCoins(r.refund)} coins back.`);
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
        ? { title: "Take down this bridge?", message: "The tile goes back to water.", confirmLabel: "Take down", tone: "danger" }
        : {
            title: `Demolish this ${t?.name ?? "building"}?`,
            message: refund > 0 ? `You get ${formatCoins(refund)} coins back (half of what you paid).` : "You don't get any coins back.",
            confirmLabel: "Demolish",
            tone: "danger",
          },
    );
    if (!ok) return;
    start(async () => {
      const r = await sellBuilding(b.id);
      if (!r.ok) return say(r.error, "bad");
      say(`Demolished. +${formatCoins(r.refund)} coins back.`);
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

  function viewAction(action: (typeof VIEW_BUTTONS)[number]["action"]) {
    const c = city3d.current;
    if (!c) return;
    if (action === "in") c.zoom(0.75);
    else if (action === "out") c.zoom(1.33);
    else if (action === "left") c.rotate(-Math.PI / 4);
    else if (action === "right") c.rotate(Math.PI / 4);
    else c.reset();
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
        if (lotFree(size, { x: b.x - dx, y: b.y - dy, w: to.w, h: to.d }, lots, b.id)) room = true;
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
      say(`Upgraded to ${info.to.name} for ${formatCoins(r.cost)} coins.`);
    });
  }

  async function expand() {
    const price = landPrice(props.landPurchases);
    const ok = await confirm({
      title: `Buy more land for ${formatCoins(price)} coins?`,
      message: `Your city grows to ${size + 2}×${size + 2}.`,
      confirmLabel: "Buy land",
    });
    if (!ok) return;
    start(async () => {
      const r = await buyLand();
      if (!r.ok) return say(r.error, "bad");
      say(`Your city is now ${r.size}×${r.size}!`);
    });
  }

  const tools: { id: string; label: string; icon: React.ReactNode; mode: Mode }[] = [
    { id: "idle", label: "Select", icon: <MousePointer2 className="size-5" aria-hidden />, mode: { kind: "idle" } },
    { id: "bulldoze", label: "Bulldoze", icon: <BulldozeIcon className="size-5" />, mode: { kind: "bulldoze" } },
  ];
  const activeTool =
    mode.kind === "paint" ? mode.typeId : mode.kind === "bulldoze" ? "bulldoze" : mode.kind === "idle" || mode.kind === "selected" ? "idle" : null;
  const strokeInfo =
    stroke && mode.kind === "paint"
      ? (() => {
          const p = planPaint(stroke, mode.typeId);
          return { text: `${p.fresh.length} tile${p.fresh.length === 1 ? "" : "s"} · ${formatCoins(p.cost)} coins`, bad: !p.ok };
        })()
      : stroke && mode.kind === "bulldoze"
        ? (() => {
            const p = planDemolish(stroke);
            return { text: `${p.ids.length} to demolish · +${formatCoins(p.refund)} back`, bad: false };
          })()
        : null;

  const hint =
    mode.kind === "paint" && paintType
      ? `Drag with one finger to draw ${paintType.name.toLowerCase()} (${paintType.cost} coin${paintType.cost === 1 ? "" : "s"} a tile), then tap Build.${mode.kind === "paint" && isRoadType(mode.typeId) ? ` Across water it builds a bridge (${typeById.get(BRIDGE_TYPE)?.cost ?? 10} coins a tile); over another road it replaces it.` : ""} Trees in the way are cleared. Two fingers move the map.`
      : mode.kind === "bulldoze"
        ? "Drag over things to demolish them (you get half the price back)."
        : null;

  const selectedType = selected ? typeById.get(selected.type_id) : undefined;

  // The confirmation bar for whatever is being previewed.
  const draftPlan = mode.kind === "paint" && draftTiles.length > 0 ? planPaint(draftTiles, mode.typeId) : null;
  const draftBar: { title: string; detail: string; problem?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; onTurn?: () => void } | null =
    mode.kind === "paint" && paintType && draftPlan
      ? {
          title: `${draftPlan.fresh.length} ${paintType.name.toLowerCase()} tile${draftPlan.fresh.length === 1 ? "" : "s"} · ${formatCoins(draftPlan.cost)} coins`,
          detail:
            [
              draftPlan.bridges > 0 && `${draftPlan.bridges} as bridge${draftPlan.bridges === 1 ? "" : "s"}`,
              draftPlan.swaps > 0 && `replaces ${draftPlan.swaps} road tile${draftPlan.swaps === 1 ? "" : "s"}`,
              draftPlan.trees > 0 && `clears ${draftPlan.trees} tree tile${draftPlan.trees === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Draw more, tap a highlighted tile to take it out, or Build.",
          problem:
            draftPlan.fresh.length === 0
              ? "That's all there already."
              : draftPlan.blocked
                ? "Part of it is on a building or past your land. Tap those tiles to take them out."
                : draftPlan.sideBySide
                  ? "Roads can't run side by side. Leave a tile between them."
                : draftPlan.fresh.length > MAX_STROKE_TILES
                  ? `At most ${MAX_STROKE_TILES} tiles at a time.`
                  : draftPlan.cost > balance
                    ? `Not enough coins (you have ${formatCoins(balance)}).`
                    : undefined,
          confirmLabel: "Build",
          onConfirm: confirmPaint,
          onCancel: () => setDraftTiles([]),
        }
      : (mode.kind === "place" && placingType) || (mode.kind === "move" && movingLot)
        ? draftSpot
          ? (() => {
              const dims = draftDims ?? { w: 1, h: 1 };
              const fits = lotFree(size, { x: draftSpot.x, y: draftSpot.y, ...dims }, lots, movingLot?.id);
              const covers = lots.filter(
                (l) => l.type_id === "tree" && l.x >= draftSpot.x && l.x < draftSpot.x + dims.w && l.y >= draftSpot.y && l.y < draftSpot.y + dims.h,
              ).length;
              return {
                title: mode.kind === "place" ? `${placingType!.name} · ${formatCoins(placingType!.cost)} coins` : "Move here?",
                detail: covers > 0 ? `Clears ${covers} tree tile${covers === 1 ? "" : "s"}. Tap elsewhere to move the preview.` : "Tap elsewhere to move the preview.",
                problem: !fits
                  ? "That spot is taken or doesn't fit."
                  : mode.kind === "place" && balance < placingType!.cost
                    ? "Not enough coins yet."
                    : undefined,
                confirmLabel: mode.kind === "place" ? "Build here" : "Move here",
                onConfirm: confirmSpot,
                onCancel: () => setDraftSpot(null),
                onTurn: canTurn
                  ? () => {
                      const turned = draftDims ? { w: draftDims.h, h: draftDims.w } : null;
                      if (draftSpot && turned && !fitsAt(draftSpot.x, draftSpot.y, turned)) {
                        const spot = nearestFit(draftSpot.x, draftSpot.y, turned);
                        if (!spot) return say("It doesn't fit here turned the other way.", "bad");
                        setDraftSpot(spot);
                      }
                      setDraftRot((r) => !r);
                    }
                  : undefined,
              };
            })()
          : null
        : null;
  const selectedPlace = selected ? placeById.get(selected.id) : undefined;
  const person = (c: (typeof citizens)[number], line: string) => ({ id: c.id, name: c.name, age: c.age, line });
  const people = !selectedPlace
    ? undefined
    : selectedPlace.homes > 0
      ? { title: "Who lives here", empty: "Nobody yet.", list: citizens.filter((c) => c.homeId === selectedPlace.id).map((c) => person(c, roleText(c, placeById))) }
      : selectedPlace.school
        ? {
            title: "Students",
            empty: "No students yet. Children in homes connected by road come here.",
            list: citizens.filter((c) => c.schoolId === selectedPlace.id).map((c) => person(c, `Lives in a ${placeById.get(c.homeId)?.name ?? "home"}`)),
          }
        : selectedPlace.jobs > 0
          ? {
              title: "Who works here",
              empty: selectedPlace.entrance ? "Nobody yet. Build homes so people can take these jobs." : "Nobody can get here without a road.",
              list: citizens.filter((c) => c.workId === selectedPlace.id).map((c) => person(c, `Lives in a ${placeById.get(c.homeId)?.name ?? "home"}`)),
            }
          : undefined;
  const selectedPanel = selected ? (
    <SelectedPanel
      lot={selected}
      type={selectedType}
      pending={pending}
      warning={
        needsRoad.has(selected.id)
          ? "No road beside it, so it doesn't count yet. Build a road next to it."
          : stats.understaffed.has(selected.id)
            ? `Not enough workers: businesses are ${Math.round(stats.staffing * 100)}% staffed. Build homes so they can hire.`
            : undefined
      }
      canRotate={selectedType?.category !== "landscape" && selectedType?.category !== "road" && nextFacing(selected, roads) !== null}
      onRotate={() => rotate(selected)}
      upgrade={upgradeInfo(selected)}
      onUpgrade={() => upgrade(selected)}
      canMove={selectedType?.category !== "road" && selectedType?.category !== "landscape"}
      onMove={() => setMode({ kind: "move", id: selected.id })}
      onSell={() => sell(selected)}
      people={people}
      onPerson={(id) => {
        setMode({ kind: "idle" });
        setCitizenId(id);
      }}
      onClose={() => setMode({ kind: "idle" })}
    />
  ) : null;

  function pick(t: BuildingTypeRow) {
    setMessage(null);
    setMode(isPaint(t.id) ? { kind: "paint", typeId: t.id } : { kind: "place", typeId: t.id });
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="-mb-1">
        <CityName name={props.cityName} />
        <p aria-live="polite" className={`text-sm empty:hidden ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
          {message?.text}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          {(mode.kind === "paint" || mode.kind === "bulldoze") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2 text-sm text-ink">
              <span>
                {mode.kind === "paint" && paintType ? (
                  <>Painting <strong><BuildingIcon id={paintType.id} /> {paintType.name}</strong>.</>
                ) : (
                  <><strong><BulldozeIcon /> Bulldozer</strong> on.</>
                )}
              </span>
              <button type="button" className="btn-secondary min-h-9 px-3 py-1" onClick={() => setMode({ kind: "idle" })}>
                Done
              </button>
            </div>
          )}
          {(mode.kind === "place" || mode.kind === "move") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2 text-sm text-ink">
              <span>
                {mode.kind === "place" && placingType ? (
                  <>
                    Placing <strong><BuildingIcon id={placingType.id} /> {placingType.name}</strong>
                    {placingType.size > 1 ? ` (${placingType.size}×${placingType.size})` : ""}. Tap a spot next to a road to preview it, then Build here.
                  </>
                ) : (
                  <>Moving. Tap where it should go, then Move here.</>
                )}
              </span>
              <button
                type="button"
                className="btn-secondary min-h-9 px-3 py-1"
                onClick={() => setMode(movingLot ? { kind: "selected", id: movingLot.id } : { kind: "idle" })}
              >
                Cancel
              </button>
            </div>
          )}
          {hint && <p className="text-xs text-muted">{hint}</p>}

            <div
              ref={mapBox}
              data-map={mode.kind === "paint" || mode.kind === "bulldoze" ? "paint" : full ? "full" : "browse"}
              className={
                full
                  ? "fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-raised"
                  : "relative h-[50vh] max-h-[720px] min-h-[300px] overflow-hidden sm:h-[58vh] rounded-2xl border-4 border-line bg-raised shadow-inner"
              }
              role={full ? "dialog" : undefined}
              aria-modal={full || undefined}
              aria-label={full ? `${props.cityName}, full screen` : undefined}
            >
              <City3D
                ref={city3d}
                size={size}
                lots={lots}
                needsRoad={needsRoad}
                understaffed={stats.understaffed}
                selectedId={selected?.id}
                dimmedId={movingLot?.id}
                input={mode.kind === "paint" || mode.kind === "bulldoze" ? "stroke" : "point"}
                ghostDims={draftDims}
                ghostOk={(x, y) => !!draftDims && lotFree(size, { x, y, ...draftDims }, lots, movingLot?.id) && (!placingType || balance >= placingType.cost)}
                strokeOk={(tiles) => (mode.kind === "paint" ? planPaint(tiles, mode.typeId).ok : true)}
                strokeColor={mode.kind === "bulldoze" ? "demolish" : "build"}
                paintTypeId={mode.kind === "paint" ? mode.typeId : undefined}
                onTile={onTile}
                onStroke={onStroke}
                onStrokeChange={setStroke}
                ghostAt={draftSpot}
                onGhostMove={(t) => { if (fitsAt(t.x, t.y)) setDraftSpot(t); }}
                previewTiles={draftTiles}
                previewOk={draftPlan ? draftPlan.ok : true}
                overlay={full ? layerCells : null}
                sim={sim}
              />
              {strokeInfo && (
                <div
                  className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-bold shadow ${full ? "top-16" : "top-3"} ${
                    strokeInfo.bad ? "bg-red-600 text-white" : "bg-surface text-ink"
                  }`}
                >
                  {strokeInfo.text}
                </div>
              )}
              {pending && (
                <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow ${full ? "top-28" : "top-12"}`}>Saving…</div>
              )}
              {citizens.length > 0 && (
                <div className={`absolute left-2 flex items-center gap-1 rounded-full bg-surface/95 py-1 pr-1 pl-3 text-sm font-semibold text-ink shadow ring-1 ring-line ${full ? "top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))]" : "top-2"}`}>
                  <DayIcon t={simClock} />
                  <span className="tabular-nums" aria-label={`City time ${clockText(simClock)}`}>{clockText(simClock)}</span>
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    aria-label={paused ? "Resume the city" : "Pause the city"}
                    title={paused ? "Resume" : "Pause (then tap a car or a person)"}
                    className={`ml-1 flex size-8 items-center justify-center rounded-full ${paused ? "bg-accent text-on-accent" : "bg-raised hover:bg-line"}`}
                  >
                    {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
                  </button>
                </div>
              )}
              {draftBar && (
                <div
                  className={`absolute left-1/2 z-10 flex w-[min(26rem,calc(100%-1rem))] -translate-x-1/2 items-center gap-2 rounded-2xl bg-surface/95 p-2 pl-3 text-ink shadow-xl ring-1 ring-line backdrop-blur ${
                    full ? "bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]" : "bottom-2"
                  }`}
                  role="group"
                  aria-label="Confirm building"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{draftBar.title}</p>
                    <p className={`truncate text-xs ${draftBar.problem ? "text-bad" : "text-muted"}`}>{draftBar.problem ?? draftBar.detail}</p>
                  </div>
                  {draftBar.onTurn && (
                    <button type="button" className="btn-secondary min-h-10 shrink-0 px-3 py-1 text-sm" onClick={draftBar.onTurn} aria-label="Turn the building">
                      <RotateCw className="size-4" aria-hidden /> Turn
                    </button>
                  )}
                  <button type="button" className="btn-secondary min-h-10 shrink-0 px-3 py-1 text-sm" onClick={draftBar.onCancel}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary min-h-10 shrink-0 px-3 py-1 text-sm" disabled={!!draftBar.problem || pending} onClick={draftBar.onConfirm}>
                    {draftBar.confirmLabel}
                  </button>
                </div>
              )}
              {citizenInfo && !draftBar && (
                <div
                  className={`absolute left-2 w-[min(20rem,calc(100%-4.5rem))] rounded-2xl bg-surface/95 p-3 text-ink shadow-xl ring-1 ring-line backdrop-blur ${
                    full ? "bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]" : "bottom-2"
                  }`}
                  role="status"
                  aria-label={`${citizenInfo.name}: ${citizenInfo.status}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-xl" aria-hidden>
                      {citizenInfo.mode === "car" ? <Car className="size-5" aria-hidden /> : citizenInfo.mode === "walk" ? <Footprints className="size-5" aria-hidden /> : <House className="size-5" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {citizenInfo.name}, {citizenInfo.age}
                      </p>
                      <p className="truncate text-xs text-muted">{citizenInfo.role}</p>
                    </div>
                    <button type="button" onClick={() => setCitizenId(null)} aria-label="Close" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-raised">
                      ×
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{citizenInfo.status}</p>
                  {citizenInfo.detail && <p className="text-xs text-muted">{citizenInfo.detail}</p>}
                </div>
              )}
              {full && (
                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
                  <div className="min-w-0 rounded-2xl bg-surface/95 px-3 py-1.5 shadow ring-1 ring-line backdrop-blur">
                    <p className="truncate text-sm font-bold">
                      {props.cityName} <span className="text-coin">· <CoinIcon className="size-3.5" /> {formatCoins(balance)}</span>
                    </p>
                    {message?.text ? (
                      <p aria-live="polite" className={`text-xs ${message.tone === "bad" ? "text-bad" : "text-good"}`}>{message.text}</p>
                    ) : (
                      mode.kind === "place" && placingType ? (
                        <p className="text-xs text-muted">Placing {placingType.name}: tap a spot, then Build here.</p>
                      ) : mode.kind === "move" ? (
                        <p className="text-xs text-muted">Moving: tap where it should go, then Move here.</p>
                      ) : mode.kind === "paint" && paintType ? (
                        <p className="text-xs text-muted">Drag to draw {paintType.name.toLowerCase()}, then Build.{isRoadType(mode.typeId) ? " Across water it builds a bridge." : ""}</p>
                      ) : mode.kind === "bulldoze" ? (
                        <p className="text-xs text-muted">Drag over things to demolish them.</p>
                      ) : null
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(mode.kind === "place" || mode.kind === "move") && (
                      <button
                        type="button"
                        className="btn-secondary min-h-10 px-3 py-1 text-sm shadow"
                        onClick={() => setMode(movingLot ? { kind: "selected", id: movingLot.id } : { kind: "idle" })}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLayersOpen((o) => !o);
                        setStatsOpen(false);
                      }}
                      aria-pressed={layersOpen || !!layer}
                      className={`min-h-10 rounded-xl px-3 py-1 text-sm font-semibold shadow ${layersOpen || layer ? "bg-accent text-on-accent" : "bg-surface/95 text-ink ring-1 ring-line"}`}
                    >
                      <Layers className="size-4" aria-hidden /> Layers
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatsOpen((o) => !o);
                        setLayersOpen(false);
                      }}
                      aria-pressed={statsOpen}
                      className={`min-h-10 rounded-xl px-3 py-1 text-sm font-semibold shadow ${statsOpen ? "bg-accent text-on-accent" : "bg-surface/95 text-ink ring-1 ring-line"}`}
                    >
                      <ChartColumn className="size-4" aria-hidden /> Stats
                    </button>
                    <button type="button" onClick={exitFull} className="btn-primary min-h-10 px-3 py-1 text-sm shadow">
                      <X className="size-4" aria-hidden /> Exit
                    </button>
                  </div>
                </div>
              )}
              {full && selected && (
                <div className="absolute inset-x-0 bottom-0 flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  <div className="max-h-[50dvh] w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl">
                    {selectedPanel}
                  </div>
                </div>
              )}
              {full && !selected && mode.kind !== "move" && (
                <BuildOverlay
                  types={types}
                  progress={progress}
                  balance={balance}
                  activeId={placingType?.id ?? (mode.kind === "paint" ? mode.typeId : undefined)}
                  tools={[tools[0], tools[tools.length - 1]]}
                  activeTool={activeTool}
                  onTool={(id) => {
                    setMessage(null);
                    setMode(tools.find((t) => t.id === id)!.mode);
                  }}
                  onPick={pick}
                />
              )}
              {/* Map buttons (normal view only: in full screen, drag and scroll / pinch move the map). */}
              {!full && (
              <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-label={full ? "Exit full screen" : "Full screen"}
                  title={full ? "Exit full screen" : "Full screen"}
                  onClick={full ? exitFull : enterFull}
                  className="flex size-10 items-center justify-center rounded-lg bg-surface/95 text-lg font-bold text-ink shadow ring-1 ring-line hover:bg-raised"
                >
                  {full ? <Minimize2 className="size-5" aria-hidden /> : <Maximize2 className="size-5" aria-hidden />}
                </button>
                {!full && (
                  <button
                    type="button"
                    aria-label="Bulldoze"
                    title="Bulldoze"
                    aria-pressed={mode.kind === "bulldoze"}
                    onClick={() => {
                      setMessage(null);
                      setMode(mode.kind === "bulldoze" ? { kind: "idle" } : { kind: "bulldoze" });
                    }}
                    className={`flex size-10 items-center justify-center rounded-lg text-lg font-bold shadow ring-1 ring-line ${
                      mode.kind === "bulldoze" ? "bg-accent text-on-accent" : "bg-surface/95 text-ink hover:bg-raised"
                    }`}
                  >
                    <BulldozeIcon className="size-5" />
                  </button>
                )}
                {VIEW_BUTTONS.map((b) => (
                  <button
                    key={b.action}
                    type="button"
                    aria-label={b.label}
                    title={b.label}
                    onClick={() => viewAction(b.action)}
                    className="flex size-10 items-center justify-center rounded-lg bg-surface/95 text-lg font-bold text-ink shadow ring-1 ring-line hover:bg-raised"
                  >
                    <b.Icon className="size-5" aria-hidden />
                  </button>
                ))}
              </div>
              )}
              {full && layersOpen && (
                <div
                  role="dialog"
                  aria-label="Map layers"
                  className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] right-2 z-10 max-h-[calc(100%-11rem)] w-[min(20rem,calc(100%-1rem))] overflow-y-auto rounded-2xl bg-surface/95 p-2 text-ink shadow-2xl ring-1 ring-line backdrop-blur"
                >
                  <div className="flex items-center justify-between px-2 py-1">
                    <h2 className="font-bold">Map layers</h2>
                    <button type="button" onClick={() => setLayersOpen(false)} aria-label="Close map layers" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-raised">
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
                    <button type="button" onClick={() => setLayer(null)} aria-label="Hide layer" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-raised">
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full" style={{ background: "linear-gradient(to right, #22c55e, #eab308, #ef4444)" }} aria-hidden />
                  <div className="mt-1 flex justify-between text-xs text-muted">
                    <span>{layerInfo.good}</span>
                    <span>{layerInfo.bad}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{layerInfo.about}</p>
                </div>
              )}
              {full && statsOpen && (
                <div className="absolute top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] right-2 bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))] z-10 w-[min(30rem,calc(100%-1rem))] overflow-y-auto rounded-2xl shadow-2xl">
<CityStatsPanel stats={stats} onClose={() => setStatsOpen(false)} />
                </div>
              )}
            </div>
          <CityStatsPanel stats={stats} />
        </div>

        <div className="space-y-4">
          {selected && !full ? (
            selectedPanel
          ) : (
            <Shop
              types={types}
              progress={progress}
              balance={balance}
              activeId={placingType?.id ?? (mode.kind === "paint" ? mode.typeId : undefined)}
              onPick={pick}
            />
          )}

          <section className="card" aria-labelledby="land-h">
            <h2 id="land-h" className="font-semibold">Land</h2>
            <p className="text-sm text-muted">Your city is {size}×{size} tiles.</p>
            {size >= MAX_CITY_SIZE ? (
              <p className="mt-2 text-sm text-good">You own all the land there is!</p>
            ) : (
              <button
                type="button"
                className="btn-secondary mt-3 w-full"
                disabled={pending || balance < landPrice(props.landPurchases)}
                onClick={expand}
              >
                Expand to {size + 2}×{size + 2} · <CoinIcon /> {formatCoins(landPrice(props.landPurchases))}
              </button>
            )}
            {size < MAX_CITY_SIZE && balance < landPrice(props.landPurchases) && (
              <p className="mt-1 text-xs text-muted">{formatCoins(landPrice(props.landPurchases) - balance)} more coins to go.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
