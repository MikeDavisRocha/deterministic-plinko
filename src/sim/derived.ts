import { binomialPmf, REFERENCE_TABLES, Risk, RISKS, Rows, ROW_COUNTS } from "./config";
import { MEASURED_RUNS } from "./measured";

/**
 * The Derived Tables: what Physics-First Mode pays, one table per board and
 * risk level.
 *
 * ADR 0001 fixes RTP at the payout table rather than at the physics, because a
 * solver cannot be tuned to an RTP target. Outcome-First Mode draws from a
 * binomial and uses the Reference Table unchanged; this mode keeps its honest
 * measured distribution and pays from a table solved against *that*.
 *
 * Unlike the Measured Distributions, these are not separate committed
 * artefacts. They derive deterministically and cheaply from one, so computing
 * them here means they cannot go stale against the run they are solved from —
 * which is the failure mode ADR 0001 spends its consequences worrying about.
 * The rounded tables below are still written out by hand, because the rounded
 * numbers are the product and belong somewhere a person can read them.
 * `npm run derived` prints the block to paste, and derived.test.ts refuses to
 * let a stale paste survive.
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
 * place — at 16 rows bin 1 comes up 1.36x more often than binomial and would
 * still pay about 41x — so the total would match while the volatility would
 * not.
 *
 * Solved against the symmetrised distribution rather than the raw counts; see
 * ADR 0004.
 */
export function derivedExactFor(reference: readonly number[], rows: Rows): number[] {
  const binomial = binomialPmf(rows);
  const measured = MEASURED_RUNS[rows].symmetric;
  return reference.map((m, i) => (m * binomial[i]) / measured[i]);
}

/** A rounding grid: the step to use in each band of the table. */
export interface Grid {
  /** step at or above 100x */
  readonly at100: number;
  /** step in 10x..100x */
  readonly at10: number;
  /** step in 2x..10x */
  readonly at2: number;
  /** step below 2x */
  readonly below: number;
}

/**
 * Coarse first. A table prints on the first grid it can afford.
 *
 * An exact solve prints 230.876x, which no operator would put on a board, so
 * the printed table is rounded — and rounding a payout table costs RTP. ADR
 * 0007 found that cost hiding at 4.5 points when the grid was tuned to a single
 * table; ADR 0008 found the same trap one board over. Both are the same fact:
 * **what a grid costs depends on how much of the distribution sits on the bins
 * it moves.**
 *
 * A 17-bin board can afford the coarse grid. A 9-bin board cannot: its middle
 * bin alone takes 28% of every drop, so rounding one entry by a twentieth is
 * worth more RTP there than rounding four entries by a half is at 16 rows. On
 * the coarse grid the 8-row low table pays 101.9% and the 12-row medium table
 * pays 97.9% — not roundings, a giveaway and a levy.
 *
 * So the grid is chosen per table instead of being decreed for all of them:
 * round on the coarsest one whose table still pays what the exact solve pays,
 * and print one more digit only where the numbers demand it. The 16-row tables
 * are unchanged by this and still print on the grid ADR 0001 accounted for.
 *
 * The rungs have to be searched rather than calculated, because rounding error
 * is not monotone in grid size: the 8-row low table costs 2.93 points on the
 * coarse grid, 0.35 one rung finer, 0.39 finer again, and finally 0.06 on the
 * fourth. A finer grid is a smaller error per entry and says nothing about
 * which way each entry moves, so the only honest way to find the coarsest
 * affordable grid is to try them in order.
 */
export const GRIDS: readonly Grid[] = [
  { at100: 5, at10: 1, at2: 0.5, below: 0.1 },
  { at100: 5, at10: 1, at2: 0.5, below: 0.05 },
  { at100: 1, at10: 0.5, at2: 0.1, below: 0.01 },
  { at100: 0.5, at10: 0.1, at2: 0.05, below: 0.01 },
  { at100: 0.1, at10: 0.05, at2: 0.01, below: 0.005 },
];

/** How far off the exact solve a rounded table may pay: a tenth of a point. */
export const ROUNDING_TOLERANCE = 0.001;

export function roundOn(grid: Grid, v: number): number {
  const step = v >= 100 ? grid.at100 : v >= 10 ? grid.at10 : v >= 2 ? grid.at2 : grid.below;
  // The second rounding clears the binary dust that v/0.1 leaves behind. Three
  // decimals, not two: the finest grid steps by 0.005 and rounding 0.195 to a
  // hundredth would quietly undo the rung that was just chosen.
  return Math.round(Math.round(v / step) * step * 1000) / 1000;
}

/**
 * The coarse grid on its own, which is what ADR 0001 and ADR 0007 describe and
 * what every 16-row table still prints on.
 */
export const roundMultiplier = (v: number) => roundOn(GRIDS[0], v);

/** RTP of a table against a board's symmetrised measured distribution. */
export function rtpOn(table: readonly number[], rows: Rows): number {
  return MEASURED_RUNS[rows].symmetric.reduce(
    (sum, p, i) => sum + p * (table[i] ?? 0),
    0,
  );
}

/**
 * The printed table: the exact solve, rounded on the coarsest grid that still
 * pays what the exact solve pays. Deterministic — a reader can rerun this and
 * get the same choice of grid, which is what keeps "we printed one more digit
 * here" from being a judgement call.
 */
export function roundedTable(exact: readonly number[], rows: Rows): number[] {
  const target = rtpOn(exact, rows);
  for (const grid of GRIDS) {
    const table = exact.map((v) => roundOn(grid, v));
    if (Math.abs(rtpOn(table, rows) - target) <= ROUNDING_TOLERANCE) return table;
  }
  return exact.map((v) => roundOn(GRIDS[GRIDS.length - 1], v));
}

export const derivedTableFor = (rows: Rows, risk: Risk): number[] =>
  roundedTable(derivedExactFor(REFERENCE_TABLES[rows][risk], rows), rows);

/**
 * The tables as printed, one per board and risk. Every entry is
 * `derivedTableFor(rows, risk)[i]`, asserted in derived.test.ts so these
 * literals cannot drift from the solve.
 *
 * The tail is where the physics diverges and so the tail is where they differ
 * from the industry tables. At 16 rows the outermost bins are half as likely as
 * a binomial and the multiplier doubles to pay for it: 110x becomes 230x at
 * medium, 1000x becomes 2100x at high. At 8 rows the tail runs the other way —
 * it is *fatter* than binomial, because eight rows is not enough for the walk
 * to converge — so the multipliers come down instead. Same solve, opposite
 * correction, which is the clearest evidence that it is following the
 * measurement rather than a preconception about tails.
 */
export const DERIVED_TABLES: Record<Rows, Record<Risk, readonly number[]>> = {
  8: {
    low: [3.65, 2.45, 0.86, 1.16, 0.49, 1.16, 0.86, 2.45, 3.65],
    medium: [8.46, 3.47, 1.015, 0.815, 0.395, 0.815, 1.015, 3.47, 8.46],
    high: [18.85, 4.63, 1.17, 0.35, 0.195, 0.35, 1.17, 4.63, 18.85],
  },
  12: {
    low: [52, 1.95, 1.7, 1.35, 1.1, 1, 0.5, 1, 1.1, 1.35, 1.7, 1.95, 52],
    medium: [171.9, 7.21, 4.24, 1.895, 1.105, 0.595, 0.31, 0.595, 1.105, 1.895, 4.24, 7.21, 171.9],
    high: [885, 15.5, 8.6, 1.9, 0.7, 0.2, 0.21, 0.2, 0.7, 1.9, 8.6, 15.5, 885],
  },
  16: {
    low: [34, 6.5, 1.6, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 1.6, 6.5, 34],
    medium: [230, 30, 8, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 8, 30, 230],
    high: [2100, 95, 21, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 21, 95, 2100],
  },
};

/** Medium at 16 rows: the table ADR 0001 solved and every ADR since quotes. */
export const DERIVED_TABLE: readonly number[] = DERIVED_TABLES[16].medium;

export const DERIVED_EXACT: readonly number[] = derivedExactFor(REFERENCE_TABLES[16].medium, 16);

/**
 * What the printed tables actually return against the measured physics. At 16
 * rows, medium: **99.0468%**, not the 98.99% it was solved for.
 *
 * The exact solve pays 98.9883%; rounding to a legible grid costs 0.0568 of a
 * point, and the honest thing is to quote the number the player really gets
 * rather than the target it was aimed at. Most of that drift is one entry —
 * bin 6 rounding 0.994 up to 1 across two bins that take 12.3% of all drops
 * each — so a tighter figure is available at the cost of printing 0.99x.
 *
 * Recomputed rather than committed as literals, so they can never disagree with
 * the tables above.
 */
export const DERIVED_RTPS: Record<Rows, Record<Risk, number>> = Object.fromEntries(
  ROW_COUNTS.map((rows) => [
    rows,
    Object.fromEntries(
      RISKS.map((risk) => [risk, MEASURED_RUNS[rows].rtpOf(DERIVED_TABLES[rows][risk])]),
    ) as Record<Risk, number>,
  ]),
) as Record<Rows, Record<Risk, number>>;

export const DERIVED_RTP: number = DERIVED_RTPS[16].medium;
