"use client";

import { useState } from "react";

type Day = { day: string; count: number };

/** Check-offs per day as a single-series column chart, with hover/focus tooltips and a table for screen readers. */
export function ActivityChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(4, ...days.map((d) => d.count));
  const top = Math.ceil(max / 2) * 2; // even number so the middle gridline is a whole count
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 8, t: 12, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / days.length;
  const barW = Math.max(6, Math.min(28, slot - 6));
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const label = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Check-offs per day over the last 14 days">
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--t-line)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--t-muted)" className="tabular-nums">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const h = y(0) - y(d.count);
          const x = cx - barW / 2;
          const r = Math.min(4, h, barW / 2);
          const yTop = y(d.count);
          const path =
            d.count === 0
              ? ""
              : `M${x},${y(0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${y(0)} Z`;
          const isActive = active === i;
          return (
            <g key={d.day}>
              {path && <path d={path} fill="var(--t-chart)" opacity={active === null || isActive ? 1 : 0.55} />}
              {(i % 2 === days.length % 2 || i === days.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--t-muted)">
                  {i === days.length - 1 ? "Today" : label(d.day, { weekday: "short" })}
                </text>
              )}
              {/* Hit target taller and wider than the bar. */}
              <rect
                x={pad.l + slot * i}
                y={pad.t}
                width={slot}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${label(d.day, { weekday: "long", month: "short", day: "numeric" })}: ${d.count} check-off${d.count === 1 ? "" : "s"}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="cursor-default outline-none focus-visible:stroke-[var(--t-accent)]"
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${((pad.l + slot * active + slot / 2) / W) * 100}%`,
            top: `${(Math.max(pad.t, y(days[active].count) - 44) / H) * 100}%`,
          }}
          aria-hidden
        >
          <p className="text-muted">{label(days[active].day, { weekday: "short", month: "short", day: "numeric" })}</p>
          <p className="font-semibold text-ink">
            {days[active].count} check-off{days[active].count === 1 ? "" : "s"}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>Check-offs per day, last 14 days</caption>
        <thead>
          <tr><th>Day</th><th>Check-offs</th></tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}><td>{label(d.day, { weekday: "long", month: "short", day: "numeric" })}</td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
