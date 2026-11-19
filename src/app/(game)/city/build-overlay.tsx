"use client";

// Full-screen city: a bottom bar of tools and building groups; tapping a group opens a pop-up of its buildings
// over the map.
import { useState } from "react";
import type { BuildingTypeRow, ProgressRow } from "@/lib/database.types";
import { AREA_BY_ID, BUILD_GROUPS, buildGroupOf, formatCoins, pointsToUnlock, type BuildGroupId } from "@/lib/game";

type Tool = { id: string; label: string; icon: string };

export function BuildOverlay({
  types,
  progress,
  balance,
  activeId,
  tools,
  activeTool,
  onTool,
  onPick,
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
}) {
  const [open, setOpen] = useState<BuildGroupId | null>(null);
  const group = BUILD_GROUPS.find((g) => g.id === open);
  const items = open ? types.filter((t) => buildGroupOf(t) === open) : [];
  const unlocked = items.filter((t) => pointsToUnlock(t, progress) === 0);
  const locked = items.filter((t) => pointsToUnlock(t, progress) > 0);
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
              <span aria-hidden>{group.icon}</span> {group.label}
            </h2>
            <button type="button" onClick={() => setOpen(null)} className="btn-secondary min-h-9 px-3 py-1 text-sm">
              Close
            </button>
          </div>
          <ul className="grid max-h-[38dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {[...unlocked, ...locked].map((t) => {
              const remaining = pointsToUnlock(t, progress);
              const isLocked = remaining > 0;
              const short = balance < t.cost;
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
                      isLocked
                        ? `${t.name}, locked: ${remaining} more ${AREA_BY_ID[t.unlock_area!].label} points`
                        : `${t.name}, ${t.cost} coins${short ? ", not enough coins" : ""}`
                    }
                    className={`flex h-full w-full flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                      activeId === t.id ? "border-accent bg-accent-soft ring-2 ring-accent" : "border-line hover:bg-raised"
                    } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span className={`flex size-12 items-center justify-center rounded-xl border-2 text-3xl ${group.tile} ${isLocked ? "grayscale" : ""}`} aria-hidden>
                      {t.icon}
                    </span>
                    <span className="text-sm leading-tight font-semibold">{t.name}</span>
                    {isLocked ? (
                      <span className="text-[11px] text-muted">
                        🔒 {remaining} {AREA_BY_ID[t.unlock_area!].icon} pts
                      </span>
                    ) : (
                      <span className={`text-xs font-bold ${short ? "text-bad" : "text-coin"}`}>
                        🪙 {formatCoins(t.cost)}
                        {t.category === "road" || t.category === "landscape" ? " / tile" : ""}
                      </span>
                    )}
                    {t.size > 1 && <span className="text-[11px] text-muted">{t.size}×{t.size}</span>}
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
            icon={g.icon}
            label={g.label}
            tile={g.tile}
            expanded={open === g.id}
            active={open === g.id || (!open && !!activeGroup && buildGroupOf(activeGroup) === g.id)}
            onClick={() => setOpen(open === g.id ? null : g.id)}
          />
        ))}
        <span className="mx-0.5 w-px shrink-0 bg-line" aria-hidden />
        {tools.slice(1).map((t) => (
          <BarButton key={t.id} icon={t.icon} label={t.label} active={activeTool === t.id && !open} onClick={() => { setOpen(null); onTool(t.id); }} />
        ))}
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
  icon: string;
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
        className={`flex size-10 items-center justify-center rounded-full border-2 text-xl ${tile ?? "border-line bg-raised"}`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}
