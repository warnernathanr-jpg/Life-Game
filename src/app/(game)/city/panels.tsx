"use client";

// Side panels and small pieces of the city screen.
import { X, ArrowUp, Briefcase, Frown, Lock, Meh, Smile, Star, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { AreaIcon, BuildingIcon, CoinIcon, GroupIcon } from "@/components/icons";
import type { BuildingTypeRow, PlacedBuildingRow, ProgressRow } from "@/lib/database.types";
import { AREA_BY_ID, BUILD_GROUPS, CATEGORY_BY_ID, buildGroupOf, formatCoins, sizeText, type BuildGroupId, pointsToUnlock, sellRefund, type CityStats } from "@/lib/game";
import { renameCity } from "../actions";
import { COLOR_CHOICES } from "./models";

type Placed = Pick<PlacedBuildingRow, "id" | "type_id" | "x" | "y" | "price_paid">;

/** The city's name as the page heading. Tap it to type a new one (Enter or tapping away saves, Escape cancels). */
export function CityName({ name }: { name: string }) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const done = useRef(false);

  function save(value: string) {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    const v = value.trim();
    if (!v || v === shown) return;
    const before = shown;
    setShown(v);
    start(async () => {
      const r = await renameCity(v);
      if (r.ok) setError(null);
      else {
        setShown(before);
        setError(r.error);
      }
    });
  }

  return (
    <div>
      {editing ? (
        <input
          aria-label="City name"
          defaultValue={shown}
          maxLength={40}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => save(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(e.currentTarget.value);
            if (e.key === "Escape") {
              done.current = true;
              setEditing(false);
            }
          }}
          className="font-display w-full max-w-md rounded-md bg-transparent px-1 -mx-1 text-2xl font-bold text-ink outline-none ring-2 ring-accent"
        />
      ) : (
        <h1 className="text-2xl font-bold">
          <button
            type="button"
            title="Tap to rename"
            onClick={() => {
              done.current = false;
              setEditing(true);
            }}
            className="-mx-1 rounded-md px-1 text-left hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
          >
            {shown}
          </button>
        </h1>
      )}
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </div>
  );
}

export function Effects({ t }: { t: BuildingTypeRow }) {
  const parts: { text: string; Icon?: LucideIcon; label: string; bad?: boolean }[] = [];
  if (t.population) parts.push({ text: `+${t.population}`, Icon: Users, label: "residents" });
  if (t.jobs) parts.push({ text: `+${t.jobs}`, Icon: Briefcase, label: "jobs" });
  if (t.happiness) parts.push({ text: `${t.happiness > 0 ? "+" : "−"}${Math.abs(t.happiness)}`, Icon: Smile, label: "happiness", bad: t.happiness < 0 });
  if (t.w > 1 || t.d > 1) parts.push({ text: sizeText(t), label: "lot size" });
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.label} title={p.label} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${p.bad ? "bg-bad-soft text-bad" : "bg-raised text-ink"}`}>
          {p.text}
          {p.Icon && <p.Icon className="size-3" aria-label={p.label} />}
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
  const [tab, setTab] = useState<BuildGroupId | "all">("all");
  // Buildable first, then locked ones (each in catalog order), so what you can build is at the top.
  const inTab = types.filter((t) => buildGroupOf(t) !== null && (tab === "all" || buildGroupOf(t) === tab));
  const unlocked = inTab.filter((t) => pointsToUnlock(t, progress) === 0);
  const locked = inTab.filter((t) => pointsToUnlock(t, progress) > 0);
  const shown = [...unlocked, ...locked];
  return (
    <section className="card" aria-labelledby="shop-h">
      <h2 id="shop-h" className="font-semibold">Build</h2>
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Building types">
        {[{ id: "all" as const, label: "All" }, ...BUILD_GROUPS].map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            onClick={() => setTab(c.id)}
            className={`min-h-9 rounded-full px-3 text-sm ${tab === c.id ? "bg-accent text-on-accent" : "bg-raised text-ink hover:bg-line"}`}
          >
            {c.id !== "all" && <GroupIcon id={c.id} className="mr-1 size-3.5" />}{c.label}
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
                <p className="mt-2 mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase"><Lock className="mr-1 inline size-3" aria-hidden />Locked</p>
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
                  <BuildingIcon id={t.id} className="size-6 text-slate-800" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className={`shrink-0 text-sm font-bold ${short && !locked ? "text-bad" : "text-coin"}`}>
                      <CoinIcon className="size-3.5" /> {formatCoins(t.cost)}{t.category === "road" ? <span className="font-normal"> / tile</span> : null}
                    </span>
                  </span>
                  {locked ? (
                    <span className="mt-0.5 block text-xs text-muted">
                      <Lock className="inline size-3" aria-hidden /> {remaining} more <AreaIcon area={t.unlock_area!} className="size-3" /> {AREA_BY_ID[t.unlock_area!].label} points to unlock
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
  people,
  onPerson,
  roadChange,
  colors,
}: {
  lot: Placed & { w: number; h: number };
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
  /** Residents, staff or students of this building (from the city simulation). */
  people?: { title: string; empty: string; list: { id: string; name: string; age: number; line: string }[] };
  onPerson?: (id: string) => void;
  /** Color scheme picker (buildings only): the chosen seed (null = automatic). */
  colors?: { current: number | null; onPick: (seed: number | null) => void };
  /** For a road tile: the other road kinds it can become, for this tile or its whole street. */
  roadChange?: {
    street: number;
    options: { to: BuildingTypeRow; up: boolean; tileCost: number; streetCost: number; onTile: () => void; onStreet: () => void }[];
  };
}) {
  if (!type) return null;
  return (
    <section className="card" aria-labelledby="sel-h">
      <div className="flex items-start gap-3">
        <span className={`flex size-14 shrink-0 items-center justify-center rounded-xl border-2 text-3xl ${CATEGORY_BY_ID[type.category].tile}`} aria-hidden>
          <BuildingIcon id={type.id} className="size-7 text-slate-800" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="sel-h" className="font-semibold">{type.name}</h2>
          <p className="text-xs text-muted">{CATEGORY_BY_ID[type.category].label} · column {lot.x + 1}, row {lot.y + 1}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-raised">×</button>
      </div>
      {warning && (
        <p role="status" className="mt-3 rounded-lg bg-coin-soft px-3 py-2 text-sm text-ink">
          <TriangleAlert className="mr-1 inline size-4 text-coin" aria-hidden />
          {warning}
        </p>
      )}
      <p className="mt-2 text-sm text-ink">{type.description}</p>
      <div className="mt-2"><Effects t={type} /></div>
      {people && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">
            {people.title} {people.list.length > 0 && <span className="font-normal text-muted">· {people.list.length}</span>}
          </h3>
          {people.list.length === 0 ? (
            <p className="mt-1 text-xs text-muted">{people.empty}</p>
          ) : (
            <ul className="mt-1.5 max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {people.list.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPerson?.(p.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-raised">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}, {p.age}</span>
                      <span className="block truncate text-xs text-muted">{p.line}</span>
                    </span>
                    <span className="shrink-0 text-xs text-accent-text">Find →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {colors && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Colors</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Building colors">
            <button
              type="button"
              role="radio"
              aria-checked={colors.current === null}
              disabled={pending}
              onClick={() => colors.onPick(null)}
              className={`flex h-9 items-center rounded-full px-3 text-xs font-semibold ring-1 ${colors.current === null ? "bg-accent text-on-accent ring-accent" : "bg-raised text-ink ring-line hover:ring-accent"}`}
            >
              Auto
            </button>
            {COLOR_CHOICES.map((c, i) => (
              <button
                key={c.seed}
                type="button"
                role="radio"
                aria-checked={colors.current === c.seed}
                aria-label={`Color scheme ${i + 1}`}
                disabled={pending}
                onClick={() => colors.onPick(c.seed)}
                className={`relative size-9 overflow-hidden rounded-full ring-2 ${colors.current === c.seed ? "ring-accent ring-offset-2 ring-offset-surface" : "ring-line hover:ring-accent/60"}`}
                style={{ background: c.main }}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1/2" style={{ background: c.second }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {roadChange && roadChange.options.length > 0 && (
        <div className="mt-4 space-y-2">
          {roadChange.options.map((o) => (
            <div key={o.to.id} className="rounded-xl border border-line bg-raised p-3">
              <p className="text-sm font-semibold">
                {o.up ? "Upgrade to" : "Change to"} <BuildingIcon id={o.to.id} /> {o.to.name}
              </p>
              <div className={`mt-2 grid gap-2 ${roadChange.street > 1 ? "grid-cols-2" : ""}`}>
                <button type="button" className={`${o.up ? "btn-primary" : "btn-secondary"} flex-col gap-0 py-1.5 leading-tight`} disabled={pending} onClick={o.onTile}>
                  <span>This tile</span>
                  <span className="text-xs font-semibold"><CoinIcon className="size-3.5" /> {formatCoins(o.tileCost)}</span>
                </button>
                {roadChange.street > 1 && (
                  <button type="button" className={`${o.up ? "btn-primary" : "btn-secondary"} flex-col gap-0 py-1.5 leading-tight`} disabled={pending} onClick={o.onStreet}>
                    <span>Whole street ({roadChange.street})</span>
                    <span className="text-xs font-semibold"><CoinIcon className="size-3.5" /> {formatCoins(o.streetCost)}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">You pay the new road&apos;s price per tile.</p>
        </div>
      )}
      {upgrade && (
        <div className="mt-4 rounded-xl border border-line bg-raised p-3">
          <p className="text-sm font-semibold">
            Upgrade to <BuildingIcon id={upgrade.to.id} /> {upgrade.to.name}
            {upgrade.to.size > type.size ? ` (${sizeText(upgrade.to)})` : ""}
          </p>
          <p className="text-xs text-muted">
            +{upgrade.to.population - type.population} residents · pay the difference
          </p>
          <button type="button" className="btn-primary mt-2 w-full" disabled={pending || !!upgrade.blocked} onClick={onUpgrade}>
            <ArrowUp className="size-4" aria-hidden /> Upgrade · <CoinIcon className="size-4" /> {formatCoins(upgrade.cost)}
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
          {type.id === "bridge" ? "Take down (back to water)" : `Demolish (+${formatCoins(sellRefund(lot.price_paid))})`}
        </button>
      </div>
      <button type="button" className="link mt-3 text-sm" onClick={onClose}>Back to building</button>
    </section>
  );
}

/** Small health badge next to the city name. */
function healthTone(stats: CityStats) {
  if (stats.buildings === 0) return { bar: "bg-faint", text: "text-muted" };
  if (stats.health >= 60) return { bar: "bg-good", text: "text-good" };
  if (stats.health >= 40) return { bar: "bg-coin", text: "text-coin" };
  return { bar: "bg-bad", text: "text-bad" };
}

/** Everything about how the city is doing: health, numbers, what drives happiness, and what to do next. */
export function CityStatsPanel({ stats, onClose }: { stats: CityStats; onClose?: () => void }) {
  const tone = healthTone(stats);
  const Mood = stats.happiness >= 70 ? Smile : stats.happiness >= 45 ? Meh : Frown;
  const numbers = [
    { label: "Population", value: formatCoins(stats.population), Icon: Users, note: stats.unemployed > 0 ? `${stats.unemployed} looking for work` : "everyone housed" },
    { label: "Jobs", value: formatCoins(stats.jobs), Icon: Briefcase, note: stats.jobs === 0 ? "no businesses yet" : `${Math.round(stats.staffing * 100)}% staffed` },
    { label: "Happiness", value: `${stats.happiness}%`, Icon: Mood, note: stats.happiness >= 70 ? "residents are content" : stats.happiness >= 45 ? "could be better" : "residents are unhappy" },
    { label: "City score", value: formatCoins(stats.score), Icon: Star, note: "population × happiness" },
  ];
  return (
    <section className="card space-y-5 sm:p-6" aria-labelledby="city-stats-h" id="city-stats">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="city-stats-h" className="text-xl font-bold">City Stats</h2>
        <span className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${tone.text}`}>{stats.healthLabel}</span>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close City Stats" className="flex size-9 items-center justify-center rounded-lg bg-raised text-muted hover:bg-line">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </span>
      </div>

      <div className="rounded-2xl bg-raised p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">City health</span>
          <span className={`text-3xl font-black tabular-nums ${tone.text}`}>{stats.buildings === 0 ? "—" : stats.health}</span>
        </div>
        <div
          className="mt-2 h-4 overflow-hidden rounded-full bg-surface"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stats.health}
          aria-label="City health"
        >
          <div className={`h-full rounded-full ${tone.bar} transition-[width]`} style={{ width: `${stats.health}%` }} />
        </div>
        {stats.buildings > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted sm:grid-cols-4">
            {stats.healthParts.map((h) => (
              <li key={h.key} className="flex justify-between gap-2 sm:flex-col sm:gap-0">
                <span>{h.label}</span>
                <span className={`font-bold tabular-nums ${h.value >= 60 ? "text-good" : h.value >= 40 ? "text-coin" : "text-bad"}`}>{h.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {numbers.map((n) => (
          <div key={n.label} className="rounded-2xl bg-raised p-4">
            <dt className="text-sm text-muted">{n.label}</dt>
            <dd className="mt-1 flex items-center gap-2 text-3xl font-black tabular-nums"><n.Icon className="size-6 shrink-0 text-muted" aria-hidden /> {n.value}</dd>
            <dd className="mt-0.5 text-xs text-muted">{n.note}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-raised p-4">
          <h3 className="font-semibold">Why happiness is {stats.happiness}%</h3>
          <ul className="mt-2 space-y-1.5">
            <li className="flex justify-between gap-3 text-muted"><span>Starting mood</span><span className="tabular-nums">50</span></li>
            {stats.factors.filter((f) => f.value !== 0).map((f) => (
              <li key={f.key} className="flex justify-between gap-3">
                <span>{f.label}</span>
                <span className={`font-bold tabular-nums ${f.value > 0 ? "text-good" : "text-bad"}`}>{f.value > 0 ? `+${f.value}` : `−${Math.abs(f.value)}`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-raised p-4">
          <h3 className="font-semibold">What to do</h3>
          {stats.tips.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {stats.tips.slice(0, 5).map((t) => (
                <li key={t} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" /><span>{t}</span></li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted">Your city is in great shape. Keep building!</p>
          )}
        </div>
      </div>
    </section>
  );
}
