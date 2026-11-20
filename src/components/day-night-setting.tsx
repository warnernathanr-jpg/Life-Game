"use client";

import { Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { readDayNight, writeDayNight } from "@/lib/prefs";

/** Settings card: turn the city's day / night cycle on or off (off: sunny all day). Saved on this device. */
export function DayNightSetting() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(readDayNight());
  }, []);
  return (
    <section className="card" aria-labelledby="dn-h">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="dn-h" className="flex items-center gap-2 font-semibold">
            <Sun className="size-4" aria-hidden /> Day and night
          </h2>
          <p className="text-sm text-muted">
            {on ? "Your city follows its clock: golden evenings, lights at night." : "Off: it's sunny all day."} Saved on this device.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="dn-h"
          onClick={() => {
            setOn(!on);
            writeDayNight(!on);
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-raised ring-1 ring-line"}`}
        >
          <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
        </button>
      </div>
    </section>
  );
}
