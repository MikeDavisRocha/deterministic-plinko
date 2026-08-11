import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARDS, DEFAULT_ROWS, DT, Rows, ROW_COUNTS } from "../sim/config";

// Lives in core/ because src/sim/fingerprint.ts hashes the tuning with it, and
// sim/ must not import from test/.
export { hashFloats } from "../core/hash";
import { hashFloats } from "../core/hash";

/** Position and velocity at every step of one drop, at the shipped tuning. */
export function trajectory(seed: number, rows: Rows = DEFAULT_ROWS): number[] {
  const w = new World(new Board(BOARDS[rows]), seed);
  const out: number[] = [];
  while (!w.settled && out.length < 200_000) {
    w.step(DT);
    out.push(w.disc.x, w.disc.y, w.disc.vx, w.disc.vy);
  }
  return out;
}

export const trajectoryHash = (seed: number, rows: Rows = DEFAULT_ROWS) =>
  hashFloats(trajectory(seed, rows));

/** The same three seeds on every board, so a board cannot be quietly skipped. */
export const GOLDEN_SEEDS: readonly number[] = [1, 12345, 999999];

/** Every (board, seed) pair the golden check covers, in a fixed order. */
export const GOLDEN_DROPS: readonly { rows: Rows; seed: number }[] = ROW_COUNTS.flatMap(
  (rows) => GOLDEN_SEEDS.map((seed) => ({ rows, seed })),
);

/**
 * Committed under V8 (node 24.12.0), and confirmed identical under SpiderMonkey
 * and JavaScriptCore — `npm run cross-engine` computes them inside all three
 * and CI runs it on every push. `npm run golden` prints them for whatever
 * engine you point at it by hand.
 *
 * One set per board, because each board is its own arithmetic: the smaller ones
 * put the lattice at a different centreX, and a trajectory that reproduces at
 * 16 rows says nothing about one that never ran there. A board with no golden
 * hash is a board whose determinism claim is untested off V8, which is exactly
 * the gap ADR 0002 was written about.
 *
 * A change here means a trajectory moved. That is either a deliberate tuning
 * change, in which case update these AND regenerate the Derived Tables per
 * ADR 0001, or someone reintroduced an engine-dependent operation.
 */
export const GOLDEN: Readonly<Record<Rows, Readonly<Record<number, string>>>> = {
  8: {
    1: "788dfdb9",
    12345: "70d952a1",
    999999: "3a8d939b",
  },
  12: {
    1: "fe2c7c1c",
    12345: "781da038",
    999999: "0a145c39",
  },
  16: {
    1: "70fbd9a2",
    12345: "1524b76c",
    999999: "45e505ea",
  },
};
