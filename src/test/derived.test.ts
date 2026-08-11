import { describe, expect, it } from "vitest";
import {
  binomialPmf, REFERENCE_RTPS, REFERENCE_TABLES, RISKS, ROW_COUNTS,
} from "../sim/config";
import {
  DERIVED_EXACT, DERIVED_RTP, DERIVED_RTPS, DERIVED_TABLE, DERIVED_TABLES,
  derivedExactFor, derivedTableFor, roundMultiplier, ROUNDING_TOLERANCE, rtpOn,
} from "../sim/derived";
import { MEASURED_RUNS } from "../sim/measured";

const TARGET = 0.9899;

describe.each(ROW_COUNTS)("the Derived Tables at %i rows", (rows) => {
  const run = MEASURED_RUNS[rows];

  /**
   * The literals are written by hand so the printed numbers are readable in
   * source. This is what stops them drifting from the solve they claim to be —
   * `npm run derived` prints the block, and this refuses a stale paste.
   */
  it("is exactly the printed solve, risk by risk", () => {
    for (const risk of RISKS) {
      expect(DERIVED_TABLES[rows][risk], `${rows} rows, ${risk}`).toEqual(
        derivedTableFor(rows, risk),
      );
    }
  });

  it("is symmetric and covers every bin", () => {
    for (const risk of RISKS) {
      expect(DERIVED_TABLES[rows][risk]).toEqual([...DERIVED_TABLES[rows][risk]].reverse());
      expect(REFERENCE_TABLES[rows][risk]).toEqual([...REFERENCE_TABLES[rows][risk]].reverse());
      expect(DERIVED_TABLES[rows][risk].length).toBe(rows + 1);
      expect(REFERENCE_TABLES[rows][risk].length).toBe(rows + 1);
    }
  });

  /**
   * The point of the contribution-preserving solve: each bin returns what the
   * same bin returns under a binomial paying the Reference Table, so the two
   * modes match bin by bin and not merely in total. Checked before rounding.
   */
  it("preserves every bin's contribution before rounding", () => {
    const binomial = binomialPmf(rows);
    for (const risk of RISKS) {
      const exact = derivedExactFor(REFERENCE_TABLES[rows][risk], rows);
      for (let i = 0; i < exact.length; i++) {
        expect(exact[i] * run.symmetric[i]).toBeCloseTo(
          REFERENCE_TABLES[rows][risk][i] * binomial[i],
          12,
        );
      }
    }
  });

  /**
   * The exact solve pays exactly what the Reference Table pays against a
   * binomial — that is what "contribution-preserving" means summed up, and it
   * is why the two modes can quote the same target from opposite directions.
   */
  it("solves to the Reference Table's own RTP before rounding", () => {
    for (const risk of RISKS) {
      const exact = derivedExactFor(REFERENCE_TABLES[rows][risk], rows);
      expect(rtpOn(exact, rows)).toBeCloseTo(REFERENCE_RTPS[rows][risk], 10);
    }
  });

  /**
   * The promise the rounding grid makes. ADR 0007 found a table paying 94.5%
   * because the grid was chosen once and applied everywhere; ADR 0008 found the
   * 8-row high table paying 101.5% the same way. The ladder in derived.ts is
   * the fix, and this is the line that holds it to its word: a printed table
   * pays what its exact solve pays, to within a tenth of a point, on every
   * board and at every risk.
   */
  it("pays what the exact solve pays, after rounding", () => {
    for (const risk of RISKS) {
      const exact = derivedExactFor(REFERENCE_TABLES[rows][risk], rows);
      const printed = DERIVED_TABLES[rows][risk];
      expect(
        Math.abs(rtpOn(printed, rows) - rtpOn(exact, rows)),
        `${rows} rows, ${risk} — rounding moved the RTP more than the grid ladder allows`,
      ).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
    }
  });

  /**
   * A symmetric table cannot tell the symmetrised distribution from the raw one
   * — averaging mirrored probabilities leaves a symmetrically weighted sum
   * alone. So solving against the symmetric view costs nothing in honesty: the
   * table pays the same against what the run actually measured.
   */
  it("pays the same against the raw measured distribution", () => {
    for (const risk of RISKS) {
      expect(run.rtpOf(DERIVED_TABLES[rows][risk])).toBeCloseTo(
        rtpOn(DERIVED_TABLES[rows][risk], rows),
        12,
      );
    }
  });

  /**
   * The promise risk makes to a player: pick any of the three and you are
   * playing the same game for the same money. If a level drifted off the target
   * it would be quietly the wrong bet to take, which is precisely what a risk
   * selector must never be.
   *
   * A quarter of a point rather than a fifth, and the extra rounding is not
   * ours: the industry tables themselves range from 98.91% to 99.12% against
   * the binomial they were designed for, and the solve inherits whatever it is
   * handed.
   */
  it("pays the same RTP as the others, in both modes", () => {
    for (const risk of RISKS) {
      expect(Math.abs(REFERENCE_RTPS[rows][risk] - TARGET)).toBeLessThan(0.0025);
      expect(Math.abs(DERIVED_RTPS[rows][risk] - TARGET)).toBeLessThan(0.0025);
    }
  });

  /** Same expected value, different variance — that is the whole point. */
  it("orders the three by volatility, not by value", () => {
    const spread = (t: readonly number[]) => Math.max(...t) / Math.min(...t);
    expect(spread(DERIVED_TABLES[rows].low)).toBeLessThan(spread(DERIVED_TABLES[rows].medium));
    expect(spread(DERIVED_TABLES[rows].medium)).toBeLessThan(spread(DERIVED_TABLES[rows].high));
  });

  it("never prints a multiplier no seed can win", () => {
    for (const risk of RISKS) {
      DERIVED_TABLES[rows][risk].forEach((_, i) => expect(run.p[i]).toBeGreaterThan(0));
    }
  });
});

/**
 * The 16-row board, pinned where the ADRs quote it. Everything above is a
 * property; this is the arithmetic those properties were first written about,
 * and it must not move without an ADR saying why.
 */
describe("the 16-row board, as ADR 0001 and ADR 0007 describe it", () => {
  it("is exactly the rounded solve on the coarse grid", () => {
    expect(DERIVED_TABLE).toEqual(DERIVED_EXACT.map(roundMultiplier));
  });

  it("prints every one of its tables on the coarse grid", () => {
    for (const risk of RISKS) {
      expect(DERIVED_TABLES[16][risk]).toEqual(
        derivedExactFor(REFERENCE_TABLES[16][risk], 16).map(roundMultiplier),
      );
    }
  });

  it("solves to the RTP target before rounding", () => {
    const exact = rtpOn(DERIVED_EXACT, 16);
    expect(exact).toBeCloseTo(TARGET, 4);
  });

  /**
   * Pinned at what it really pays, not at what it aims for. Rounding to a
   * legible grid costs 0.0568 of a point and that is quoted rather than hidden.
   */
  it("pays 99.0468% after rounding, and says so", () => {
    expect(DERIVED_RTP).toBeCloseTo(0.990468, 6);
    expect(Math.abs(DERIVED_RTP - TARGET)).toBeLessThan(0.001);
  });

  /**
   * Rounding is where a risk level can silently lose money, and low is where it
   * nearly did: its whole table lives between 0.5x and 1.6x, so the half-step
   * grid that medium is comfortable on rounded 1.1 and 1.2 both to 1.0 and paid
   * 94.52%. Pinned tightly, because 4.5 points hid behind a passing suite until
   * a second table existed to expose it. See ADR 0007.
   */
  it("survives rounding, low included", () => {
    expect(DERIVED_RTPS[16].low).toBeCloseTo(0.989658, 6);
    expect(DERIVED_RTPS[16].medium).toBeCloseTo(0.990468, 6);
    expect(DERIVED_RTPS[16].high).toBeCloseTo(0.990420, 6);
  });

  /**
   * The two tables must not be interchangeable, or ADR 0001's whole argument
   * collapses. The Reference Table overpays here by a point and a half.
   */
  it("differs from the Reference Table where the physics differs", () => {
    expect(MEASURED_RUNS[16].rtpOf(REFERENCE_TABLES[16].medium)).toBeGreaterThan(1.0);
    // The body barely moves — the physics is already binomial there.
    for (let i = 4; i <= 12; i++) expect(DERIVED_TABLE[i]).toBe(REFERENCE_TABLES[16].medium[i]);
    // The tail is where it pays for the difference.
    expect(DERIVED_TABLE[0]).toBeGreaterThan(REFERENCE_TABLES[16].medium[0] * 2);
    expect(DERIVED_TABLE[1]).toBeLessThan(REFERENCE_TABLES[16].medium[1] * 0.8);
  });

  /**
   * ADR 0008's finding, as an assertion. The 16-row board's outermost bins are
   * rarer than a binomial, so its multiplier goes up; the 8-row board's are
   * commoner, because eight rows is not enough for the walk to converge, so its
   * multiplier comes down. A solve that only ever inflated tails would be
   * following a habit rather than a measurement.
   */
  it("corrects the tail in whichever direction the board needs", () => {
    expect(DERIVED_TABLES[16].medium[0]).toBeGreaterThan(REFERENCE_TABLES[16].medium[0]);
    expect(DERIVED_TABLES[8].medium[0]).toBeLessThan(REFERENCE_TABLES[8].medium[0]);
  });
});
