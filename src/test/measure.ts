/**
 * Generates the Measured Distribution artefact: `src/sim/measured.data.ts`.
 *
 *   npm run measure              -- at the committed sample count
 *   npm run measure -- 1000000   -- at a smaller one, for a quick look
 *
 * The run is sharded across worker threads by seed range. That is safe because
 * drop `s` depends on nothing but `s`: the shards compute disjoint slices of
 * exactly the sequence a single-threaded run would produce, so the artefact is
 * reproducible on any core count.
 *
 * Why this is a committed artefact and not a test fixture: the Derived Table is
 * solved against these probabilities (ADR 0001), and the tail entries need far
 * more samples than the body to be worth anything. A run this size does not
 * belong in `npm test`, so the numbers are committed and `measured.test.ts`
 * guards them.
 */
import { cpus } from "node:os";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARD, DT } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { TUNING_FINGERPRINT } from "../sim/fingerprint";

/**
 * 100 million, which is ~18 minutes on 11 shards at ~95k drops/s.
 *
 * The count is set by the rarest bin, not by the body. Bin 0 measures 7.0e-6 —
 * well under its binomial 1.5e-5 — so it lands 700 times at this sample size,
 * a 3.8% relative standard error. The same figure would be 5.3% at 50 million,
 * 12% at 10 million and 38% at 1 million. The Derived Table solves one
 * multiplier per bin, so that error lands straight in a printed payout: 3.8% on
 * bin 0 is smaller than the rounding the multiplier gets anyway, and 12% is not.
 */
const DEFAULT_RUNS = 100_000_000;

/** Reproduced exactly by measured.test.ts, which cannot afford the full run. */
const SPOT_CHECK_RUNS = 20_000;

/**
 * A never-settled drop is rare enough to name. At 100 million the shipped
 * tuning produces a handful, and "a handful" is not a good enough answer for a
 * deterministic simulation — the seeds go in the artefact so the stuck drops
 * can be replayed and fixed rather than merely counted. Capped so that a badly
 * tuned sweep cannot try to write millions of them into a source file.
 */
const MAX_RECORDED_SEEDS = 1000;

interface ShardInput { readonly lo: number; readonly hi: number; }
interface ShardResult {
  readonly counts: number[];
  readonly unsettled: number;
  /** Seeds that hit the step guard, up to MAX_RECORDED_SEEDS per shard. */
  readonly unsettledSeeds: number[];
  /** Total simulated steps, for the mean fall time. */
  readonly steps: number;
}

/** The settle loop, kept identical to `simulate()` but also reporting steps. */
function run(board: Board, lo: number, hi: number, onProgress?: (done: number) => void): ShardResult {
  const counts = new Array<number>(board.bins.length).fill(0);
  const unsettledSeeds: number[] = [];
  let unsettled = 0;
  let steps = 0;

  for (let seed = lo; seed < hi; seed++) {
    const w = new World(board, seed);
    while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
    steps += w.steps;
    // A never-settled drop must not land on counts[-1]; see monteCarlo().
    if (w.binIndex < 0) {
      unsettled++;
      if (unsettledSeeds.length < MAX_RECORDED_SEEDS) unsettledSeeds.push(seed);
    } else counts[w.binIndex]++;

    if (onProgress && (seed - lo + 1) % 250_000 === 0) onProgress(seed - lo + 1);
  }

  return { counts, unsettled, unsettledSeeds, steps };
}

if (!isMainThread) {
  const { lo, hi } = workerData as ShardInput;
  const result = run(new Board(), lo, hi, (done) => parentPort!.postMessage({ progress: done }));
  parentPort!.postMessage({ result });
} else {
  await main();
}

async function main(): Promise<void> {
  const runs = Number(process.argv[2] ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs <= 0) {
    console.error(`bad run count: ${process.argv[2]}`);
    process.exitCode = 1;
    return;
  }

  // Leave a core for the OS so the machine stays usable during a long run.
  const shards = Math.max(1, Math.min(cpus().length - 1, 16));
  const perShard = Math.ceil(runs / shards);
  const t0 = performance.now();

  console.log(`measuring ${runs.toLocaleString("en-US")} drops across ${shards} shards, tuning ${TUNING_FINGERPRINT}`);

  const done = new Array<number>(shards).fill(0);
  const report = () => {
    const total = done.reduce((a, b) => a + b, 0);
    const rate = total / ((performance.now() - t0) / 1000);
    const eta = (runs - total) / rate;
    process.stdout.write(
      `\r  ${((total / runs) * 100).toFixed(1)}%  ${(rate / 1000).toFixed(0)}k drops/s  eta ${eta.toFixed(0)}s   `,
    );
  };

  const results = await Promise.all(
    Array.from({ length: shards }, (_, i) => {
      const lo = i * perShard;
      const hi = Math.min(lo + perShard, runs);
      return new Promise<ShardResult>((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { lo, hi } });
        worker.on("message", (msg: { progress?: number; result?: ShardResult }) => {
          if (msg.progress !== undefined) { done[i] = msg.progress; report(); }
          if (msg.result) { done[i] = hi - lo; resolve(msg.result); }
        });
        worker.on("error", reject);
      });
    }),
  );

  const counts = new Array<number>(new Board().bins.length).fill(0);
  const unsettledSeeds: number[] = [];
  let unsettled = 0;
  let steps = 0;
  for (const r of results) {
    r.counts.forEach((c, i) => (counts[i] += c));
    unsettled += r.unsettled;
    unsettledSeeds.push(...r.unsettledSeeds);
    steps += r.steps;
  }
  // Shards finish out of order; the seed list must not.
  unsettledSeeds.sort((a, b) => a - b);

  const spot = run(new Board(), 0, SPOT_CHECK_RUNS);
  const seconds = (performance.now() - t0) / 1000;
  process.stdout.write(`\r  done in ${seconds.toFixed(0)}s${" ".repeat(30)}\n`);

  const settled = runs - unsettled;
  const meanFall = (steps / runs) * DT;
  // Relative to the project root, not to import.meta.url — this file runs as a
  // bundle out of node_modules/.tmp, where ../sim/ is not the source tree.
  const out = resolve(process.cwd(), "src/sim/measured.data.ts");
  writeFileSync(out, emit({ runs, counts, unsettled, unsettledSeeds, meanFall, spot }));

  console.log(`  unsettled ${unsettled}, mean fall ${meanFall.toFixed(3)}s`);
  if (unsettledSeeds.length) console.log(`  never settled: seeds ${unsettledSeeds.join(", ")}`);
  console.log(`  reachable bins ${counts.filter((c) => c > 0).length}/${counts.length}`);
  for (let i = 0; i < counts.length; i++) {
    const p = counts[i] / settled;
    console.log(`  bin ${String(i).padStart(2)}  ${String(counts[i]).padStart(10)}  ${(p * 100).toFixed(5)}%`);
  }
  console.log("\nwrote src/sim/measured.data.ts — commit it, and regenerate the Derived Table (ADR 0001).");
}

interface Emitted {
  runs: number;
  counts: number[];
  unsettled: number;
  unsettledSeeds: number[];
  meanFall: number;
  spot: ShardResult;
}

function emit({ runs, counts, unsettled, unsettledSeeds, meanFall, spot }: Emitted): string {
  const list = (xs: readonly number[]) => `[\n  ${xs.join(",\n  ")},\n]`;
  return `/**
 * GENERATED by \`npm run measure\`. Do not edit by hand.
 *
 * The Measured Distribution: what ${BOARD.rows} rows of honest physics actually do.
 *
 * Raw per-bin counts over seeds 0..${(runs - 1).toLocaleString("en-US")}. Counts rather than
 * probabilities, because counts are exact and let a later run be merged in.
 *
 * See src/sim/measured.ts for the derived views, and ADR 0001 for why the
 * Derived Table is solved against these numbers instead of against a binomial.
 */

/** The tuning these counts were measured under; see src/sim/fingerprint.ts. */
export const MEASURED_TUNING = ${JSON.stringify(TUNING_FINGERPRINT)};

export const MEASURED_SAMPLES = ${runs};

/**
 * Drops that hit the step guard, and are therefore absent from the counts
 * above. The probabilities divide by MEASURED_SAMPLES - MEASURED_UNSETTLED, so
 * a handful does not bias the distribution — but each one is a round that would
 * hang in a real game, so they are named rather than merely counted.
 */
export const MEASURED_UNSETTLED = ${unsettled};

/** Every seed above that never settled, replayable one by one. */
export const UNSETTLED_SEEDS: readonly number[] = ${
    unsettledSeeds.length ? list(unsettledSeeds) : "[]"
  };${
    unsettled > unsettledSeeds.length
      ? `\n\n/** UNSETTLED_SEEDS was capped; ${unsettled - unsettledSeeds.length} more went unrecorded. */\nexport const UNSETTLED_SEEDS_TRUNCATED = true;`
      : ""
  }

/** Simulated seconds from spawn to settle, averaged over every drop. */
export const MEASURED_MEAN_FALL_SECONDS = ${meanFall.toFixed(4)};

export const MEASURED_COUNTS: readonly number[] = ${list(counts)};

/**
 * Seeds 0..${SPOT_CHECK_RUNS - 1}, the same drops as the first slice of the run
 * above. Cheap enough for measured.test.ts to reproduce exactly, which is what
 * proves this artefact came out of the solver in the tree rather than out of an
 * older one that happened to leave a plausible-looking file behind.
 */
export const SPOT_CHECK_SAMPLES = ${SPOT_CHECK_RUNS};

export const SPOT_CHECK_COUNTS: readonly number[] = ${list(spot.counts)};
`;
}
