import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { DT } from "../sim/config";

// Lives in core/ because src/sim/fingerprint.ts hashes the tuning with it, and
// sim/ must not import from test/.
export { hashFloats } from "../core/hash";
import { hashFloats } from "../core/hash";

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
 * Committed under V8 (node 24.12.0), and confirmed identical under SpiderMonkey
 * and JavaScriptCore — `npm run cross-engine` computes them inside all three
 * and CI runs it on every push. `npm run golden` prints them for whatever
 * engine you point at it by hand.
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
