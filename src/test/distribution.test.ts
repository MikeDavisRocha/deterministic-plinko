import { describe, expect, it } from "vitest";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { MAX_STEPS, monteCarlo } from "../sim/simulate";
import { binomialPmf, BOARD, DT, REFERENCE_TABLE } from "../sim/config";

const RUNS = 20_000;

const board = new Board();
const { counts, unsettled } = monteCarlo(board, RUNS);
const settled = RUNS - unsettled;
const expected = binomialPmf(BOARD.rows);

describe(`the measured distribution over ${RUNS} drops`, () => {
  it("settles every drop", () => {
    expect(unsettled).toBe(0);
  });

  // The guard ADR 0003 asks for. Measured 0.0093 here and 0.0040 at 200 000
  // drops; the threshold leaves room for sampling noise and nothing else.
  // Moving airDrag alone from 2.0 to 1.5 takes this to 0.052.
  it("stays close to the binomial", () => {
    let dTV = 0;
    for (let i = 0; i < counts.length; i++) {
      dTV += Math.abs(counts[i] / settled - expected[i]);
    }
    expect(dTV / 2).toBeLessThan(0.02);
  });

  it("keeps the body of the distribution within 15% of the binomial", () => {
    // Bins 4..12 only. The seeds are fixed, so this is not flaky — but bins 3
    // and 13 have an expected count of 171 here, where the shipped tuning
    // happens to sit at 1.17x and 1.05x. That is under 2.5 sigma of counting
    // noise and says nothing about the walk; at 200 000 drops both are 1.00x.
    // Bins 4..12 expect 555+ each and land inside [0.92, 1.04].
    for (let i = 4; i <= 12; i++) {
      expect(counts[i] / settled / expected[i]).toBeGreaterThan(0.85);
      expect(counts[i] / settled / expected[i]).toBeLessThan(1.15);
    }
  });

  // Not an RTP claim for Physics-First Mode — that mode pays from the Derived
  // Table (ADR 0001). It is a second read on how binomial the walk is, from
  // the angle that actually costs money if it drifts.
  it("pays near the Reference Table's 98.99% against the honest physics", () => {
    let payout = 0;
    for (let i = 0; i < counts.length; i++) payout += counts[i] * REFERENCE_TABLE[i];
    expect(payout / settled).toBeGreaterThan(0.85);
    expect(payout / settled).toBeLessThan(1.15);
  });
});

describe("fall time", () => {
  it("lands in a watchable range", () => {
    let steps = 0;
    let max = 0;
    const SAMPLE = 2000;
    for (let s = 0; s < SAMPLE; s++) {
      const w = new World(board, s);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      steps += w.steps;
      if (w.steps > max) max = w.steps;
    }
    expect((steps / SAMPLE) * DT).toBeGreaterThan(3);
    expect((steps / SAMPLE) * DT).toBeLessThan(5);
    expect(max * DT).toBeLessThan(8);
  });
});
