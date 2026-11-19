"use client";

// Side panels and small pieces of the city screen.
import { useState, useTransition } from "react";
import type { BuildingCategory, BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { AREA_BY_ID, CATEGORIES, CATEGORY_BY_ID, formatCoins, pointsToUnlock, sellRefund, type CityStats } from "@/lib/game";
import { renameCity } from "../actions";

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid">;

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
      {error && <p role="alert" className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}

export function Effects({ t }: { t: BuildingTypeRow }) {
  const parts: { text: string; bad?: boolean }[] = [];
  if (t.population) parts.push({ text: `+${t.population} 👥` });
  if (t.jobs) parts.push({ text: `+${t.jobs} 💼` });
  if (t.happiness) parts.push({ text: `${t.happiness > 0 ? "+" : "−"}${Math.abs(t.happiness)} 😊`, bad: t.happiness < 0 });
  if (t.size > 1) parts.push({ text: "2×2" });
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.text} className={`rounded px-1.5 py-0.5 text-xs ${p.bad ? "bg-bad-soft text-bad" : "bg-raised text-ink"}`}>
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
  // Buildable first, then locked ones (each in catalog order), so what you can build is at the top.
  const inTab = types.filter((t) => tab === "all" || t.category === tab);
  const unlocked = inTab.filter((t) => pointsToUnlock(t, progress) === 0);
  const locked = inTab.filter((t) => pointsToUnlock(t, progress) > 0);
  const shown = [...unlocked, ...locked];
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
            className={`min-h-9 rounded-full px-3 text-sm ${tab === c.id ? "bg-accent text-on-accent" : "bg-raised text-ink hover:bg-line"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {shown.map((t, i) => {
          const remaining = pointsToUnlock(t, progress);
          const locked = remaining > 0;
          const short = balance < t.cost;
          return (
            <li key={t.id}>
              {locked && i === unlocked.length && (
                <p className="mt-2 mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">🔒 Locked</p>
              )}
              <button
                type="button"
                disabled={locked}
                onClick={() => onPick(t)}
                aria-label={
                  locked
                    ? `${t.name}, locked: ${remaining} more ${AREA_BY_ID[t.unlock_area!].label} points`
                    : `${t.name}, ${t.cost} coins${short ? ", not enough coins" : ""}`
                }
                className={`flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition ${
                  activeId === t.id ? "border-accent bg-accent-soft ring-2 ring-accent" : "border-line hover:border-accent/60 hover:bg-raised"
                } ${locked ? "cursor-not-allowed bg-raised opacity-70" : ""}`}
              >
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg border-2 text-2xl ${CATEGORY_BY_ID[t.category].tile} ${locked ? "grayscale" : ""}`} aria-hidden>
                  {t.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className={`shrink-0 text-sm font-bold ${short && !locked ? "text-bad" : "text-coin"}`}>
                      🪙 {formatCoins(t.cost)}{t.category === "road" ? <span className="font-normal"> / tile</span> : null}
                    </span>
                  </span>
                  {locked ? (
                    <span className="mt-0.5 block text-xs text-muted">
                      🔒 {remaining} more {AREA_BY_ID[t.unlock_area!].icon} {AREA_BY_ID[t.unlock_area!].label} points to unlock
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
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
  warning,
  canRotate,
  onRotate,
  upgrade,
  onUpgrade,
  canMove,
  onMove,
  onSell,
  onClose,
}: {
  lot: Placed & { size: number };
  type?: BuildingTypeRow;
  pending: boolean;
  warning?: string;
  canRotate: boolean;
  onRotate: () => void;
  /** Next step for this building, with its price difference and why it can't be done yet (if so). */
  upgrade?: { to: BuildingTypeRow; cost: number; blocked?: string };
  onUpgrade: () => void;
  canMove: boolean;
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
          <p className="text-xs text-muted">{CATEGORY_BY_ID[type.category].label} · column {lot.x + 1}, row {lot.y + 1}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised">×</button>
      </div>
      {warning && (
        <p role="status" className="mt-3 rounded-lg bg-coin-soft px-3 py-2 text-sm text-ink">
          <span aria-hidden>⚠️ </span>
          {warning}
        </p>
      )}
      <p className="mt-2 text-sm text-ink">{type.description}</p>
      <div className="mt-2"><Effects t={type} /></div>
      {upgrade && (
        <div className="mt-4 rounded-xl border border-line bg-raised p-3">
          <p className="text-sm font-semibold">
            Upgrade to <span aria-hidden>{upgrade.to.icon}</span> {upgrade.to.name}
            {upgrade.to.size > type.size ? ` (${upgrade.to.size}×${upgrade.to.size})` : ""}
          </p>
          <p className="text-xs text-muted">
            +{upgrade.to.population - type.population} residents · pay the difference
          </p>
          <button type="button" className="btn-primary mt-2 w-full" disabled={pending || !!upgrade.blocked} onClick={onUpgrade}>
            ⬆️ Upgrade · 🪙 {formatCoins(upgrade.cost)}
          </button>
          {upgrade.blocked && <p className="mt-1.5 text-xs text-muted">{upgrade.blocked}</p>}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {canRotate && (
          <button type="button" className="btn-secondary col-span-2" disabled={pending} onClick={onRotate}>
            ⟳ Rotate to face the other road
          </button>
        )}
        {canMove && <button type="button" className="btn-secondary" disabled={pending} onClick={onMove}>Move</button>}
        <button type="button" className={`btn-secondary text-bad ${canMove ? "" : "col-span-2"}`} disabled={pending} onClick={onSell}>
          Demolish (+{formatCoins(sellRefund(lot.price_paid))})
        </button>
      </div>
      <button type="button" className="link mt-3 text-sm" onClick={onClose}>Back to the shop</button>
    </section>
  );
}

/** Small health badge next to the city name. */
export function HealthPill({ stats }: { stats: CityStats }) {
  const tone = healthTone(stats);
  return (
    <a href="#city-stats" className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-accent/60">
      <span className="font-medium text-muted">City health</span>
      <span className="h-2 w-16 overflow-hidden rounded-full bg-raised" aria-hidden>
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${stats.health}%` }} />
      </span>
      <span className={`font-bold ${tone.text}`}>{stats.buildings === 0 ? "—" : `${stats.health}`}</span>
    </a>
  );
}

function healthTone(stats: CityStats) {
  if (stats.buildings === 0) return { bar: "bg-faint", text: "text-muted" };
  if (stats.health >= 60) return { bar: "bg-good", text: "text-good" };
  if (stats.health >= 40) return { bar: "bg-coin", text: "text-coin" };
  return { bar: "bg-bad", text: "text-bad" };
}

/** Everything about how the city is doing: health, numbers, what drives happiness, and what to do next. */
export function CityStatsPanel({ stats }: { stats: CityStats }) {
  const tone = healthTone(stats);
  const mood = stats.happiness >= 70 ? "😊" : stats.happiness >= 45 ? "😐" : "😟";
  const numbers = [
    { label: "Population", value: formatCoins(stats.population), icon: "👥", note: stats.unemployed > 0 ? `${stats.unemployed} looking for work` : "everyone housed" },
    { label: "Jobs", value: formatCoins(stats.jobs), icon: "💼", note: stats.jobs === 0 ? "no businesses yet" : `${Math.round(stats.staffing * 100)}% staffed` },
    { label: "Happiness", value: `${stats.happiness}%`, icon: mood, note: stats.happiness >= 70 ? "residents are content" : stats.happiness >= 45 ? "could be better" : "residents are unhappy" },
    { label: "City score", value: formatCoins(stats.score), icon: "⭐", note: "population × happiness" },
  ];
  return (
    <section className="card space-y-4" aria-labelledby="city-stats" id="city-stats">
      <h2 id="city-stats-h" className="font-semibold">City Stats</h2>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">City health</span>
          <span className={`text-sm font-bold ${tone.text}`}>
            {stats.buildings === 0 ? stats.healthLabel : `${stats.health} · ${stats.healthLabel}`}
          </span>
        </div>
        <div
          className="mt-1.5 h-3 overflow-hidden rounded-full bg-raised"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.health}
          aria-label="City health"
        >
          <div className={`h-full rounded-full ${tone.bar} transition-[width]`} style={{ width: `${stats.health}%` }} />
        </div>
        {stats.buildings > 0 && (
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
            {stats.healthParts.map((h) => (
              <li key={h.key} className="flex justify-between gap-2">
                <span>{h.label}</span>
                <span className={`font-semibold tabular-nums ${h.value >= 60 ? "text-good" : h.value >= 40 ? "text-coin" : "text-bad"}`}>{h.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {numbers.map((n) => (
          <div key={n.label} className="rounded-lg bg-raised px-3 py-2">
            <dt className="text-xs text-muted">{n.label}</dt>
            <dd className="font-bold tabular-nums"><span aria-hidden>{n.icon}</span> {n.value}</dd>
            <dd className="text-[11px] text-muted">{n.note}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="text-sm font-semibold">Why happiness is {stats.happiness}%</h3>
        <ul className="mt-1.5 space-y-1 text-sm">
          <li className="flex justify-between gap-3 text-muted"><span>Starting mood</span><span className="tabular-nums">50</span></li>
          {stats.factors.filter((f) => f.value !== 0).map((f) => (
            <li key={f.key} className="flex justify-between gap-3">
              <span>{f.label}</span>
              <span className={`font-semibold tabular-nums ${f.value > 0 ? "text-good" : "text-bad"}`}>{f.value > 0 ? `+${f.value}` : `−${Math.abs(f.value)}`}</span>
            </li>
          ))}
        </ul>
      </div>

      {stats.tips.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">What to do</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {stats.tips.slice(0, 4).map((t) => (
              <li key={t} className="flex gap-2"><span aria-hidden>👉</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** What the two warning markers on the map mean. */
export function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Map markers">
      <li className="flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white" aria-hidden>!</span>
        Needs a road
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2.5 rotate-45 bg-yellow-400" aria-hidden />
        Not enough workers
      </li>
    </ul>
  );
}
