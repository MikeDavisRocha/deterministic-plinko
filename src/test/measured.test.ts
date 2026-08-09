import { describe, expect, it } from "vitest";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARD, DT, REFERENCE_TABLE } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { TUNING_FINGERPRINT } from "../sim/fingerprint";
import {
  MEASURED,
  MEASURED_COUNTS,
  MEASURED_MEAN_FALL_SECONDS,
  MEASURED_SAMPLES,
  MEASURED_TUNING,
  MEASURED_UNSETTLED,
  REACHABLE,
  rtpOf,
  UNSETTLED_RATE,
  UNSETTLED_SEEDS,
} from "../sim/measured";
import { SPOT_CHECK_COUNTS, SPOT_CHECK_SAMPLES } from "../sim/measured.data";

describe("the committed Measured Distribution", () => {
  /**
   * The guard ADR 0001 asks for. Its stated consequence is that a tuning change
   * *silently* invalidates the distribution and the table solved against it;
   * this is the line that makes the failure loud instead.
   */
  it("was measured under the tuning that is in the tree", () => {
    expect(
      MEASURED_TUNING,
      "physics or board geometry changed since src/sim/measured.data.ts was " +
        "generated — rerun `npm run measure` and regenerate the Derived Table",
    ).toBe(TUNING_FINGERPRINT);
  });

  /**
   * Reproduces the first 20 000 seeds of the committed run exactly. The full
   * run is far too slow for a test, so this is what stands between us and an
   * artefact left behind by an older solver: the fingerprint proves the *inputs*
   * match, and this proves the *solver* does.
   */
  it("reproduces its own spot check bin for bin", () => {
    const board = new Board();
    const counts = new Array<number>(board.bins.length).fill(0);
    for (let seed = 0; seed < SPOT_CHECK_SAMPLES; seed++) {
      const w = new World(board, seed);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      if (w.binIndex >= 0) counts[w.binIndex]++;
    }
    expect(counts).toEqual([...SPOT_CHECK_COUNTS]);
  });

  it("counts every drop exactly once", () => {
    const total = MEASURED_COUNTS.reduce((a, b) => a + b, 0);
    expect(total + MEASURED_UNSETTLED).toBe(MEASURED_SAMPLES);
    expect(MEASURED_COUNTS.length).toBe(BOARD.rows + 1);
  });

  /**
   * Not "settles every drop" — at 100 million it does not, and 200 000 was too
   * small to show it. The distribution is unharmed, because those drops are
   * excluded from the counts rather than folded into bin -1, but the rate is
   * pinned so that a tuning change cannot quietly turn a handful into a
   * percentage. Measured 3e-8; the bound is two orders of magnitude above it.
   */
  it("keeps never-settled drops vanishingly rare", () => {
    expect(UNSETTLED_RATE).toBeLessThan(1e-6);
  });

  /**
   * The seeds are committed so the stuck drops stay reproducible. This is the
   * test that will fail — loudly and usefully — on the day someone fixes the
   * grinding case, which is exactly when the artefact needs regenerating.
   */
  it("names every drop that never settled", () => {
    expect(
      UNSETTLED_SEEDS.length,
      "fewer seeds recorded than drops that failed — measure.ts caps the list, " +
        "so this means the tuning went bad rather than that a seed went missing",
    ).toBe(MEASURED_UNSETTLED);
    const board = new Board();
    for (const seed of UNSETTLED_SEEDS) {
      const w = new World(board, seed);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      expect(w.settled, `seed ${seed} settles now — regenerate the artefact`).toBe(false);
    }
  });

  it("normalises to a probability distribution", () => {
    expect(MEASURED.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("keeps the fall time the tuning was chosen for", () => {
    expect(MEASURED_MEAN_FALL_SECONDS).toBeGreaterThan(3);
    expect(MEASURED_MEAN_FALL_SECONDS).toBeLessThan(5);
  });

  /**
   * CONTEXT.md flags reachability as a required measurement before any RTP
   * claim, on the expectation that some bins might not be. At this tuning all
   * 17 are, so the Derived Table gets to solve a multiplier for every bin
   * rather than having to say something awkward about a dead one.
   */
  it("reaches every bin", () => {
    expect(REACHABLE.every(Boolean)).toBe(true);
    expect(Math.min(...MEASURED_COUNTS)).toBeGreaterThan(0);
  });
});

/**
 * Why the Derived Table has to exist, as an assertion rather than an argument.
 *
 * The Reference Table pays 98.99% against a true binomial. The honest physics
 * is not a true binomial — its outer bins are roughly half as likely and its
 * second bins around 1.5x — and the 41x and 110x sitting on those bins turn
 * that small tail error into whole points of RTP.
 */
describe("the Reference Table against the measured physics", () => {
  it("does not pay its binomial 98.99%", () => {
    const rtp = rtpOf(REFERENCE_TABLE as unknown as number[]);
    expect(rtp).toBeGreaterThan(1.0);
    expect(rtp).toBeLessThan(1.02);
  });
});
