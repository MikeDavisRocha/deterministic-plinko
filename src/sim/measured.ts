import { Rows, ROW_COUNTS } from "./config";
import * as data8 from "./measured.8.data";
import * as data12 from "./measured.12.data";
import * as data16 from "./measured.16.data";

/**
 * The Measured Distributions, as the rest of the code should read them.
 *
 * measured.<rows>.data.ts is generated and holds raw counts; this module holds
 * the views derived from them. Keeping the two apart means `npm run measure`
 * never rewrites logic — it only ever replaces numbers.
 *
 * One run per board, because a row count is a different board and its
 * distribution is a different measurement. Nothing here averages, interpolates
 * or extrapolates between them: an 8-row board's probabilities came off an
 * 8-row board.
 */

/** The shape `npm run measure` emits. One per row count. */
export interface MeasuredData {
  readonly MEASURED_ROWS: number;
  readonly MEASURED_TUNING: string;
  readonly MEASURED_SAMPLES: number;
  readonly MEASURED_UNSETTLED: number;
  readonly UNSETTLED_SEEDS: readonly number[];
  readonly MEASURED_MEAN_FALL_SECONDS: number;
  readonly MEASURED_COUNTS: readonly number[];
  readonly SPOT_CHECK_SAMPLES: number;
  readonly SPOT_CHECK_COUNTS: readonly number[];
  readonly SEEDS_PER_BIN: number;
  readonly BIN_SEEDS: readonly (readonly number[])[];
}

export interface MeasuredRun {
  readonly rows: number;
  /** The tuning fingerprint the counts were measured under. */
  readonly tuning: string;
  readonly samples: number;
  readonly unsettled: number;
  readonly unsettledSeeds: readonly number[];
  readonly meanFallSeconds: number;
  readonly counts: readonly number[];
  readonly spotCheckSamples: number;
  readonly spotCheckCounts: readonly number[];
  readonly seedsPerBin: number;
  readonly binSeeds: readonly (readonly number[])[];

  /** Drops that actually reached a bin. The denominator for every probability. */
  readonly settled: number;

  /**
   * How often a drop grinds down the lattice instead of falling through it and
   * hits the step guard. Not a rounding error in the distribution — those drops
   * are excluded from the counts — but a rate a real game would have to have an
   * answer for, since each one is a round that never resolves.
   */
  readonly unsettledRate: number;

  /** Per-bin probabilities. Sums to 1 up to floating point. */
  readonly p: readonly number[];

  /**
   * The same distribution with mirrored bins averaged, and the one the Derived
   * Table should be solved against.
   *
   * This is a correction, not a cosmetic smoothing. The 16-row counts are
   * measurably lopsided — chi-square 26.5 on 8 df, p = 8.5e-4, worst at bins
   * 7/9 — but the solver is proven to have no side: spawn jitter is the only
   * randomness in a drop, the board is an exact mirror image, and the map from
   * jitter to bin is antisymmetric for every one of a million pairs tested. So
   * the lopsidedness belongs to which jitters mulberry32 hands out for
   * sequential seeds, and averaging removes an artefact of the sample rather
   * than hiding a property of the board. See the "mirror symmetry" suite in
   * src/test/determinism.test.ts, and `npm run symmetry` for the sweep.
   *
   * It also doubles the effective sample on every pair, which is worth most
   * where the samples are thinnest: at 16 rows bins 0 and 16 go from 700 and
   * 754 apart to 1454 together, a 2.6% relative standard error instead of 3.8%.
   *
   * RTP is unaffected. Every payout table here is symmetric, and averaging
   * mirrored probabilities cannot change a sum weighted by a symmetric table.
   */
  readonly symmetric: readonly number[];

  /**
   * Bins some seed actually reached. Measurement cannot prove the negative — a
   * bin with no hits is not proven unreachable, only rarer than
   * `unobservedCeiling` — so an empty bin is a prompt to measure harder before
   * anyone writes a multiplier next to it.
   */
  readonly reachable: readonly boolean[];

  /**
   * The rule of three: zero hits in n trials puts the true probability under
   * 3/n with about 95% confidence. This is the smallest probability the
   * committed sample size can distinguish from impossible.
   */
  readonly unobservedCeiling: number;

  /**
   * Return to player for a multiplier table against this board's measured
   * physics, as a fraction (0.9899 is the 98.99% both modes target).
   *
   * This is the honest number for Physics-First Mode, and it is not the number
   * the same table pays against a binomial — that gap is the whole reason the
   * Derived Table exists. Per ADR 0001, neither figure may be quoted without
   * saying which board and which distribution produced it, and over how many
   * samples.
   */
  rtpOf(table: readonly number[]): number;
}

function viewOf(data: MeasuredData): MeasuredRun {
  const counts = data.MEASURED_COUNTS;
  const settled = data.MEASURED_SAMPLES - data.MEASURED_UNSETTLED;
  const p = counts.map((c) => c / settled);
  const symmetric = counts.map(
    (c, i) => (c + counts[counts.length - 1 - i]) / 2 / settled,
  );

  return {
    rows: data.MEASURED_ROWS,
    tuning: data.MEASURED_TUNING,
    samples: data.MEASURED_SAMPLES,
    unsettled: data.MEASURED_UNSETTLED,
    unsettledSeeds: data.UNSETTLED_SEEDS,
    meanFallSeconds: data.MEASURED_MEAN_FALL_SECONDS,
    counts,
    spotCheckSamples: data.SPOT_CHECK_SAMPLES,
    spotCheckCounts: data.SPOT_CHECK_COUNTS,
    seedsPerBin: data.SEEDS_PER_BIN,
    binSeeds: data.BIN_SEEDS,
    settled,
    unsettledRate: data.MEASURED_UNSETTLED / data.MEASURED_SAMPLES,
    p,
    symmetric,
    reachable: counts.map((c) => c > 0),
    unobservedCeiling: 3 / settled,
    rtpOf: (table) => p.reduce((sum, prob, i) => sum + prob * (table[i] ?? 0), 0),
  };
}

export const MEASURED_RUNS: Record<Rows, MeasuredRun> = {
  8: viewOf(data8),
  12: viewOf(data12),
  16: viewOf(data16),
};

/**
 * The 16-row run: what every ADR before 0008 means by "the Measured
 * Distribution", and still the board the project opens on.
 */
export const MEASURED_RUN = MEASURED_RUNS[16];

/** Each artefact knows which board it came off; this is the sanity check. */
for (const rows of ROW_COUNTS) {
  const run = MEASURED_RUNS[rows];
  if (run.rows !== rows || run.counts.length !== rows + 1) {
    throw new Error(
      `src/sim/measured.${rows}.data.ts holds a ${run.rows}-row run with ` +
      `${run.counts.length} bins — the artefacts are crossed over. Regenerate ` +
      `with \`npm run measure\`.`,
    );
  }
}
