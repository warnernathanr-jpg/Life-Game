"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { BuildingCategory, BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import {
  AREA_BY_ID,
  CATEGORIES,
  CATEGORY_BY_ID,
  MAX_CITY_SIZE,
  cityStats,
  formatCoins,
  landPrice,
  lotFree,
  sellRefund,
  tasksToUnlock,
} from "@/lib/game";
import { buyBuilding, buyLand, moveBuilding, renameCity, sellBuilding } from "../actions";

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid">;
type Mode = { kind: "idle" } | { kind: "place"; typeId: string } | { kind: "selected"; id: string } | { kind: "move"; id: string };

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
  const lots = useMemo(
    () => placed.map((b) => ({ ...b, size: typeById.get(b.type_id)?.size ?? 1 })),
    [placed, typeById],
  );
  const stats = useMemo(() => cityStats(placed, types), [placed, types]);

  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [focus, setFocus] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [justBuilt, setJustBuilt] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  // Which building covers each tile.
  const occupant = useMemo(() => {
    const map = new Map<string, (typeof lots)[number]>();
    for (const b of lots) for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) map.set(`${b.x + dx},${b.y + dy}`, b);
    return map;
  }, [lots]);

  const placingType = mode.kind === "place" ? typeById.get(mode.typeId) : undefined;
  const movingLot = mode.kind === "move" ? lots.find((b) => b.id === mode.id) : undefined;
  const selected = mode.kind === "selected" ? lots.find((b) => b.id === mode.id) : undefined;
  const footprintSize = placingType?.size ?? movingLot?.size ?? 0;
  const preview =
    hover && footprintSize
      ? { ...hover, size: footprintSize, ok: lotFree(size, { ...hover, size: footprintSize }, lots, movingLot?.id) }
      : null;

  // Escape cancels placing / moving / selection.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setMode({ kind: "idle" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A selected building that was sold disappears from props: go back to idle.
  useEffect(() => {
    if ((mode.kind === "selected" || mode.kind === "move") && !lots.some((b) => b.id === mode.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode({ kind: "idle" });
    }
  }, [lots, mode]);

  function say(text: string, tone: "good" | "bad" = "good") {
    setMessage({ text, tone });
  }

  function activate(x: number, y: number) {
    if (pending) return;
    if (mode.kind === "place" && placingType) {
      if (!lotFree(size, { x, y, size: placingType.size }, lots)) return say("That spot is taken or doesn't fit.", "bad");
      if (balance < placingType.cost) return say("Not enough coins yet. Finish some tasks!", "bad");
      start(async () => {
        const r = await buyBuilding(placingType.id, x, y);
        if (!r.ok) return say(r.error, "bad");
        setJustBuilt(r.id);
        say(`Built a ${placingType.name} for ${formatCoins(placingType.cost)} coins.`);
        // Keep placing while you can afford another.
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
    const b = occupant.get(`${x},${y}`);
    setMode(b ? { kind: "selected", id: b.id } : { kind: "idle" });
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = moves[e.key];
    if (!d) return;
    e.preventDefault();
    const next = { x: Math.max(0, Math.min(size - 1, focus.x + d[0])), y: Math.max(0, Math.min(size - 1, focus.y + d[1])) };
    setFocus(next);
    setHover(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next.x},${next.y}"]`)?.focus();
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

  // Tiles: at least 28px each so big cities stay tappable (the board scrolls inside its frame).
  const boardWidth = `max(100%, ${size * 28}px)`;

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
          {(mode.kind === "place" || mode.kind === "move") && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-950">
              <span>
                {mode.kind === "place" && placingType
                  ? <>Placing <strong>{placingType.icon} {placingType.name}</strong>{placingType.size > 1 ? " (2×2)" : ""}. Tap an empty spot.</>
                  : <>Moving. Tap where it should go.</>}
              </span>
              <button type="button" className="btn-secondary min-h-9 px-3 py-1" onClick={() => setMode(movingLot ? { kind: "selected", id: movingLot.id } : { kind: "idle" })}>
                Cancel
              </button>
            </div>
          )}
          <div className="overflow-auto rounded-2xl border-4 border-emerald-900/20 bg-lime-200 shadow-inner">
            <div
              ref={gridRef}
              role="group"
              aria-label={`City map, ${size} by ${size} tiles. Use arrow keys to move between tiles.`}
              onKeyDown={onGridKey}
              onMouseLeave={() => setHover(null)}
              className={`relative grid aspect-square ${pending ? "cursor-wait" : ""}`}
              style={{
                width: boardWidth,
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gridTemplateRows: `repeat(${size}, 1fr)`,
                containerType: "inline-size",
              }}
            >
              {Array.from({ length: size * size }, (_, i) => {
                const x = i % size;
                const y = Math.floor(i / size);
                const b = occupant.get(`${x},${y}`);
                const t = b ? typeById.get(b.type_id) : undefined;
                return (
                  <button
                    key={`${x},${y}`}
                    type="button"
                    data-cell={`${x},${y}`}
                    tabIndex={focus.x === x && focus.y === y ? 0 : -1}
                    aria-label={t ? `${t.name} at column ${x + 1}, row ${y + 1}` : `Empty lot at column ${x + 1}, row ${y + 1}`}
                    onClick={() => { setFocus({ x, y }); activate(x, y); }}
                    onMouseEnter={() => setHover({ x, y })}
                    onFocus={() => setHover({ x, y })}
                    className={`border border-lime-300/70 outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-inset ${
                      (x + y) % 2 === 0 ? "bg-lime-200" : "bg-lime-100/70"
                    } ${mode.kind === "idle" || mode.kind === "selected" ? (b ? "cursor-pointer" : "cursor-default") : "cursor-crosshair"}`}
                    style={{ gridColumn: x + 1, gridRow: y + 1 }}
                  />
                );
              })}

              {lots.map((b) => {
                const t = typeById.get(b.type_id);
                if (!t) return null;
                const isSelected = selected?.id === b.id || movingLot?.id === b.id;
                return (
                  <div
                    key={b.id}
                    aria-hidden
                    className={`pointer-events-none z-10 m-[3%] flex items-center justify-center rounded-md border-2 shadow-sm ${
                      CATEGORY_BY_ID[t.category].tile
                    } ${isSelected ? "ring-4 ring-amber-400" : ""} ${movingLot?.id === b.id ? "opacity-40" : ""} ${
                      justBuilt === b.id ? "build-in" : ""
                    }`}
                    style={{
                      gridColumn: `${b.x + 1} / span ${b.size}`,
                      gridRow: `${b.y + 1} / span ${b.size}`,
                      fontSize: `${(62 * b.size) / size}cqw`,
                      lineHeight: 1,
                    }}
                  >
                    {t.icon}
                  </div>
                );
              })}

              {preview && (
                <div
                  aria-hidden
                  className={`pointer-events-none z-20 rounded-md border-2 border-dashed ${
                    preview.ok ? "border-emerald-700 bg-emerald-500/30" : "border-red-700 bg-red-500/30"
                  }`}
                  style={{ gridColumn: `${preview.x + 1} / span ${preview.size}`, gridRow: `${preview.y + 1} / span ${preview.size}` }}
                />
              )}
            </div>
          </div>
          <Legend />
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
              activeId={placingType?.id}
              onPick={(t) => {
                setMessage(null);
                setMode({ kind: "place", typeId: t.id });
                gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${focus.x},${focus.y}"]`)?.focus({ preventScroll: true });
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
              <p className="mt-1 text-xs text-slate-500">
                {formatCoins(landPrice(props.landPurchases) - balance)} more coins to go.
              </p>
            )}
          </section>

          {stats.tips.length > 0 && (
            <section className="card" aria-labelledby="tips-h">
              <h2 id="tips-h" className="font-semibold">City advisor</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {stats.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ stats, size }: { stats: ReturnType<typeof cityStats>; size: number }) {
  const items = [
    { label: "Population", value: formatCoins(stats.population), icon: "👥" },
    { label: "Jobs", value: formatCoins(stats.jobs), icon: "💼" },
    { label: "Happiness", value: `${stats.happiness}%`, icon: stats.happiness >= 60 ? "😊" : stats.happiness >= 40 ? "😐" : "😟" },
    { label: "City score", value: formatCoins(stats.score), icon: "⭐" },
    { label: "Land", value: `${size}×${size}`, icon: "🗺️" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5">
          <dt className="text-xs text-slate-500">{i.label}</dt>
          <dd className="font-bold"><span aria-hidden>{i.icon}</span> {i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CityName({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">{name}</h1>
        <button type="button" className="link text-sm" onClick={() => setEditing(true)}>Rename</button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={(fd) =>
        start(async () => {
          const r = await renameCity(String(fd.get("name") ?? ""));
          if (r.ok) setEditing(false);
          else setError(r.error);
        })
      }
    >
      <label className="sr-only" htmlFor="city-name">City name</label>
      <input id="city-name" name="name" defaultValue={name} maxLength={40} autoFocus className="input w-56" />
      <button className="btn-primary min-h-10" disabled={pending}>Save</button>
      <button type="button" className="btn-secondary min-h-10" onClick={() => setEditing(false)}>Cancel</button>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

function Effects({ t }: { t: BuildingTypeRow }) {
  const parts: { text: string; bad?: boolean }[] = [];
  if (t.population) parts.push({ text: `+${t.population} 👥` });
  if (t.jobs) parts.push({ text: `+${t.jobs} 💼` });
  if (t.happiness) parts.push({ text: `${t.happiness > 0 ? "+" : "−"}${Math.abs(t.happiness)} 😊`, bad: t.happiness < 0 });
  if (t.size > 1) parts.push({ text: "2×2" });
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.text} className={`rounded px-1.5 py-0.5 text-xs ${p.bad ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-700"}`}>
          {p.text}
        </span>
      ))}
    </span>
  );
}

function Shop({
  types,
  progress,
  balance,
  activeId,
  onPick,
}: {
  types: BuildingTypeRow[];
  progress: ProgressRow | null;
  balance: number;
  activeId?: string;
  onPick: (t: BuildingTypeRow) => void;
}) {
  const [tab, setTab] = useState<BuildingCategory | "all">("all");
  const shown = types.filter((t) => tab === "all" || t.category === tab);
  return (
    <section className="card" aria-labelledby="shop-h">
      <h2 id="shop-h" className="font-semibold">Build</h2>
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Building types">
        {[{ id: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            className={`min-h-9 rounded-full px-3 text-sm ${tab === c.id ? "bg-emerald-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {shown.map((t) => {
          const remaining = tasksToUnlock(t, progress);
          const locked = remaining > 0;
          const short = balance < t.cost;
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onPick(t)}
                aria-label={
                  locked
                    ? `${t.name}, locked: ${remaining} more ${AREA_BY_ID[t.unlock_area!].label.toLowerCase()} tasks`
                    : `${t.name}, ${t.cost} coins${short ? ", not enough coins" : ""}`
                }
                className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ${
                  activeId === t.id ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                } ${locked ? "cursor-not-allowed bg-slate-50 opacity-70" : ""}`}
              >
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg border-2 text-2xl ${CATEGORY_BY_ID[t.category].tile} ${locked ? "grayscale" : ""}`} aria-hidden>
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className={`shrink-0 text-sm font-bold ${short && !locked ? "text-red-700" : "text-amber-800"}`}>🪙 {formatCoins(t.cost)}</span>
                  </span>
                  {locked ? (
                    <span className="mt-0.5 block text-xs text-slate-600">
                      🔒 {remaining} more {AREA_BY_ID[t.unlock_area!].icon} {AREA_BY_ID[t.unlock_area!].label.toLowerCase()} task{remaining === 1 ? "" : "s"} to unlock
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-slate-600">{t.description}</span>
                  )}
                  <span className="mt-1 block"><Effects t={t} /></span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SelectedPanel({
  lot,
  type,
  pending,
  onMove,
  onSell,
  onClose,
}: {
  lot: Placed & { size: number };
  type?: BuildingTypeRow;
  pending: boolean;
  onMove: () => void;
  onSell: () => void;
  onClose: () => void;
}) {
  if (!type) return null;
  return (
    <section className="card" aria-labelledby="sel-h">
      <div className="flex items-start gap-3">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-xl border-2 text-3xl ${CATEGORY_BY_ID[type.category].tile}`} aria-hidden>
          {type.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="sel-h" className="font-semibold">{type.name}</h2>
          <p className="text-xs text-slate-500">{CATEGORY_BY_ID[type.category].label} · column {lot.x + 1}, row {lot.y + 1}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">×</button>
      </div>
      <p className="mt-2 text-sm text-slate-700">{type.description}</p>
      <div className="mt-2"><Effects t={type} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" disabled={pending} onClick={onMove}>Move</button>
        <button type="button" className="btn-secondary text-red-800" disabled={pending} onClick={onSell}>
          Demolish (+{formatCoins(sellRefund(lot.price_paid))})
        </button>
      </div>
      <button type="button" className="link mt-3 text-sm" onClick={onClose}>Back to the shop</button>
    </section>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label="Map colors">
      {CATEGORIES.map((c) => (
        <li key={c.id} className="flex items-center gap-1.5">
          <span className={`size-3.5 rounded border-2 ${c.tile}`} aria-hidden />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
