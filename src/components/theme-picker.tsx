"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_THEME, THEME_EVENT, THEME_KEY, THEMES, type ThemeId } from "@/lib/themes";

/** Header button that opens a list of color themes. The choice is saved in this browser. */
export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The boot script already applied the saved theme; reflect it in the picker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme((document.documentElement.dataset.theme as ThemeId) || DEFAULT_THEME);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10"
      >
        <span aria-hidden>🎨</span>
        <span className="hidden sm:inline">Theme</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-line bg-surface p-2 text-ink shadow-xl">
          <p className="px-2 pb-1 text-xs font-medium text-muted" id="theme-label">Color theme</p>
          <ul role="radiogroup" aria-labelledby="theme-label" className="space-y-0.5">
            {THEMES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={theme === t.id}
                  onClick={() => choose(t.id)}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm ${
                    theme === t.id ? "bg-accent-soft font-semibold" : "hover:bg-raised"
                  }`}
                >
                  <span aria-hidden className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-line" style={{ background: t.bg }}>
                    <span className="absolute right-0 bottom-0 size-3 rounded-tl-full" style={{ background: t.accent }} />
                  </span>
                  {t.label}
                  {theme === t.id && <span aria-hidden className="ml-auto text-accent-text">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
