"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { MAX_CITY_SIZE, MAX_STROKE_TILES, cityStats, formatCoins, landPrice, lotFree, pointsToUnlock, sellRefund } from "@/lib/game";
import { connectedIds, key, nextFacing, roadSet, type Facing, type Lot, type Tile } from "@/lib/roads";
import { buyBuilding, buyLand, buyTiles, moveBuilding, sellBuilding, sellMany, setFacing, upgradeBuilding } from "../actions";
import type { City3DHandle } from "./city-3d";
import { CityName, CityStatsPanel, HealthPill, Legend, SelectedPanel, Shop } from "./panels";

// three.js only loads on this page, in the browser.
const City3D = dynamic(() => import("./city-3d"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-muted">Loading 3D city…</div>,
});

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid" | "facing">;
/** Tiles painted by dragging: roads and landscaping. */
const PAINT_TYPES = ["road", "tree", "water"] as const;
type PaintType = (typeof PAINT_TYPES)[number];
const isPaint = (id: string): id is PaintType => (PAINT_TYPES as readonly string[]).includes(id);

export type Mode =
  | { kind: "idle" }
  | { kind: "place"; typeId: string }
  | { kind: "selected"; id: string }
  | { kind: "move"; id: string }
  | { kind: "paint"; typeId: PaintType }
  | { kind: "bulldoze" };

const VIEW_BUTTONS = [
  { action: "in", label: "Zoom in", icon: "+" },
  { action: "out", label: "Zoom out", icon: "−" },
  { action: "left", label: "Rotate left", icon: "⟲" },
  { action: "right", label: "Rotate right", icon: "⟳" },
  { action: "reset", label: "Reset view", icon: "⌂" },
] as const;
const FACING_WORD: Record<Facing, string> = { south: "south", east: "east", west: "west", north: "north" };

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
}) {
  const { size, placed, types, progress, balance } = props;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const lots: (Lot & { price_paid: number })[] = useMemo(
    () => placed.map((b) => ({ ...b, size: typeById.get(b.type_id)?.size ?? 1 })),
    [placed, typeById],
  );
  const roads = useMemo(() => roadSet(lots), [lots]);
  const stats = useMemo(() => cityStats(placed, types, progress), [placed, types, progress]);
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
    for (const b of lots) for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) map.set(key(b.x + dx, b.y + dy), b);
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
  const city3d = useRef<City3DHandle>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const [wheelHint, setWheelHint] = useState(false);

  // Mouse wheel over the 3D map scrolls the page like the rest of it; Ctrl/⌘ + wheel (or a trackpad pinch,
  // which browsers send as Ctrl + wheel) zooms the map. Stopping the event before it reaches the canvas leaves
  // the browser's normal scrolling in place.
  useEffect(() => {
    const el = mapBox.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // the map's controls zoom
      e.stopPropagation();
      setWheelHint(true);
      clearTimeout(timer);
      timer = setTimeout(() => setWheelHint(false), 1400);
    };
    el.addEventListener("wheel", onWheel, { capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      clearTimeout(timer);
    };
  }, []);

  const placingType = mode.kind === "place" ? typeById.get(mode.typeId) : undefined;
  const paintType = mode.kind === "paint" ? typeById.get(mode.typeId) : undefined;
  const movingLot = mode.kind === "move" ? lots.find((b) => b.id === mode.id) : undefined;
  const selected = mode.kind === "selected" ? lots.find((b) => b.id === mode.id) : undefined;
  const ghostSize = placingType?.size ?? movingLot?.size ?? 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMode({ kind: "idle" });
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
    const fresh = tiles.filter((t) => occupant.get(key(t.x, t.y))?.type_id !== typeId);
    const blocked = fresh.some((t) => occupant.has(key(t.x, t.y)) || t.x < 0 || t.y < 0 || t.x >= size || t.y >= size);
    const cost = fresh.length * cost1;
    return { fresh, blocked, cost, ok: !blocked && cost <= balance && fresh.length <= MAX_STROKE_TILES };
  }
  function planDemolish(tiles: Tile[]) {
    const ids = [...new Set(tiles.map((t) => occupant.get(key(t.x, t.y))?.id).filter(Boolean) as string[])];
    const refund = ids.reduce((s, id) => s + sellRefund(lots.find((l) => l.id === id)?.price_paid ?? 0), 0);
    return { ids, refund };
  }

  function onTile(x: number, y: number) {
    if (mode.kind === "paint") return onStroke([{ x, y }]);
    if (pending) return;
    if (mode.kind === "place" && placingType) {
      if (!lotFree(size, { x, y, size: placingType.size }, lots)) return say("That spot is taken or doesn't fit.", "bad");
      if (balance < placingType.cost) return say("Not enough coins yet. Finish some tasks!", "bad");
      start(async () => {
        const r = await buyBuilding(placingType.id, x, y);
        if (!r.ok) return say(r.error, "bad");
        const nearRoad = connectedIds([...lots, { id: r.id, type_id: placingType.id, x, y, size: placingType.size }]).has(r.id);
        say(`Built a ${placingType.name} for ${formatCoins(placingType.cost)} coins.${nearRoad ? "" : " It needs a road beside it to count."}`);
        // One building per pick: back to looking around (no Cancel needed).
        setMode({ kind: "idle" });
      });
      return;
    }
    if (mode.kind === "move" && movingLot) {
      if (!lotFree(size, { x, y, size: movingLot.size }, lots, movingLot.id)) return say("That spot is taken or doesn't fit.", "bad");
      start(async () => {
        const r = await moveBuilding(movingLot.id, x, y);
        if (!r.ok) return say(r.error, "bad");
        say("Moved.");
        setMode({ kind: "selected", id: movingLot.id });
      });
      return;
    }
    if (mode.kind === "bulldoze") return onStroke([{ x, y }]);
    const b = occupant.get(key(x, y));
    setMode(b ? { kind: "selected", id: b.id } : { kind: "idle" });
  }

  function onStroke(tiles: Tile[]) {
    // Painting accepts new strokes while earlier ones are still saving (the server checks each one);
    // only bulldozing waits, so its confirm never lists something that is already gone.
    if (tiles.length === 0 || (pending && mode.kind === "bulldoze")) return;
    if (mode.kind === "paint" && paintType) {
      const plan = planPaint(tiles, mode.typeId);
      const noun = mode.typeId === "road" ? "road" : mode.typeId === "tree" ? "trees" : "water";
      if (plan.fresh.length === 0) return say(`That's already ${noun}.`);
      if (plan.blocked) return say(`${paintType.name} can't go on top of other things or past the edge of your land.`, "bad");
      if (plan.fresh.length > MAX_STROKE_TILES) return say(`Paint at most ${MAX_STROKE_TILES} tiles at a time.`, "bad");
      if (plan.cost > balance) return say(`That costs ${formatCoins(plan.cost)} coins. You have ${formatCoins(balance)}.`, "bad");
      start(async () => {
        const r = await buyTiles(mode.typeId, plan.fresh.map((t) => [t.x, t.y]));
        if (!r.ok) return say(r.error, "bad");
        const verb = mode.typeId === "road" ? "Built" : mode.typeId === "tree" ? "Planted" : "Dug";
        say(`${verb} ${r.built} ${noun === "trees" ? (r.built === 1 ? "tree" : "trees") : `${noun} tile${r.built === 1 ? "" : "s"}`} for ${formatCoins(r.cost)} coins.`);
      });
      return;
    }
    if (mode.kind === "bulldoze") {
      const { ids, refund } = planDemolish(tiles);
      if (ids.length === 0) return say("Nothing to demolish there.");
      const what = ids.length === 1 ? `this ${typeById.get(lots.find((l) => l.id === ids[0])!.type_id)?.name ?? "item"}` : `these ${ids.length} items`;
      if (!window.confirm(`Demolish ${what} for ${formatCoins(refund)} coins back?`)) return;
      start(async () => {
        const r = await sellMany(ids);
        if (!r.ok) return say(r.error, "bad");
        say(`Demolished ${r.sold} item${r.sold === 1 ? "" : "s"}. +${formatCoins(r.refund)} coins back.`);
      });
    }
  }

  function sell(b: (typeof lots)[number]) {
    const t = typeById.get(b.type_id);
    const refund = sellRefund(b.price_paid);
    if (!window.confirm(`Demolish this ${t?.name ?? "building"} for ${formatCoins(refund)} coins back?`)) return;
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
      say(`Now facing the ${FACING_WORD[next]} road.`);
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
        if (lotFree(size, { x: b.x - dx, y: b.y - dy, size: to.size }, lots, b.id)) room = true;
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

  function expand() {
    const price = landPrice(props.landPurchases);
    if (!window.confirm(`Buy more land for ${formatCoins(price)} coins? Your city grows to ${size + 2}×${size + 2}.`)) return;
    start(async () => {
      const r = await buyLand();
      if (!r.ok) return say(r.error, "bad");
      say(`Your city is now ${r.size}×${r.size}!`);
    });
  }

  const tools: { id: string; label: string; icon: string; mode: Mode }[] = [
    { id: "idle", label: "Select", icon: "👆", mode: { kind: "idle" } },
    { id: "road", label: "Road", icon: "🛣️", mode: { kind: "paint", typeId: "road" } },
    { id: "tree", label: "Trees", icon: "🌲", mode: { kind: "paint", typeId: "tree" } },
    { id: "water", label: "Water", icon: "💧", mode: { kind: "paint", typeId: "water" } },
    { id: "bulldoze", label: "Bulldoze", icon: "🚧", mode: { kind: "bulldoze" } },
  ];
  const activeTool =
    mode.kind === "paint" ? mode.typeId : mode.kind === "bulldoze" ? "bulldoze" : mode.kind === "idle" || mode.kind === "selected" ? "idle" : null;
  const strokeInfo =
    stroke && mode.kind === "paint"
      ? (() => {
          const p = planPaint(stroke, mode.typeId);
          return { text: `${p.fresh.length} tile${p.fresh.length === 1 ? "" : "s"} · 🪙 ${formatCoins(p.cost)}`, bad: !p.ok };
        })()
      : stroke && mode.kind === "bulldoze"
        ? (() => {
            const p = planDemolish(stroke);
            return { text: `${p.ids.length} to demolish · +${formatCoins(p.refund)} back`, bad: false };
          })()
        : null;

  const hint =
    mode.kind === "paint" && paintType
      ? `Drag across the map to paint ${paintType.name.toLowerCase()} (${paintType.cost} coin${paintType.cost === 1 ? "" : "s"} a tile). Two fingers move the map.`
      : mode.kind === "bulldoze"
        ? "Drag over things to demolish them (you get half the price back)."
        : mode.kind === "idle" || mode.kind === "selected"
          ? "Tap a building to select it. On a phone: one finger scrolls the page, two fingers move and zoom the map. On a computer: drag to move, Ctrl/⌘ + scroll to zoom, right-drag to rotate."
          : null;

  const selectedType = selected ? typeById.get(selected.type_id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CityName name={props.cityName} />
        <HealthPill stats={stats} />
      </div>

      <p aria-live="polite" className={`min-h-5 text-sm ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
        {message?.text}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1 shadow-sm ring-1 ring-line" role="toolbar" aria-label="Tools">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={activeTool === t.id}
                  onClick={() => {
                    setMessage(null);
                    setMode(t.mode);
                  }}
                  className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium ${
                    activeTool === t.id ? "bg-accent text-on-accent" : "text-ink hover:bg-raised"
                  }`}
                >
                  <span aria-hidden>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {(mode.kind === "place" || mode.kind === "move") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2 text-sm text-ink">
              <span>
                {mode.kind === "place" && placingType ? (
                  <>
                    Placing <strong>{placingType.icon} {placingType.name}</strong>
                    {placingType.size > 1 ? ` (${placingType.size}×${placingType.size})` : ""}. Tap an empty spot next to a road.
                  </>
                ) : (
                  <>Moving. Tap where it should go.</>
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
              data-map={mode.kind === "paint" || mode.kind === "bulldoze" ? "paint" : "browse"}
              className="relative h-[58vh] max-h-[720px] min-h-[320px] overflow-hidden rounded-2xl border-4 border-line bg-raised shadow-inner"
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
                ghostSize={ghostSize}
                ghostOk={(x, y) => lotFree(size, { x, y, size: ghostSize }, lots, movingLot?.id) && (!placingType || balance >= placingType.cost)}
                strokeOk={(tiles) => (mode.kind === "paint" ? planPaint(tiles, mode.typeId).ok : true)}
                strokeColor={mode.kind === "bulldoze" ? "demolish" : "build"}
                paintTypeId={mode.kind === "paint" ? mode.typeId : undefined}
                onTile={onTile}
                onStroke={onStroke}
                onStrokeChange={setStroke}
              />
              {strokeInfo && (
                <div
                  className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-bold shadow ${
                    strokeInfo.bad ? "bg-red-600 text-white" : "bg-surface text-ink"
                  }`}
                >
                  {strokeInfo.text}
                </div>
              )}
              {wheelHint && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-medium text-white shadow">
                  Hold Ctrl (⌘ on Mac) and scroll to zoom the map
                </div>
              )}
              {pending && (
                <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-ink shadow">Saving…</div>
              )}
              <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
                {VIEW_BUTTONS.map((b) => (
                  <button
                    key={b.action}
                    type="button"
                    aria-label={b.label}
                    title={b.label}
                    onClick={() => viewAction(b.action)}
                    className="flex size-10 items-center justify-center rounded-lg bg-surface/95 text-lg font-bold text-ink shadow ring-1 ring-line hover:bg-raised"
                  >
                    {b.icon}
                  </button>
                ))}
              </div>
            </div>
          <Legend />
        </div>

        <div className="space-y-4">
          {selected ? (
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
              canRotate={selectedType?.category !== "landscape" && nextFacing(selected, roads) !== null}
              onRotate={() => rotate(selected)}
              upgrade={upgradeInfo(selected)}
              onUpgrade={() => upgrade(selected)}
              canMove={selectedType?.category !== "road"}
              onMove={() => setMode({ kind: "move", id: selected.id })}
              onSell={() => sell(selected)}
              onClose={() => setMode({ kind: "idle" })}
            />
          ) : (
            <Shop
              types={types}
              progress={progress}
              balance={balance}
              activeId={placingType?.id ?? (mode.kind === "paint" ? mode.typeId : undefined)}
              onPick={(t) => {
                setMessage(null);
                setMode(isPaint(t.id) ? { kind: "paint", typeId: t.id } : { kind: "place", typeId: t.id });
              }}
            />
          )}

          <CityStatsPanel stats={stats} />

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
                Expand to {size + 2}×{size + 2} · 🪙 {formatCoins(landPrice(props.landPurchases))}
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
