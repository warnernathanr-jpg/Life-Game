import type { nextUnlocks } from "@/lib/game";

/** Points per life area with progress toward each area's next building. */
export function AreaPoints({ unlocks }: { unlocks: ReturnType<typeof nextUnlocks> }) {
  return (
    <ul className="space-y-3">
      {unlocks.map(({ area, points, next, remaining }) => (
        <li key={area.id}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              <span aria-hidden>{area.icon}</span> {area.label}
            </span>
            <span className="font-semibold tabular-nums">{points.toLocaleString("en-US")} pts</span>
          </div>
          {next ? (
            <>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.min(100, (points / (next.unlock_points ?? 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {remaining} more → <span aria-hidden>{next.icon}</span> {next.name}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-good">All {area.label.toLowerCase()} buildings unlocked</p>
          )}
        </li>
      ))}
    </ul>
  );
}
