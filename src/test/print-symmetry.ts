/**
 * Decisive test for the left/right bias measured at 100 million drops.
 *
 * The only randomness in a drop is the spawn jitter; everything after it is a
 * deterministic map from that one number to a bin. The board is exactly
 * mirror-symmetric (peg x are integers about centerX = 350), so the map ought
 * to be antisymmetric: spawning at centerX - j must land in bin 16 - b whenever
 * spawning at centerX + j lands in bin b.
 *
 * If that holds for every seed, the solver is symmetric and the measured
 * asymmetry lives entirely in which jitter values the RNG happens to hand out.
 * If it fails, the solver itself has a side.
 */
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { DT } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { mulberry32 } from "../core/Rng";

const board = new Board();
const bins = board.bins.length;

/** Runs a drop from an explicit spawn x, bypassing the seeded jitter. */
function binFromSpawn(x: number): number {
  const w = new World(board, 0);
  w.disc.x = x;
  w.disc.prevX = x;
  while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
  return w.binIndex;
}

const N = Number(process.argv[2] ?? 200_000);
let asymmetric = 0;
let unsettled = 0;
const examples: string[] = [];

for (let seed = 0; seed < N; seed++) {
  const j = (mulberry32(seed)() - 0.5) * 2 * board.spec.spawnJitter;
  const a = binFromSpawn(board.centerX + j);
  const b = binFromSpawn(board.centerX - j);
  if (a < 0 || b < 0) { unsettled++; continue; }
  if (a + b !== bins - 1) {
    asymmetric++;
    if (examples.length < 10) examples.push(`seed ${seed}  j=${j.toExponential(6)}  +j->${a}  -j->${b}`);
  }
}

console.log(`${N} mirrored pairs from RNG jitters`);
console.log(`  asymmetric: ${asymmetric} (${((asymmetric / N) * 100).toFixed(3)}%)`);
console.log(`  unsettled:  ${unsettled}`);
for (const e of examples) console.log(`  ${e}`);

// The RNG only ever offers the jitters it happens to pick. Sweeping a dense
// even grid tests the map itself, including spawns the RNG may never produce.
let gridAsym = 0;
const gridExamples: string[] = [];
for (let k = 1; k <= N; k++) {
  const j = (k / (N + 1)) * board.spec.spawnJitter;
  const a = binFromSpawn(board.centerX + j);
  const b = binFromSpawn(board.centerX - j);
  if (a >= 0 && b >= 0 && a + b !== bins - 1) {
    gridAsym++;
    if (gridExamples.length < 10) gridExamples.push(`j=${j.toFixed(12)}  +j->${a}  -j->${b}`);
  }
}
console.log(`\n${N} mirrored pairs on an even grid across the jitter range`);
console.log(`  asymmetric: ${gridAsym} (${((gridAsym / N) * 100).toFixed(3)}%)`);
for (const e of gridExamples) console.log(`  ${e}`);

// Secondary: is the jitter sample itself centred? A biased sample would tilt
// the distribution even with a perfectly symmetric solver.
let sum = 0;
let negatives = 0;
const M = 10_000_000;
for (let seed = 0; seed < M; seed++) {
  const j = mulberry32(seed)() - 0.5;
  sum += j;
  if (j < 0) negatives++;
}
const mean = sum / M;
console.log(`\njitter sample over ${M.toLocaleString("en-US")} sequential seeds`);
console.log(`  mean offset from centre: ${mean.toExponential(3)} (of a +/-0.5 range)`);
console.log(`  negatives: ${negatives} vs ${M - negatives} positives, z = ${
  ((negatives - M / 2) / Math.sqrt(M / 4)).toFixed(2)
}`);
