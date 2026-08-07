import { Board } from "./Board";
import { World } from "./World";
import { DT, PHYS, Phys } from "./config";

/** Guard against a drop that never settles; ~166 simulated seconds. */
const MAX_STEPS = 20_000;

/** Returns the settled bin index, or -1 if the drop never settled. */
export function simulate(board: Board, seed: number, phys: Phys = PHYS): number {
  const w = new World(board, seed, phys);
  let guard = 0;
  while (!w.settled && guard++ < MAX_STEPS) w.step(DT);
  return w.binIndex;
}

export interface MonteCarloResult {
  /** Per-bin counts. Drops that never settled are NOT counted here. */
  readonly counts: number[];
  /** Number of drops that hit the step guard. Must be 0 to trust `counts`. */
  readonly unsettled: number;
}

export function monteCarlo(board: Board, runs: number, phys: Phys = PHYS): MonteCarloResult {
  const counts = new Array<number>(board.bins.length).fill(0);
  let unsettled = 0;
  for (let s = 0; s < runs; s++) {
    const bin = simulate(board, s, phys);
    // A never-settled drop would land on counts[-1] and silently corrupt the
    // Measured Distribution the Derived Table is solved against.
    if (bin < 0) unsettled++;
    else counts[bin]++;
  }
  return { counts, unsettled };
}
