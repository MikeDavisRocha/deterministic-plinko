import {
  MEASURED_COUNTS,
  MEASURED_SAMPLES,
  MEASURED_UNSETTLED,
} from "./measured.data";

export {
  BIN_SEEDS,
  MEASURED_COUNTS,
  MEASURED_MEAN_FALL_SECONDS,
  MEASURED_SAMPLES,
  MEASURED_TUNING,
  MEASURED_UNSETTLED,
  SEEDS_PER_BIN,
  UNSETTLED_SEEDS,
} from "./measured.data";

/**
 * The Measured Distribution, as the rest of the code should read it.
 *
 * measured.data.ts is generated and holds raw counts; this module holds the
 * views derived from them. Keeping the two apart means `npm run measure` never
 * rewrites logic — it only ever replaces numbers.
 */

/** Drops that actually reached a bin. The denominator for every probability. */
export const MEASURED_SETTLED = MEASURED_SAMPLES - MEASURED_UNSETTLED;

/**
 * How often a drop grinds down the lattice instead of falling through it and
 * hits the step guard. Not a rounding error in the distribution — those drops
 * are excluded from the counts — but a rate a real game would have to have an
 * answer for, since each one is a round that never resolves.
 */
export const UNSETTLED_RATE = MEASURED_UNSETTLED / MEASURED_SAMPLES;

/** Per-bin probabilities. Sums to 1 up to floating point. */
export const MEASURED: readonly number[] = MEASURED_COUNTS.map(
  (c) => c / MEASURED_SETTLED,
);

/**
 * The same distribution with mirrored bins averaged, and the one the Derived
 * Table should be solved against.
 *
 * This is a correction, not a cosmetic smoothing. The counts are measurably
 * lopsided — chi-square 26.5 on 8 df, p = 8.5e-4, worst at bins 7/9 — but the
 * solver is proven to have no side: spawn jitter is the only randomness in a
 * drop, the board is an exact mirror image, and the map from jitter to bin is
 * antisymmetric for every one of a million pairs tested. So the lopsidedness
 * belongs to which jitters mulberry32 hands out for sequential seeds, and
 * averaging removes an artefact of the sample rather than hiding a property of
 * the board. See the "mirror symmetry" suite in src/test/determinism.test.ts.
 *
 * It also doubles the effective sample on every pair, which is worth most where
 * the samples are thinnest: bins 0 and 16 go from 700 and 754 apart to 1454
 * together, a 2.6% relative standard error instead of 3.8%.
 *
 * RTP is unaffected. Both payout tables are symmetric, and averaging mirrored
 * probabilities cannot change a sum weighted by a symmetric table.
 */
export const MEASURED_SYMMETRIC: readonly number[] = MEASURED_COUNTS.map(
  (c, i) => (c + MEASURED_COUNTS[MEASURED_COUNTS.length - 1 - i]) / 2 / MEASURED_SETTLED,
);

/**
 * Bins some seed actually reached. Measurement cannot prove the negative — a
 * bin with no hits is not proven unreachable, only rarer than
 * [[UNOBSERVED_CEILING]] — so an empty bin is a prompt to measure harder before
 * anyone writes a multiplier next to it.
 */
export const REACHABLE: readonly boolean[] = MEASURED_COUNTS.map((c) => c > 0);

/**
 * The rule of three: zero hits in n trials puts the true probability under 3/n
 * with about 95% confidence. This is the smallest probability the committed
 * sample size can distinguish from impossible.
 */
export const UNOBSERVED_CEILING = 3 / MEASURED_SETTLED;

/**
 * Return to player for a multiplier table against the measured physics, as a
 * fraction (0.9899 is the 98.99% both modes target).
 *
 * This is the honest number for Physics-First Mode, and it is not the number
 * the same table pays against a binomial — that gap is the whole reason the
 * Derived Table exists. Per ADR 0001, neither figure may be quoted without
 * saying which distribution produced it and over how many samples.
 */
export function rtpOf(table: readonly number[]): number {
  let payout = 0;
  for (let i = 0; i < MEASURED.length; i++) payout += MEASURED[i] * (table[i] ?? 0);
  return payout;
}
