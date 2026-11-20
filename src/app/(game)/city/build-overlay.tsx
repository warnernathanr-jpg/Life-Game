"use client";

// Full-screen city: a bottom bar of tools and building groups; tapping a group opens a pop-up of its buildings
// over the map.
import { useState, type ReactNode } from "react";
import { LandPlot, Lock } from "lucide-react";
import { BuildingIcon, CoinIcon, GroupIcon } from "@/components/icons";
import type { BuildingTypeRow, ProgressRow } from "@/lib/database.types";
import { AREA_BY_ID, BUILD_GROUPS, buildGroupOf, byUnlockOrder, controlByType, formatCoins, pointsToUnlock, sizeText, type BuildGroupId } from "@/lib/game";

type Tool = { id: string; label: string; icon: ReactNode };

export function BuildOverlay({
  types,
  progress,
  balance,
  activeId,
  tools,
  activeTool,
  onTool,
  onPick,
  land,
  landmarkState,
}: {
  types: BuildingTypeRow[];
  progress: ProgressRow | null;
  balance: number;
  activeId?: string;
  /** Select and Bulldoze. */
  tools: Tool[];
  activeTool: string | null;
  onTool: (id: string) => void;
  onPick: (t: BuildingTypeRow) => void;
  /** Buy more land (hidden once the city is as big as it gets). */
  land?: { price: number; onBuy: () => void };
  landmarkState?: (t: BuildingTypeRow) => { locked: boolean; note: string } | null;
}) {
  const [open, setOpen] = useState<BuildGroupId | null>(null);
  const group = BUILD_GROUPS.find((g) => g.id === open);
  const items = open ? types.filter((t) => buildGroupOf(t) === open).sort(byUnlockOrder) : [];
  const isLocked = (t: BuildingTypeRow) => landmarkState?.(t)?.locked ?? pointsToUnlock(t, progress) > 0;
  const unlocked = items.filter((t) => !isLocked(t));
  const locked = items.filter((t) => isLocked(t));
  const activeGroup = types.find((t) => t.id === activeId);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {group && (
        <div
          role="dialog"
          aria-label={`${group.label} buildings`}
          className="pointer-events-auto w-full max-w-3xl rounded-2xl bg-surface/95 p-3 shadow-2xl ring-1 ring-line backdrop-blur"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold">
              <GroupIcon id={group.id} className="size-5" /> {group.label}
            </h2>
            <button type="button" onClick={() => setOpen(null)} className="btn-secondary min-h-9 px-3 py-1 text-sm">
              Close
            </button>
          </div>
          <ul className="grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {[...unlocked, ...locked].map((t) => {
              const remaining = pointsToUnlock(t, progress);
              const special = landmarkState?.(t) ?? null;
              const isLocked = special ? special.locked : remaining > 0;
              const short = !special && balance < t.cost;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => {
                      onPick(t);
                      setOpen(null);
                    }}
                    aria-label={
                      special
                        ? `${t.name}, ${special.note}`
                        : isLocked
                          ? `${t.name}, locked: ${remaining} more ${AREA_BY_ID[t.unlock_area!].label} points`
                          : `${t.name}, ${t.cost} coins${short ? ", not enough coins" : ""}`
                    }
                    className={`flex h-full w-full flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                      activeId === t.id ? "border-accent bg-accent-soft ring-2 ring-accent" : "border-line hover:bg-raised"
                    } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span className={`flex size-12 items-center justify-center rounded-xl border-2 text-slate-800 ${group.tile} ${isLocked ? "grayscale" : ""}`} aria-hidden>
                      <BuildingIcon id={t.id} className="size-6" strokeWidth={1.75} />
                    </span>
                    <span className="text-sm leading-tight font-semibold">{t.name}</span>
                    {special ? (
                      <span className={`text-[11px] ${special.locked ? "text-muted" : "font-bold text-good"}`}>
                        {special.locked && <Lock className="inline size-3" aria-hidden />} {special.locked ? special.note : "Free"}
                      </span>
                    ) : isLocked ? (
                      <span className="text-[11px] text-muted">
                        <Lock className="inline size-3" aria-hidden /> {remaining} {AREA_BY_ID[t.unlock_area!].label} pts
                      </span>
                    ) : (
                      <span className={`text-xs font-bold ${short ? "text-bad" : "text-coin"}`}>
                        <CoinIcon className="size-3.5" /> {formatCoins(t.cost)}
                        {(t.category === "road" || t.category === "landscape") && !controlByType(t.id) ? " / tile" : ""}
                      </span>
                    )}
                    {t.size > 1 && <span className="text-[11px] text-muted">{sizeText(t)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Build menu"
        className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface/95 p-1.5 shadow-2xl ring-1 ring-line backdrop-blur"
      >
        {tools.slice(0, 1).map((t) => (
          <BarButton key={t.id} icon={t.icon} label={t.label} active={activeTool === t.id && !open} onClick={() => { setOpen(null); onTool(t.id); }} />
        ))}
        <span className="mx-0.5 w-px shrink-0 bg-line" aria-hidden />
        {BUILD_GROUPS.map((g) => (
          <BarButton
            key={g.id}
            icon={<GroupIcon id={g.id} className="size-5" strokeWidth={1.75} />}
            label={g.label}
            tile={g.tile}
            expanded={open === g.id}
            active={open === g.id || (!open && !!activeGroup && buildGroupOf(activeGroup) === g.id)}
            onClick={() => {
              // Tapping the group you're building from again (menu closed) goes back to plain Select.
              if (!open && activeGroup && buildGroupOf(activeGroup) === g.id) return onTool(tools[0].id);
              setOpen(open === g.id ? null : g.id);
            }}
          />
        ))}
        <span className="mx-0.5 w-px shrink-0 bg-line" aria-hidden />
        {tools.slice(1).map((t) => (
          <BarButton
            key={t.id}
            icon={t.icon}
            label={t.label}
            active={activeTool === t.id && !open}
            onClick={() => {
              setOpen(null);
              // Tapping an active tool again goes back to plain Select.
              onTool(activeTool === t.id ? tools[0].id : t.id);
            }}
          />
        ))}
        {land && (
          <BarButton
            icon={<LandPlot className="size-5" aria-hidden />}
            label={`Land · ${formatCoins(land.price)}`}
            active={false}
            onClick={() => {
              setOpen(null);
              land.onBuy();
            }}
          />
        )}
      </div>
    </div>
  );
}

function BarButton({
  icon,
  label,
  tile,
  active,
  expanded,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tile?: string;
  active: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      className={`flex w-[4.25rem] shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-semibold ${
        active ? "bg-accent text-on-accent" : "text-ink hover:bg-raised"
      }`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full border-2 ${tile ? `${tile} text-slate-800` : "border-line bg-raised text-ink"}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}
