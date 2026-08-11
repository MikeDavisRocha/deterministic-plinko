import { describe, expect, it } from "vitest";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARDS, DT, REFERENCE_TABLES, ROW_COUNTS } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { FINGERPRINTS } from "../sim/fingerprint";
import { MEASURED_RUNS } from "../sim/measured";

describe.each(ROW_COUNTS)("the committed Measured Distribution at %i rows", (rows) => {
  const run = MEASURED_RUNS[rows];
  const spec = BOARDS[rows];

  /**
   * The guard ADR 0001 asks for. Its stated consequence is that a tuning change
   * *silently* invalidates the distribution and the table solved against it;
   * this is the line that makes the failure loud instead.
   */
  it("was measured under the tuning that is in the tree", () => {
    expect(
      run.tuning,
      `physics or board geometry changed since src/sim/measured.${rows}.data.ts ` +
        `was generated — rerun \`npm run measure -- ${rows}\` and regenerate ` +
        `the Derived Tables`,
    ).toBe(FINGERPRINTS[rows]);
  });

  /**
   * Reproduces the first 20 000 seeds of the committed run exactly. The full
   * run is far too slow for a test, so this is what stands between us and an
   * artefact left behind by an older solver: the fingerprint proves the *inputs*
   * match, and this proves the *solver* does.
   */
  it("reproduces its own spot check bin for bin", () => {
    const board = new Board(spec);
    const counts = new Array<number>(board.bins.length).fill(0);
    for (let seed = 0; seed < run.spotCheckSamples; seed++) {
      const w = new World(board, seed);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      if (w.binIndex >= 0) counts[w.binIndex]++;
    }
    expect(counts).toEqual([...run.spotCheckCounts]);
  });

  it("counts every drop exactly once", () => {
    const total = run.counts.reduce((a, b) => a + b, 0);
    expect(total + run.unsettled).toBe(run.samples);
    expect(run.counts.length).toBe(rows + 1);
  });

  /**
   * Not "settles every drop" — at 100 million and 16 rows it does not, and
   * 200 000 was too small to show it. The distribution is unharmed, because
   * those drops are excluded from the counts rather than folded into bin -1,
   * but the rate is pinned so that a tuning change cannot quietly turn a
   * handful into a percentage. Measured 3e-8 at 16 rows; the bound is two
   * orders of magnitude above it.
   */
  it("keeps never-settled drops vanishingly rare", () => {
    expect(run.unsettledRate).toBeLessThan(1e-6);
  });

  /**
   * The seeds are committed so the stuck drops stay reproducible. This is the
   * test that will fail — loudly and usefully — on the day someone fixes the
   * grinding case, which is exactly when the artefact needs regenerating.
   */
  it("names every drop that never settled", () => {
    expect(
      run.unsettledSeeds.length,
      "fewer seeds recorded than drops that failed — measure.ts caps the list, " +
        "so this means the tuning went bad rather than that a seed went missing",
    ).toBe(run.unsettled);
    const board = new Board(spec);
    for (const seed of run.unsettledSeeds) {
      const w = new World(board, seed);
      while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
      expect(w.settled, `seed ${seed} settles now — regenerate the artefact`).toBe(false);
    }
  });

  it("normalises to a probability distribution", () => {
    expect(run.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("symmetrises to a distribution that is actually symmetric", () => {
    expect(run.symmetric.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (let i = 0; i < run.symmetric.length; i++) {
      expect(run.symmetric[i]).toBe(run.symmetric[run.symmetric.length - 1 - i]);
    }
  });

  /**
   * The measured lopsidedness the symmetric view exists to remove. Pinned so it
   * stays a known quantity: if a reseeding change makes it vanish, symmetrising
   * has become unnecessary, and if it grows, something else is wrong. At 16
   * rows it is 26.5 on 8 degrees of freedom as committed.
   */
  it("is lopsided only to the degree the sample explains", () => {
    let chi2 = 0;
    const pairs = Math.floor(run.counts.length / 2);
    for (let i = 0; i < pairs; i++) {
      const l = run.counts[i];
      const r = run.counts[run.counts.length - 1 - i];
      chi2 += (l - r) ** 2 / (l + r);
    }
    // Three sigma above the mean of a chi-square on `pairs` degrees of freedom,
    // which is what a sample this size is allowed to wander to by chance.
    expect(chi2).toBeLessThan(pairs + 3 * Math.sqrt(2 * pairs) + 20);
  });

  /**
   * Long enough to watch, short enough to play. Every board falls through the
   * same lattice at the same gravity, so a shorter board is a shorter fall —
   * 4.04 s at 16 rows, 3.14 s at 12, 2.26 s at 8.
   */
  it("keeps the fall time the tuning was chosen for", () => {
    expect(run.meanFallSeconds).toBeGreaterThan(1.5);
    expect(run.meanFallSeconds).toBeLessThan(5);
  });

  /**
   * CONTEXT.md flags reachability as a required measurement before any RTP
   * claim, on the expectation that some bins might not be. At this tuning every
   * bin of every board is, so the Derived Tables get to solve a multiplier for
   * every bin rather than having to say something awkward about a dead one.
   */
  it("reaches every bin", () => {
    expect(run.reachable.every(Boolean)).toBe(true);
    expect(Math.min(...run.counts)).toBeGreaterThan(0);
  });

  /**
   * The rarest bin has to be measured well enough that the multiplier solved
   * for it means something. Below a few hundred hits the relative standard
   * error passes the rounding the multiplier gets anyway, which is the point at
   * which the sample stops being evidence — see the sample-count note in
   * measure.ts.
   */
  it("samples its rarest bin often enough to solve a multiplier for it", () => {
    expect(Math.min(...run.counts)).toBeGreaterThan(300);
  });
});

/** A shorter board is a shorter fall, on every board, with no exceptions. */
describe("the boards side by side", () => {
  it("falls for longer the more rows it has", () => {
    const falls = ROW_COUNTS.map((rows) => MEASURED_RUNS[rows].meanFallSeconds);
    for (let i = 1; i < falls.length; i++) expect(falls[i]).toBeGreaterThan(falls[i - 1]);
  });

  /**
   * The measurements are only comparable if they are the same measurement. A
   * board sampled ten times harder than its neighbour would have a tighter tail
   * for reasons that have nothing to do with the board.
   */
  it("measured every board over the same number of drops", () => {
    const samples = new Set(ROW_COUNTS.map((rows) => MEASURED_RUNS[rows].samples));
    expect(samples.size).toBe(1);
  });
});

/**
 * Why the Derived Table has to exist, as an assertion rather than an argument.
 *
 * The Reference Table pays 98.99% against a true binomial. The honest physics
 * is not a true binomial, and — this is ADR 0008's finding — it is not off in
 * the same direction on every board. At 16 rows the outer bins are roughly half
 * as likely as binomial and the 41x and 110x sitting on them turn that into
 * whole points of overpayment. At 8 rows the walk has not had enough rows to
 * converge and the same bins are half again *more* likely than binomial, so the
 * industry table underpays instead.
 *
 * Either way the number is not 98.99%, which is the only claim the Derived
 * Table needs to justify itself.
 */
describe.each(ROW_COUNTS)("the Reference Table at %i rows", (rows) => {
  it("does not pay its binomial 98.99% against the measured physics", () => {
    const rtp = MEASURED_RUNS[rows].rtpOf(REFERENCE_TABLES[rows].medium);
    expect(Math.abs(rtp - 0.9899)).toBeGreaterThan(0.005);
  });
});
