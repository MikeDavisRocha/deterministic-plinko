import { describe, expect, it } from "vitest";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { MAX_STEPS, monteCarlo } from "../sim/simulate";
import { binomialPmf, BOARDS, DT, REFERENCE_TABLES, Rows, ROW_COUNTS } from "../sim/config";

const RUNS = 20_000;

/**
 * How far each board's walk really sits from the binomial, in total variation
 * distance, and the bound this suite holds it to.
 *
 * These are not one threshold applied three times, because the boards are not
 * three samples of one thing. ADR 0003 argues that lateral drag is what makes
 * the walk binomial; ADR 0008 is the same argument read backwards, since a walk
 * needs *rows* to converge as well as drag. Measured here: 0.0093 at 16 rows,
 * 0.0117 at 12, and 0.0706 at 8 — the shortest board is nearly eight times
 * further from the binomial than the longest, and no amount of tuning would
 * move it, because what it lacks is length.
 *
 * That is not a defect to be fixed. It is the exact reason Physics-First pays
 * from a table solved against the measurement rather than against the binomial,
 * and the 8-row board is the loudest evidence the project has for ADR 0001.
 */
const BINOMIAL_DISTANCE: Record<Rows, number> = { 8: 0.09, 12: 0.03, 16: 0.02 };

/**
 * The body: bins within a quarter of the board of the centre. Outside it the
 * counts are thin enough at 20 000 drops that the noise says more than the
 * physics does.
 */
const body = (rows: number) => {
  const lo = Math.ceil(rows / 2 - rows / 4);
  return { lo, hi: rows - lo };
};

/**
 * How far the body may sit from the binomial, per board. 15% is sampling noise
 * at 20 000 drops; the 8-row board needs 35% because its body genuinely is not
 * binomial — bins 2 and 6 come up about 1.3x their binomial rate — which is the
 * finding above rather than a slack threshold.
 */
const BODY_TOLERANCE: Record<Rows, number> = { 8: 0.35, 12: 0.15, 16: 0.15 };

/**
 * One sweep per board, run once at collection and read by every test below.
 * The convergence test needs all three side by side and the per-board tests
 * need one each; running them twice would double the slowest file in the suite.
 */
const SWEEPS = new Map(ROW_COUNTS.map((rows) => {
  const board = new Board(BOARDS[rows]);
  const { counts, unsettled } = monteCarlo(board, RUNS);
  const settled = RUNS - unsettled;
  const expected = binomialPmf(rows);
  let dTV = 0;
  for (let i = 0; i < counts.length; i++) dTV += Math.abs(counts[i] / settled - expected[i]);
  return [rows, { board, counts, unsettled, settled, expected, dTV: dTV / 2 }] as const;
}));

describe.each(ROW_COUNTS)(`the measured distribution over ${RUNS} drops at %i rows`, (rows) => {
  const { board, counts, unsettled, settled, expected, dTV } = SWEEPS.get(rows)!;

  it("settles every drop", () => {
    expect(unsettled).toBe(0);
  });

  // The guard ADR 0003 asks for. The 16-row bound leaves room for sampling
  // noise and nothing else: moving airDrag alone from 2.0 to 1.5 takes it
  // to 0.052.
  it("stays as close to the binomial as its board gets", () => {
    expect(dTV).toBeLessThan(BINOMIAL_DISTANCE[rows]);
  });

  it("keeps the body of the distribution within tolerance of the binomial", () => {
    // The seeds are fixed, so this is not flaky. The bins just outside the body
    // are thin here — at 16 rows bins 3 and 13 expect 171 drops each and land
    // at 1.17x and 1.05x, under 2.5 sigma of counting noise, and at 200 000
    // drops both are 1.00x.
    const { lo, hi } = body(rows);
    const tol = BODY_TOLERANCE[rows];
    for (let i = lo; i <= hi; i++) {
      const ratio = counts[i] / settled / expected[i];
      expect(ratio, `bin ${i} of ${rows} rows`).toBeGreaterThan(1 - tol);
      expect(ratio, `bin ${i} of ${rows} rows`).toBeLessThan(1 + tol);
    }
  });

  // Not an RTP claim for Physics-First Mode — that mode pays from the Derived
  // Table (ADR 0001). It is a second read on how binomial the walk is, from
  // the angle that actually costs money if it drifts.
  it("pays near the Reference Table's 98.99% against the honest physics", () => {
    let payout = 0;
    const table = REFERENCE_TABLES[rows].medium;
    for (let i = 0; i < counts.length; i++) payout += counts[i] * table[i];
    expect(payout / settled).toBeGreaterThan(0.85);
    expect(payout / settled).toBeLessThan(1.15);
  });

  it("lands in a watchable fall time", () => {
    let steps = 0;
    let max = 0;
    const SAMPLE = 2000;
    for (let s = 0; s < SAMPLE; s++) {
      const w = new World(board, s);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      steps += w.steps;
      if (w.steps > max) max = w.steps;
    }
    expect((steps / SAMPLE) * DT).toBeGreaterThan(1.5);
    expect((steps / SAMPLE) * DT).toBeLessThan(5);
    expect(max * DT).toBeLessThan(8);
  });
});

/**
 * ADR 0008's finding, stated as the property rather than as three thresholds: a
 * longer walk is a more binomial walk. This is what makes the row count a real
 * choice rather than a zoom level — the 8-row board is a measurably different
 * distribution, not a smaller picture of the same one.
 */
describe("how binomial the walk is", () => {
  it("converges towards the binomial as the board gets taller", () => {
    const distances = ROW_COUNTS.map((rows) => SWEEPS.get(rows)!.dTV);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i], `${ROW_COUNTS[i]} rows vs ${ROW_COUNTS[i - 1]}`).toBeLessThan(
        distances[i - 1],
      );
    }
  });
});
