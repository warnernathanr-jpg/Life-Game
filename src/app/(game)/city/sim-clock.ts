// The city's game clock (minutes since the start of day 1) and the traffic light cycle. Kept apart from the 3D code so
// the page can read the time without loading the 3D library.

/** Where the clock starts on the server (it never runs there). */
const START = 7 * 60 + 15;

/**
 * Game clock shared across remounts (so changing the city doesn't jump the time). Each time the app is opened the city
 * starts at a random time of day (in the browser; the server never runs the clock).
 */
export const clock = { t: typeof window === "undefined" ? START : Math.floor(Math.random() * 24 * 60) };

/** The game clock now (minutes since the start of day 1). */
export const gameClock = () => clock.t;

/**
 * Traffic light state for traffic moving along x ("x") or along y ("y") at game time t: a 16-minute cycle, x first
 * (green 6.5, yellow 1.5, then red while y has its turn).
 */
export function lightFor(axis: "x" | "y", t: number): "green" | "yellow" | "red" {
  const p = ((t % 16) + 16) % 16;
  const q = axis === "x" ? p : (p + 8) % 16;
  return q < 6.5 ? "green" : q < 8 ? "yellow" : "red";
}

/** Jump the game clock (minutes since the start of day 1), e.g. for previews of the city at night. */
export function setGameClock(minutes: number) {
  clock.t = minutes;
}

