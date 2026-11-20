import { AreaIcon } from "@/components/icons";
import type { nextUnlocks } from "@/lib/game";

/** Points per life area (no countdown to the next building: that's for the build menu). */
export function AreaPoints({ unlocks }: { unlocks: ReturnType<typeof nextUnlocks> }) {
  return (
    <ul className="space-y-2">
      {unlocks.map(({ area, points }) => (
        <li key={area.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            <AreaIcon area={area.id} /> {area.label}
          </span>
          <span className="font-semibold tabular-nums">{points.toLocaleString("en-US")} pts</span>
        </li>
      ))}
    </ul>
  );
}
