"use client";

import { Check, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_EVENT, THEME_KEY, THEMES, type ThemeId } from "@/lib/themes";

/** The Settings card for choosing a color theme. The choice is saved in this browser. */
export function ThemeSettings() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    // The boot script already applied the saved theme; reflect it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme((document.documentElement.dataset.theme as ThemeId) || DEFAULT_THEME);
  }, []);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <section className="card" aria-labelledby="theme-h">
      <h2 id="theme-h" className="flex items-center gap-2 font-semibold">
        <Palette className="size-4" aria-hidden /> Color theme
      </h2>
      <p className="mb-3 text-sm text-muted">Saved on this device.</p>
      <ul role="radiogroup" aria-labelledby="theme-h" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEMES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              onClick={() => choose(t.id)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm ring-1 ${
                theme === t.id ? "bg-accent-soft font-semibold ring-accent" : "ring-line hover:bg-raised"
              }`}
            >
              <span aria-hidden className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-line" style={{ background: t.bg }}>
                <span className="absolute right-0 bottom-0 size-3 rounded-tl-full" style={{ background: t.accent }} />
              </span>
              {t.label}
              {theme === t.id && <Check className="ml-auto size-4 text-accent-text" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
