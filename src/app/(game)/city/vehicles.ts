// Where the cars and buses are right now (world position and heading), shared between traffic.tsx and buses.tsx so
// they keep their distance from each other. Rewritten every frame; nothing here is saved.
export type VehiclePos = { x: number; z: number; hx: number; hz: number };

export const carPositions: VehiclePos[] = [];
export const busPositions = new Map<number, VehiclePos>();

/** Is `o` just ahead of `me` in the same lane and direction (within `gap`)? */
export function isAhead(me: VehiclePos, o: VehiclePos, gap: number): boolean {
  const dx = o.x - me.x;
  const dz = o.z - me.z;
  const ahead = dx * me.hx + dz * me.hz;
  const sideways = Math.abs(dx * me.hz - dz * me.hx);
  return o.hx * me.hx + o.hz * me.hz > 0.3 && sideways < 0.18 && ahead > 0.02 && ahead < gap;
}

/** Is any of these within `r` of a point (e.g. inside a crossing)? */
export function near(list: Iterable<VehiclePos>, x: number, z: number, r: number): boolean {
  for (const v of list) if (Math.hypot(v.x - x, v.z - z) < r) return true;
  return false;
}

// Development only: lets browser tests read where everyone is.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __lifeCityVehicles?: () => unknown }).__lifeCityVehicles = () => ({ cars: [...carPositions], buses: [...busPositions.values()] });
}
