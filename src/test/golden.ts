import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { DT } from "../sim/config";

/**
 * FNV-1a over the raw bit patterns of a trajectory.
 *
 * Hashing the bytes rather than the printed numbers is the point: two engines
 * that disagree by one ULP produce identical `toFixed(6)` output and different
 * bit patterns, and it is the bit patterns that decide whether a replay
 * verifies. See docs/adr/0002-no-math-hypot-in-the-solver.md.
 */
export function hashFloats(values: readonly number[]): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (const v of values) {
    buf.setFloat64(0, v);
    for (let b = 0; b < 8; b++) {
      h ^= buf.getUint8(b);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

/** Position and velocity at every step of one drop, at the shipped tuning. */
export function trajectory(seed: number): number[] {
  const w = new World(new Board(), seed);
  const out: number[] = [];
  while (!w.settled && out.length < 200_000) {
    w.step(DT);
    out.push(w.disc.x, w.disc.y, w.disc.vx, w.disc.vy);
  }
  return out;
}

export const trajectoryHash = (seed: number) => hashFloats(trajectory(seed));

/**
 * Committed under V8 (node 24.12.0). Any engine that reproduces the physics
 * bit for bit must print the same string — run `npm run golden` under bun,
 * Safari or a browser console to check a second engine.
 *
 * A change here means the trajectory moved. That is either a deliberate tuning
 * change, in which case update these AND regenerate the Derived Table per
 * ADR 0001, or someone reintroduced an engine-dependent operation.
 */
export const GOLDEN: Readonly<Record<number, string>> = {
  1: "70fbd9a2",
  12345: "1524b76c",
  999999: "45e505ea",
};
