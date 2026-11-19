// Color themes. Values live in globals.css ([data-theme="…"]); this list drives the picker.
export const THEMES = [
  { id: "navy", label: "Navy", bg: "#0a1128", accent: "#3b82f6" },
  { id: "midnight", label: "Midnight", bg: "#120d24", accent: "#8b5cf6" },
  { id: "forest", label: "Forest", bg: "#08150f", accent: "#10b981" },
  { id: "ember", label: "Ember", bg: "#121212", accent: "#f97316" },
  { id: "light", label: "Light", bg: "#f1f4fa", accent: "#1d4ed8" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "navy";
export const THEME_KEY = "lifecity:theme";
/** Fired on window when the theme changes (the 3D view re-reads its sky color). */
export const THEME_EVENT = "lifecity:theme";

/** Runs before first paint (inline in <head>) so the saved theme shows without a flash. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t&&${JSON.stringify(
  THEMES.map((t) => t.id),
)}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`;
