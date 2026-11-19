"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { MAX_CITY_SIZE, MAX_STROKE_TILES, cityStats, formatCoins, landPrice, lotFree, sellRefund } from "@/lib/game";
import { connectedIds, key, ROAD_TYPE, type Lot, type Tile } from "@/lib/roads";
import { buyBuilding, buyLand, buyRoads, moveBuilding, sellBuilding, sellMany } from "../actions";
import type { City3DHandle } from "./city-3d";
import { FlatBoard } from "./flat-board";
import { CityName, Legend, SelectedPanel, Shop, StatRow } from "./panels";

// three.js only loads on this page, in the browser.
const City3D = dynamic(() => import("./city-3d"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-600">Loading 3D city…</div>,
});

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid">;
export type Mode =
  | { kind: "idle" }
  | { kind: "place"; typeId: string }
  | { kind: "selected"; id: string }
  | { kind: "move"; id: string }
  | { kind: "road" }
  | { kind: "bulldoze" };

const VIEW_KEY = "lifecity:view";

export function CityBoard(props: {
  cityName: string;
  size: number;
  landPurchases: number;
  placed: Placed[];
  types: BuildingTypeRow[];
  progress: ProgressRow | null;
  balance: number;
}) {
  const { size, placed, types, progress, balance } = props;
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const lots: (Lot & { price_paid: number })[] = useMemo(
    () => placed.map((b) => ({ ...b, size: typeById.get(b.type_id)?.size ?? 1 })),
    [placed, typeById],
  );
  const connected = useMemo(() => connectedIds(lots), [lots]);
  const stats = useMemo(() => cityStats(placed, types), [placed, types]);
  const roadCost = typeById.get(ROAD_TYPE)?.cost ?? 5;
  const occupant = useMemo(() => {
    const map = new Map<string, (typeof lots)[number]>();
    for (const b of lots) for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) map.set(key(b.x + dx, b.y + dy), b);
    return map;
  }, [lots]);

  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [view, setView] = useState<"3d" | "flat">("3d");
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [justBuilt, setJustBuilt] = useState<string | null>(null);
  const [stroke, setStroke] = useState<Tile[] | null>(null);
  const [pending, start] = useTransition();
  const city3d = useRef<City3DHandle>(null);

  // Remember 3D / flat per browser (a convenience; falls back to 3D).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(VIEW_KEY) === "flat") setView("flat");
    } catch {}
  }, []);
  function chooseView(v: "3d" | "flat") {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  }

  const placingType = mode.kind === "place" ? typeById.get(mode.typeId) : undefined;
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

  /** Road stroke: tiles that would be built (existing road skipped), and whether it can be built. */
  function planRoad(tiles: Tile[]) {
    const fresh = tiles.filter((t) => occupant.get(key(t.x, t.y))?.type_id !== ROAD_TYPE);
    const blocked = fresh.some((t) => occupant.has(key(t.x, t.y)) || t.x < 0 || t.y < 0 || t.x >= size || t.y >= size);
    const cost = fresh.length * roadCost;
    return { fresh, blocked, cost, ok: !blocked && cost <= balance && fresh.length <= MAX_STROKE_TILES };
  }
  function planDemolish(tiles: Tile[]) {
    const ids = [...new Set(tiles.map((t) => occupant.get(key(t.x, t.y))?.id).filter(Boolean) as string[])];
    const refund = ids.reduce((s, id) => s + sellRefund(lots.find((l) => l.id === id)?.price_paid ?? 0), 0);
    return { ids, refund };
  }

  function onTile(x: number, y: number) {
    if (pending) return;
    if (mode.kind === "place" && placingType) {
      if (!lotFree(size, { x, y, size: placingType.size }, lots)) return say("That spot is taken or doesn't fit.", "bad");
      if (balance < placingType.cost) return say("Not enough coins yet. Finish some tasks!", "bad");
      start(async () => {
        const r = await buyBuilding(placingType.id, x, y);
        if (!r.ok) return say(r.error, "bad");
        setJustBuilt(r.id);
        const nearRoad = placingType.category === "road" || connectedIds([...lots, { id: r.id, type_id: placingType.id, x, y, size: placingType.size }]).has(r.id);
        say(`Built a ${placingType.name} for ${formatCoins(placingType.cost)} coins.${nearRoad ? "" : " It needs a road beside it to count."}`);
        if (balance - placingType.cost < placingType.cost) setMode({ kind: "idle" });
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
    if (mode.kind === "road" || mode.kind === "bulldoze") return onStroke([{ x, y }]);
    const b = occupant.get(key(x, y));
    setMode(b ? { kind: "selected", id: b.id } : { kind: "idle" });
  }

  function onStroke(tiles: Tile[]) {
    if (pending || tiles.length === 0) return;
    if (mode.kind === "road") {
      const plan = planRoad(tiles);
      if (plan.fresh.length === 0) return say("That's already road.");
      if (plan.blocked) return say("Roads can't go through buildings or past the edge of your land.", "bad");
      if (plan.fresh.length > MAX_STROKE_TILES) return say(`Draw at most ${MAX_STROKE_TILES} tiles at a time.`, "bad");
      if (plan.cost > balance) return say(`That road costs ${formatCoins(plan.cost)} coins. You have ${formatCoins(balance)}.`, "bad");
      start(async () => {
        const r = await buyRoads(plan.fresh.map((t) => [t.x, t.y]));
        if (!r.ok) return say(r.error, "bad");
        say(`Built ${r.built} road tile${r.built === 1 ? "" : "s"} for ${formatCoins(r.cost)} coins.`);
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

  function expand() {
    const price = landPrice(props.landPurchases);
    if (!window.confirm(`Buy more land for ${formatCoins(price)} coins? Your city grows to ${size + 2}×${size + 2}.`)) return;
    start(async () => {
      const r = await buyLand();
      if (!r.ok) return say(r.error, "bad");
      say(`Your city is now ${r.size}×${r.size}!`);
    });
  }

  const tools = [
    { kind: "idle" as const, label: "Select", icon: "👆" },
    { kind: "road" as const, label: "Road", icon: "🛣️" },
    { kind: "bulldoze" as const, label: "Bulldoze", icon: "🚧" },
  ];
  const activeTool = mode.kind === "road" || mode.kind === "bulldoze" ? mode.kind : mode.kind === "idle" || mode.kind === "selected" ? "idle" : null;
  const strokeInfo =
    stroke && mode.kind === "road"
      ? (() => {
          const p = planRoad(stroke);
          return { text: `${p.fresh.length} tile${p.fresh.length === 1 ? "" : "s"} · 🪙 ${formatCoins(p.cost)}`, bad: !p.ok };
        })()
      : stroke && mode.kind === "bulldoze"
        ? (() => {
            const p = planDemolish(stroke);
            return { text: `${p.ids.length} to demolish · +${formatCoins(p.refund)} back`, bad: false };
          })()
        : null;

  const hint =
    mode.kind === "road"
      ? view === "3d"
        ? `Drag across the map to draw a road (${roadCost} coins a tile). Use two fingers or right-drag to move the view.`
        : `Tap tiles to lay road (${roadCost} coins a tile).`
      : mode.kind === "bulldoze"
        ? view === "3d"
          ? "Drag over roads and buildings to demolish them (you get half the price back)."
          : "Tap a road or building to demolish it (half the price back)."
        : view === "3d" && (mode.kind === "idle" || mode.kind === "selected")
          ? "Drag to move around · pinch or scroll to zoom · two fingers or right-drag to rotate · tap a building to select it."
          : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <CityName name={props.cityName} />
        <StatRow stats={stats} size={size} />
      </div>

      <p aria-live="polite" className={`min-h-5 text-sm ${message?.tone === "bad" ? "text-red-700" : "text-emerald-700"}`}>
        {message?.text}
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="toolbar" aria-label="Tools">
              {tools.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  aria-pressed={activeTool === t.kind}
                  onClick={() => {
                    setMessage(null);
                    setMode({ kind: t.kind } as Mode);
                  }}
                  className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
                    activeTool === t.kind ? "bg-emerald-800 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200" role="group" aria-label="View">
              {(["3d", "flat"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => chooseView(v)}
                  className={`min-h-10 rounded-lg px-3 text-sm font-medium ${view === v ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {v === "3d" ? "3D" : "Flat"}
                </button>
              ))}
            </div>
          </div>

          {(mode.kind === "place" || mode.kind === "move") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-950">
              <span>
                {mode.kind === "place" && placingType ? (
                  <>
                    Placing <strong>{placingType.icon} {placingType.name}</strong>
                    {placingType.size > 1 ? " (2×2)" : ""}. Tap an empty spot{placingType.category === "road" ? "" : " next to a road"}.
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
          {hint && <p className="text-xs text-slate-600">{hint}</p>}

          {view === "3d" ? (
            <div
              className="relative h-[62vh] max-h-[720px] min-h-[340px] overflow-hidden rounded-2xl border-4 border-emerald-900/20 bg-sky-100 shadow-inner"
              style={{ touchAction: "none" }}
            >
              <City3D
                ref={city3d}
                size={size}
                lots={lots}
                connected={connected}
                selectedId={selected?.id}
                dimmedId={movingLot?.id}
                input={mode.kind === "road" || mode.kind === "bulldoze" ? "stroke" : "point"}
                ghostSize={ghostSize}
                ghostOk={(x, y) => lotFree(size, { x, y, size: ghostSize }, lots, movingLot?.id) && (!placingType || balance >= placingType.cost)}
                strokeOk={(tiles) => (mode.kind === "road" ? planRoad(tiles).ok : true)}
                strokeColor={mode.kind === "bulldoze" ? "demolish" : "build"}
                onTile={onTile}
                onStroke={onStroke}
                onStrokeChange={setStroke}
              />
              {strokeInfo && (
                <div
                  className={`pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-bold shadow ${
                    strokeInfo.bad ? "bg-red-600 text-white" : "bg-white text-slate-900"
                  }`}
                >
                  {strokeInfo.text}
                </div>
              )}
              {pending && (
                <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow">Saving…</div>
              )}
              <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
                {[
                  { label: "Zoom in", icon: "+", run: () => city3d.current?.zoom(0.75) },
                  { label: "Zoom out", icon: "−", run: () => city3d.current?.zoom(1.33) },
                  { label: "Rotate left", icon: "⟲", run: () => city3d.current?.rotate(-Math.PI / 4) },
                  { label: "Rotate right", icon: "⟳", run: () => city3d.current?.rotate(Math.PI / 4) },
                  { label: "Reset view", icon: "⌂", run: () => city3d.current?.reset() },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    aria-label={b.label}
                    title={b.label}
                    onClick={b.run}
                    className="flex size-10 items-center justify-center rounded-lg bg-white/95 text-lg font-bold text-slate-800 shadow ring-1 ring-slate-300 hover:bg-white"
                  >
                    {b.icon}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <FlatBoard
              size={size}
              lots={lots}
              typeById={typeById}
              connected={connected}
              mode={mode}
              selectedId={selected?.id}
              movingId={movingLot?.id}
              ghostSize={ghostSize}
              justBuilt={justBuilt}
              pending={pending}
              onTile={onTile}
            />
          )}
          <Legend threeD={view === "3d"} />
        </div>

        <div className="space-y-4">
          {selected ? (
            <SelectedPanel
              lot={selected}
              type={typeById.get(selected.type_id)}
              pending={pending}
              onMove={() => setMode({ kind: "move", id: selected.id })}
              onSell={() => sell(selected)}
              onClose={() => setMode({ kind: "idle" })}
            />
          ) : (
            <Shop
              types={types}
              progress={progress}
              balance={balance}
              activeId={placingType?.id ?? (mode.kind === "road" ? ROAD_TYPE : undefined)}
              onPick={(t) => {
                setMessage(null);
                // In 3D, roads are drawn by dragging; the flat view places one tile per tap.
                setMode(t.id === ROAD_TYPE && view === "3d" ? { kind: "road" } : { kind: "place", typeId: t.id });
              }}
            />
          )}

          <section className="card" aria-labelledby="land-h">
            <h2 id="land-h" className="font-semibold">Land</h2>
            <p className="text-sm text-slate-600">Your city is {size}×{size} tiles.</p>
            {size >= MAX_CITY_SIZE ? (
              <p className="mt-2 text-sm text-emerald-700">You own all the land there is!</p>
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
              <p className="mt-1 text-xs text-slate-500">{formatCoins(landPrice(props.landPurchases) - balance)} more coins to go.</p>
            )}
          </section>

          {stats.tips.length > 0 && (
            <section className="card" aria-labelledby="tips-h">
              <h2 id="tips-h" className="font-semibold">City advisor</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {stats.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
