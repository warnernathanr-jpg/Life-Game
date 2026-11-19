"use client";

// Side panels and small pieces of the city screen.
import { useState, useTransition } from "react";
import type { BuildingCategory, BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { AREA_BY_ID, CATEGORIES, CATEGORY_BY_ID, cityStats, formatCoins, sellRefund, tasksToUnlock } from "@/lib/game";
import { renameCity } from "../actions";

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid">;

export function StatRow({ stats, size }: { stats: ReturnType<typeof cityStats>; size: number }) {
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

export function CityName({ name }: { name: string }) {
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

export function Shop({
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
                    <span className={`shrink-0 text-sm font-bold ${short && !locked ? "text-red-700" : "text-amber-800"}`}>
                      🪙 {formatCoins(t.cost)}{t.category === "road" ? <span className="font-normal"> / tile</span> : null}
                    </span>
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

export function SelectedPanel({
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

export function Legend({ threeD }: { threeD?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Map key">
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rotate-45 bg-red-500" aria-hidden />
        Needs a road (doesn&apos;t count yet)
      </li>
      {CATEGORIES.filter((c) => !threeD || c.id !== "road").map((c) => (
        <li key={c.id} className="flex items-center gap-1.5">
          <span className={`size-3.5 rounded border-2 ${c.tile}`} aria-hidden />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
