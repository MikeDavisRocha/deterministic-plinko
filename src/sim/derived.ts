import { binomialPmf, BOARD, REFERENCE_TABLE } from "./config";
import { MEASURED_SYMMETRIC } from "./measured";

/**
 * The Derived Table: what Physics-First Mode pays.
 *
 * ADR 0001 fixes RTP at the payout table rather than at the physics, because a
 * solver cannot be tuned to an RTP target. Outcome-First Mode draws from a
 * binomial and uses the Reference Table unchanged; this mode keeps its honest
 * measured distribution and pays from a table solved against *that*.
 *
 * Unlike the Measured Distribution, this is not a separate committed artefact.
 * It derives deterministically and cheaply from one, so computing it here means
 * it cannot go stale against the run it is solved from — which is the failure
 * mode ADR 0001 spends its consequences worrying about. The rounded table below
 * is still written out by hand, because the rounded numbers are the product and
 * belong somewhere a person can read them.
 */

/**
 * Contribution-preserving solve: each bin contributes exactly what it
 * contributes under a binomial, so the two modes match bin by bin rather than
 * only in total.
 *
 *     m[i] = reference[i] x binomial[i] / measured[i]
 *
 * The alternative considered was scaling the whole Reference Table by a single
 * factor. That also lands 98.99%, but it leaves the per-bin distortion in
 * place — bin 1 comes up 1.36x more often than binomial and would still pay
 * about 41x — so the total would match while the volatility would not.
 *
 * Solved against MEASURED_SYMMETRIC rather than the raw counts; see ADR 0004.
 */
export const DERIVED_EXACT: readonly number[] = (() => {
  const binomial = binomialPmf(BOARD.rows);
  return REFERENCE_TABLE.map((m, i) => (m * binomial[i]) / MEASURED_SYMMETRIC[i]);
})();

/**
 * Rounding grid, coarser as the multiplier grows — the shape real payout tables
 * have. An exact solve prints 230.876x, which no operator would put on a board.
 */
export function roundMultiplier(v: number): number {
  const grid = v >= 100 ? 5 : v >= 10 ? 1 : v >= 1 ? 0.5 : 0.1;
  // The second rounding clears the binary dust that v/0.1 leaves behind.
  return Math.round((Math.round(v / grid) * grid) * 10) / 10;
}

/**
 * The table as printed. Every entry is `roundMultiplier(DERIVED_EXACT[i])`,
 * asserted in derived.test.ts so this literal cannot drift from the solve.
 */
export const DERIVED_TABLE: readonly number[] = [
  230, 30, 8, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 8, 30, 230,
];

/**
 * What the printed table actually returns against the measured physics:
 * **99.0468%**, not the 98.99% it was solved for.
 *
 * The exact solve pays 98.9883%; rounding to a legible grid costs 0.0568 of a
 * point, and the honest thing is to quote the number the player really gets
 * rather than the target it was aimed at. Most of the drift is one entry —
 * bin 6 rounding 0.994 up to 1 across two bins that take 12.3% of all drops
 * each — so a tighter figure is available at the cost of printing 0.99x.
 *
 * Recomputed rather than committed as a literal, so it can never disagree with
 * the table above.
 */
export const DERIVED_RTP: number = DERIVED_TABLE.reduce(
  (sum, m, i) => sum + m * MEASURED_SYMMETRIC[i],
  0,
);
