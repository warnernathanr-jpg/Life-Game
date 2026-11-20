// Small per-device preferences kept in the browser (like the color theme).

const DAY_NIGHT_KEY = "lifecity:daynight";
export const DAY_NIGHT_EVENT = "lifecity:daynight";

/** Whether the city has day and night (default on). Off: sunny all day. */
export function readDayNight(): boolean {
  try {
    return localStorage.getItem(DAY_NIGHT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeDayNight(on: boolean) {
  try {
    localStorage.setItem(DAY_NIGHT_KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(DAY_NIGHT_EVENT));
}
