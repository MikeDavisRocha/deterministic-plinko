/**
 * Generates the Measured Distribution artefacts: `src/sim/measured.<rows>.data.ts`.
 *
 *   npm run measure                 -- every shipped board, in sequence
 *   npm run measure -- 12           -- one board, at the committed sample count
 *   npm run measure -- 12 1000000   -- one board at a smaller one, for a look
 *
 * The run is sharded across worker threads by seed range. That is safe because
 * drop `s` depends on nothing but `s`: the shards compute disjoint slices of
 * exactly the sequence a single-threaded run would produce, so the artefact is
 * reproducible on any core count.
 *
 * Why these are committed artefacts and not test fixtures: the Derived Table is
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
import { BOARDS, DT, Rows, ROW_COUNTS } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { FINGERPRINTS } from "../sim/fingerprint";

/**
 * 100 million, which is ~18 minutes on 11 shards at ~95k drops/s at 16 rows,
 * and less on the shorter boards because a shorter fall is fewer steps.
 *
 * The count is set by the rarest bin of the widest board, not by the body. At
 * 16 rows bin 0 measures 7.0e-6 — well under its binomial 1.5e-5 — so it lands
 * 700 times at this sample size, a 3.8% relative standard error. The same
 * figure would be 5.3% at 50 million, 12% at 10 million and 38% at 1 million.
 * The Derived Table solves one multiplier per bin, so that error lands straight
 * in a printed payout: 3.8% on bin 0 is smaller than the rounding the
 * multiplier gets anyway, and 12% is not.
 *
 * The smaller boards keep the same count rather than a cheaper one tuned to
 * their own tails. It costs a few minutes and buys that the three artefacts are
 * the same measurement at three widths — nothing about a comparison between
 * them has to account for one of them having been sampled harder.
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

/**
 * How many seeds the Seed Index keeps per bin — the pool Outcome-First Mode
 * draws a trajectory from once the commitment has named a Target Bin. See
 * docs/adr/0006-outcome-first-steers-by-seed-index.md.
 *
 * "The first 128 seeds under MEASURED_SAMPLES that settle in bin k" is a
 * canonical set: no choice is made here that a reader could not remake, which
 * is the property that lets a player recompute the pool rather than trust it.
 *
 * 128 is what the rarest bin can afford. At 16 rows bin 0 lands 700 times in
 * 100 million, so it fills at around 18 million seeds and the pool costs
 * nothing extra to collect; asking for 1024 would push the fill past the run
 * itself. The narrower boards fill every pool almost immediately.
 */
const SEEDS_PER_BIN = 128;

interface ShardInput { readonly lo: number; readonly hi: number; readonly rows: Rows; }
interface ShardResult {
  readonly counts: number[];
  readonly unsettled: number;
  /** Seeds that hit the step guard, up to MAX_RECORDED_SEEDS per shard. */
  readonly unsettledSeeds: number[];
  /** The first SEEDS_PER_BIN seeds of this shard's slice, per bin. */
  readonly binSeeds: number[][];
  /** Total simulated steps, for the mean fall time. */
  readonly steps: number;
}

/** The settle loop, kept identical to `simulate()` but also reporting steps. */
function run(board: Board, lo: number, hi: number, onProgress?: (done: number) => void): ShardResult {
  const counts = new Array<number>(board.bins.length).fill(0);
  const binSeeds: number[][] = Array.from({ length: board.bins.length }, () => []);
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
    } else {
      counts[w.binIndex]++;
      // Only a settled drop can enter the pool, which is how Outcome-First Mode
      // is structurally incapable of picking one of the seeds that hang.
      if (binSeeds[w.binIndex].length < SEEDS_PER_BIN) binSeeds[w.binIndex].push(seed);
    }

    if (onProgress && (seed - lo + 1) % 250_000 === 0) onProgress(seed - lo + 1);
  }

  return { counts, unsettled, unsettledSeeds, binSeeds, steps };
}

if (!isMainThread) {
  const { lo, hi, rows } = workerData as ShardInput;
  const result = run(new Board(BOARDS[rows]), lo, hi, (done) =>
    parentPort!.postMessage({ progress: done }),
  );
  parentPort!.postMessage({ result });
} else {
  await main();
}

async function main(): Promise<void> {
  const [rowsArg, runsArg] = process.argv.slice(2);

  const boards = rowsArg === undefined ? [...ROW_COUNTS] : [Number(rowsArg) as Rows];
  for (const rows of boards) {
    if (!ROW_COUNTS.includes(rows)) {
      console.error(
        `no board at ${rowsArg} rows — the shipped ones are ${ROW_COUNTS.join(", ")}. ` +
        `Adding one means adding it to BOARDS in src/sim/config.ts first.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const runs = Number(runsArg ?? DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs <= 0) {
    console.error(`bad run count: ${runsArg}`);
    process.exitCode = 1;
    return;
  }

  for (const rows of boards) await measureBoard(rows, runs);

  console.log(
    `\nwrote ${boards.map((r) => `src/sim/measured.${r}.data.ts`).join(", ")} — ` +
    `commit them, and regenerate the Derived Tables (ADR 0001).`,
  );
}

async function measureBoard(rows: Rows, runs: number): Promise<void> {
  const spec = BOARDS[rows];

  // Leave a core for the OS so the machine stays usable during a long run.
  const shards = Math.max(1, Math.min(cpus().length - 1, 16));
  const perShard = Math.ceil(runs / shards);
  const t0 = performance.now();

  console.log(
    `\nmeasuring ${runs.toLocaleString("en-US")} drops on the ${rows}-row board ` +
    `across ${shards} shards, tuning ${FINGERPRINTS[rows]}`,
  );

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
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { lo, hi, rows } });
        worker.on("message", (msg: { progress?: number; result?: ShardResult }) => {
          if (msg.progress !== undefined) { done[i] = msg.progress; report(); }
          if (msg.result) { done[i] = hi - lo; resolve(msg.result); }
        });
        worker.on("error", reject);
      });
    }),
  );

  const counts = new Array<number>(new Board(spec).bins.length).fill(0);
  const binSeeds: number[][] = Array.from({ length: counts.length }, () => []);
  const unsettledSeeds: number[] = [];
  let unsettled = 0;
  let steps = 0;
  for (const r of results) {
    r.counts.forEach((c, i) => (counts[i] += c));
    unsettled += r.unsettled;
    unsettledSeeds.push(...r.unsettledSeeds);
    r.binSeeds.forEach((s, i) => binSeeds[i].push(...s));
    steps += r.steps;
  }
  // Shards finish out of order; the seed list must not.
  unsettledSeeds.sort((a, b) => a - b);
  // Each shard kept the first SEEDS_PER_BIN of its own slice, so sorting the
  // union and cutting it back yields exactly the first SEEDS_PER_BIN of the
  // whole run — the same list a single-threaded pass would have produced.
  for (let i = 0; i < binSeeds.length; i++) {
    binSeeds[i].sort((a, b) => a - b);
    binSeeds[i].length = Math.min(binSeeds[i].length, SEEDS_PER_BIN);
  }

  const spot = run(new Board(spec), 0, SPOT_CHECK_RUNS);
  const seconds = (performance.now() - t0) / 1000;
  process.stdout.write(`\r  done in ${seconds.toFixed(0)}s${" ".repeat(30)}\n`);

  const settled = runs - unsettled;
  const meanFall = (steps / runs) * DT;
  // Relative to the project root, not to import.meta.url — this file runs as a
  // bundle out of node_modules/.tmp, where ../sim/ is not the source tree.
  const out = resolve(process.cwd(), `src/sim/measured.${rows}.data.ts`);
  writeFileSync(out, emit({ rows, runs, counts, unsettled, unsettledSeeds, binSeeds, meanFall, spot }));

  console.log(`  unsettled ${unsettled}, mean fall ${meanFall.toFixed(3)}s`);
  if (unsettledSeeds.length) console.log(`  never settled: seeds ${unsettledSeeds.join(", ")}`);
  console.log(`  reachable bins ${counts.filter((c) => c > 0).length}/${counts.length}`);
  const thinnest = Math.min(...binSeeds.map((s) => s.length));
  console.log(`  seed index ${thinnest}..${SEEDS_PER_BIN} per bin (want ${SEEDS_PER_BIN})`);
  for (let i = 0; i < counts.length; i++) {
    const p = counts[i] / settled;
    console.log(`  bin ${String(i).padStart(2)}  ${String(counts[i]).padStart(10)}  ${(p * 100).toFixed(5)}%`);
  }
}

interface Emitted {
  rows: Rows;
  runs: number;
  counts: number[];
  unsettled: number;
  unsettledSeeds: number[];
  binSeeds: number[][];
  meanFall: number;
  spot: ShardResult;
}

function emit({ rows, runs, counts, unsettled, unsettledSeeds, binSeeds, meanFall, spot }: Emitted): string {
  const list = (xs: readonly number[]) => `[\n  ${xs.join(",\n  ")},\n]`;

  /** Eight to a line: 2 176 seeds one per line would bury the rest of the file. */
  const grid = (xs: readonly number[], indent: string) => {
    const lines: string[] = [];
    for (let i = 0; i < xs.length; i += 8) {
      lines.push(`${indent}  ${xs.slice(i, i + 8).join(", ")},`);
    }
    return `[\n${lines.join("\n")}\n${indent}]`;
  };

  const index = binSeeds
    .map((seeds, i) => `  // bin ${i} — ${counts[i].toLocaleString("en-US")} hit${counts[i] === 1 ? "" : "s"} in the run\n  ${grid(seeds, "  ")},`)
    .join("\n");

  return `/**
 * GENERATED by \`npm run measure -- ${rows}\`. Do not edit by hand.
 *
 * The Measured Distribution: what ${rows} rows of honest physics actually do.
 *
 * Raw per-bin counts over seeds 0..${(runs - 1).toLocaleString("en-US")}. Counts rather than
 * probabilities, because counts are exact and let a later run be merged in.
 *
 * See src/sim/measured.ts for the derived views, and ADR 0001 for why the
 * Derived Table is solved against these numbers instead of against a binomial.
 */

/** The board these counts came off. One artefact per row count; see ADR 0008. */
export const MEASURED_ROWS = ${rows};

/** The tuning these counts were measured under; see src/sim/fingerprint.ts. */
export const MEASURED_TUNING = ${JSON.stringify(FINGERPRINTS[rows])};

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

/** How many seeds the Seed Index holds per bin, where the run could fill it. */
export const SEEDS_PER_BIN = ${SEEDS_PER_BIN};

/**
 * The Seed Index: the first ${SEEDS_PER_BIN} seeds under MEASURED_SAMPLES that settle in
 * each bin. Outcome-First Mode draws a trajectory from here once the provably
 * fair commitment has named a Target Bin — see
 * docs/adr/0006-outcome-first-steers-by-seed-index.md.
 *
 * A canonical set rather than a chosen one: "the first ${SEEDS_PER_BIN} seeds that land in
 * bin k" is reproducible by anyone with the solver, so a player can recompute
 * this pool instead of trusting that it was assembled honestly.
 *
 * Every seed here settled. Any that hang are in UNSETTLED_SEEDS and cannot
 * appear below, so a steered drop cannot draw one.
 */
export const BIN_SEEDS: readonly (readonly number[])[] = [
${index}
];
`;
}
