"use client";

// Flat, top-down view of the city (also the keyboard-friendly view).
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BuildingTypeRow } from "@/lib/database.types";
import { CATEGORY_BY_ID, lotFree } from "@/lib/game";
import { key, roadSet, roadShape, ROAD_TYPE, type Lot } from "@/lib/roads";
import type { Mode } from "./city-board";

export function FlatBoard({
  size,
  lots,
  typeById,
  connected,
  mode,
  selectedId,
  movingId,
  ghostSize,
  justBuilt,
  pending,
  onTile,
}: {
  size: number;
  lots: Lot[];
  typeById: Map<string, BuildingTypeRow>;
  connected: Set<string>;
  mode: Mode;
  selectedId?: string;
  movingId?: string;
  ghostSize: number;
  justBuilt: string | null;
  pending: boolean;
  onTile: (x: number, y: number) => void;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [focus, setFocus] = useState({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const roads = useMemo(() => roadSet(lots), [lots]);
  const occupant = useMemo(() => {
    const map = new Map<string, Lot>();
    for (const b of lots) for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) map.set(key(b.x + dx, b.y + dy), b);
    return map;
  }, [lots]);

  const tileCursor = mode.kind === "bulldoze" ? 1 : mode.kind === "road" ? 1 : ghostSize;
  const preview =
    hover && tileCursor
      ? {
          ...hover,
          size: tileCursor,
          ok:
            mode.kind === "bulldoze"
              ? occupant.has(key(hover.x, hover.y))
              : lotFree(size, { ...hover, size: tileCursor }, lots, movingId),
        }
      : null;

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

  return (
    <div className="overflow-auto rounded-2xl border-4 border-line bg-lime-200 shadow-inner">
      <div
        ref={gridRef}
        role="group"
        aria-label={`City map, ${size} by ${size} tiles. Use arrow keys to move between tiles.`}
        onKeyDown={onGridKey}
        onMouseLeave={() => setHover(null)}
        className={`relative grid aspect-square ${pending ? "cursor-wait" : ""}`}
        style={{
          width: `max(100%, ${size * 28}px)`,
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
          containerType: "inline-size",
        }}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const b = occupant.get(key(x, y));
          const t = b ? typeById.get(b.type_id) : undefined;
          const label = t
            ? `${t.name} at column ${x + 1}, row ${y + 1}${t.category !== "road" && b && !connected.has(b.id) ? ", needs a road" : ""}`
            : `Empty lot at column ${x + 1}, row ${y + 1}`;
          return (
            <button
              key={`${x},${y}`}
              type="button"
              data-cell={`${x},${y}`}
              tabIndex={focus.x === x && focus.y === y ? 0 : -1}
              aria-label={label}
              onClick={() => {
                setFocus({ x, y });
                onTile(x, y);
              }}
              onMouseEnter={() => setHover({ x, y })}
              onFocus={() => setHover({ x, y })}
              className={`border border-lime-300/70 outline-none focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${
                (x + y) % 2 === 0 ? "bg-lime-200" : "bg-lime-100/70"
              } ${mode.kind === "idle" || mode.kind === "selected" ? (b ? "cursor-pointer" : "cursor-default") : "cursor-crosshair"}`}
              style={{ gridColumn: x + 1, gridRow: y + 1 }}
            />
          );
        })}

        {lots.map((b) => {
          const t = typeById.get(b.type_id);
          if (!t) return null;
          const isSelected = selectedId === b.id || movingId === b.id;
          if (b.type_id === ROAD_TYPE) {
            const s = roadShape(b.x, b.y, roads);
            return (
              <div
                key={b.id}
                aria-hidden
                className={`pointer-events-none z-10 bg-slate-500 ${isSelected ? "ring-4 ring-amber-400" : ""}`}
                style={{
                  gridColumn: b.x + 1,
                  gridRow: b.y + 1,
                  // Curbs on sides without a neighboring road.
                  boxShadow: [
                    !s.n && "inset 0 3px 0 #cbd5e1",
                    !s.s && "inset 0 -3px 0 #cbd5e1",
                    !s.w && "inset 3px 0 0 #cbd5e1",
                    !s.e && "inset -3px 0 0 #cbd5e1",
                  ]
                    .filter(Boolean)
                    .join(", ") || undefined,
                }}
              />
            );
          }
          return (
            <div
              key={b.id}
              aria-hidden
              className={`pointer-events-none relative z-10 m-[3%] flex items-center justify-center rounded-md border-2 shadow-sm ${
                CATEGORY_BY_ID[t.category].tile
              } ${isSelected ? "ring-4 ring-amber-400" : ""} ${movingId === b.id ? "opacity-40" : ""} ${justBuilt === b.id ? "build-in" : ""}`}
              style={{
                gridColumn: `${b.x + 1} / span ${b.size}`,
                gridRow: `${b.y + 1} / span ${b.size}`,
                fontSize: `${(62 * b.size) / size}cqw`,
                lineHeight: 1,
              }}
            >
              {t.icon}
              {!connected.has(b.id) && <span className="absolute -top-1 -right-1 size-2.5 rotate-45 bg-red-500 ring-1 ring-white" />}
            </div>
          );
        })}

        {preview && (
          <div
            aria-hidden
            className={`pointer-events-none z-20 rounded-md border-2 border-dashed ${
              mode.kind === "bulldoze"
                ? "border-orange-700 bg-orange-500/30"
                : preview.ok
                  ? "border-emerald-700 bg-emerald-500/30"
                  : "border-red-700 bg-red-500/30"
            }`}
            style={{ gridColumn: `${preview.x + 1} / span ${preview.size}`, gridRow: `${preview.y + 1} / span ${preview.size}` }}
          />
        )}
      </div>
    </div>
  );
}
