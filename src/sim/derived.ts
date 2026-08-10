import { binomialPmf, BOARD, REFERENCE_TABLE, Risk } from "./config";
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
export function derivedExactFor(reference: readonly number[]): number[] {
  const binomial = binomialPmf(BOARD.rows);
  return reference.map((m, i) => (m * binomial[i]) / MEASURED_SYMMETRIC[i]);
}

export const DERIVED_EXACT: readonly number[] = derivedExactFor(REFERENCE_TABLE);

/**
 * Rounding grid, coarser as the multiplier grows — the shape real payout tables
 * have. An exact solve prints 230.876x, which no operator would put on a board.
 *
 * The band from 1x to 2x is on a tenth, not a half. That looks like a detail
 * and is worth 4.5 points of RTP: the low-risk table lives entirely between
 * 0.5x and 1.4x, so a half-step grid rounds 1.1 and 1.2 both to 1.0 and pays
 * 94.52% instead of 98.99%. The industry prints 1.1x and 1.4x for exactly this
 * reason. Medium is unaffected — its body already sits on the coarser grid —
 * which is precisely why the flaw stayed invisible while medium was the only
 * table. See ADR 0007.
 */
export function roundMultiplier(v: number): number {
  const grid = v >= 100 ? 5 : v >= 10 ? 1 : v >= 2 ? 0.5 : 0.1;
  // The second rounding clears the binary dust that v/0.1 leaves behind.
  return Math.round((Math.round(v / grid) * grid) * 10) / 10;
}

/**
 * The tables as printed, one per risk. Every entry is
 * `roundMultiplier(derivedExactFor(REFERENCE_TABLES[risk])[i])`, asserted in
 * derived.test.ts so these literals cannot drift from the solve.
 *
 * The tail is where the physics diverges and so the tail is where they differ
 * from the industry tables: 110x becomes 230x at medium, 1000x becomes 2100x at
 * high. Low barely moves, because low keeps almost nothing in the tail to begin
 * with — which is the same fact from the other side.
 */
export const DERIVED_TABLES: Record<Risk, readonly number[]> = {
  low: [34, 6.5, 1.6, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 1.6, 6.5, 34],
  medium: [230, 30, 8, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 8, 30, 230],
  high: [2100, 95, 21, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 21, 95, 2100],
};

export const DERIVED_TABLE: readonly number[] = DERIVED_TABLES.medium;

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
export const DERIVED_RTPS: Record<Risk, number> = {
  low: rtpOf(DERIVED_TABLES.low),
  medium: rtpOf(DERIVED_TABLES.medium),
  high: rtpOf(DERIVED_TABLES.high),
};

export const DERIVED_RTP: number = DERIVED_RTPS.medium;

function rtpOf(table: readonly number[]): number {
  return table.reduce((sum, m, i) => sum + m * MEASURED_SYMMETRIC[i], 0);
}
