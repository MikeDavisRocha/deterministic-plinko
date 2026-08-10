import { BOARD } from "../sim/config";
import { BIN_SEEDS } from "../sim/measured";
import { FairSeeds, floatsOf, targetBinOf } from "./commitment";

/**
 * Steering: how a disc reaches the Target Bin the commitment already named.
 *
 * The physics is not touched, persuaded or nudged. The Seed Index in
 * measured.data.ts lists, per bin, the first 128 seeds under MEASURED_SAMPLES
 * that settle there, so steering is a lookup — the commitment picks the bin and
 * then picks a seed out of that bin's pool, and the solver runs exactly the drop
 * it would have run in Physics-First Mode. Same `World`, same `step()`, same
 * replay.
 *
 * That is the whole trick, and it is worth being plain about what it costs and
 * what it does not. It does not cost honesty in the trajectory: nothing about
 * the fall is faked, and a player who replays the seed gets the same fall. It
 * costs a finite pool — 128 distinct falls per bin — and an artefact that has to
 * be regenerated whenever the solver changes, on the same terms as the Measured
 * Distribution it ships beside.
 *
 * See docs/adr/0006-outcome-first-steers-by-seed-index.md, which also records
 * why searching for a seed live was rejected: bin 0 is one drop in about
 * 143 000 under the physics, so the search that costs nothing in the body costs
 * ten seconds in the tail, and a search you are allowed to give up on is not a
 * commitment you are allowed to make.
 */

/** What the commitment decided, and the drop that will show it. */
export interface SteeredDrop {
  /** The bin drawn from the commitment, before anything was simulated. */
  readonly targetBin: number;
  /** The seed to hand `new World(board, seed)`. Settles in `targetBin`. */
  readonly seed: number;
  /** Where in the bin's pool the seed came from, for a verifier to follow. */
  readonly poolIndex: number;
  readonly poolSize: number;
}

export function steerOf(seeds: FairSeeds, rows: number = BOARD.rows): SteeredDrop {
  const targetBin = targetBinOf(seeds, rows);
  const pool = BIN_SEEDS[targetBin];

  if (!pool?.length) {
    throw new Error(
      `no seed indexed for bin ${targetBin} — the Seed Index in ` +
      `measured.data.ts is empty there, so this bin was drawn but cannot be ` +
      `shown. Regenerate with \`npm run measure\` at a sample count that ` +
      `fills it.`,
    );
  }

  // One float past the walk. Deriving the whole stream a second time costs a
  // third HMAC round and a few microseconds, and buys that the walk's threshold
  // is written down in exactly one place — in targetBinOf, above.
  const pick = floatsOf(seeds, rows + 1)[rows];
  const poolIndex = Math.min(pool.length - 1, Math.floor(pick * pool.length));

  return { targetBin, seed: pool[poolIndex], poolIndex, poolSize: pool.length };
}
