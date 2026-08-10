import { describe, expect, it } from "vitest";
import {
  binomialPmf, BOARD, REFERENCE_RTPS, REFERENCE_TABLE, REFERENCE_TABLES, RISKS,
} from "../sim/config";
import {
  DERIVED_EXACT, DERIVED_RTP, DERIVED_RTPS, DERIVED_TABLE, DERIVED_TABLES,
  derivedExactFor, roundMultiplier,
} from "../sim/derived";
import { MEASURED, MEASURED_SYMMETRIC, rtpOf } from "../sim/measured";

const TARGET = 0.9899;

describe("the Derived Table", () => {
  /**
   * The literal is written by hand so the printed numbers are readable in
   * source. This is what stops it drifting from the solve it claims to be.
   */
  it("is exactly the rounded solve", () => {
    expect(DERIVED_TABLE).toEqual(DERIVED_EXACT.map(roundMultiplier));
  });

  it("is symmetric", () => {
    expect(DERIVED_TABLE).toEqual([...DERIVED_TABLE].reverse());
  });

  it("has one multiplier per bin", () => {
    expect(DERIVED_TABLE.length).toBe(BOARD.rows + 1);
  });

  /**
   * The point of the contribution-preserving solve: each bin returns what the
   * same bin returns under a binomial paying the Reference Table, so the two
   * modes match bin by bin and not merely in total. Checked before rounding.
   */
  it("preserves every bin's contribution before rounding", () => {
    const binomial = binomialPmf(BOARD.rows);
    for (let i = 0; i < DERIVED_EXACT.length; i++) {
      expect(DERIVED_EXACT[i] * MEASURED_SYMMETRIC[i]).toBeCloseTo(
        REFERENCE_TABLE[i] * binomial[i],
        12,
      );
    }
  });

  it("solves to the RTP target before rounding", () => {
    const exact = DERIVED_EXACT.reduce((s, m, i) => s + m * MEASURED_SYMMETRIC[i], 0);
    expect(exact).toBeCloseTo(TARGET, 4);
  });

  /**
   * Pinned at what it really pays, not at what it aims for. Rounding to a
   * legible grid costs 0.0568 of a point and that is quoted rather than hidden;
   * the bound is tight enough that a regenerated distribution moving the table
   * would have to say so.
   */
  it("pays 99.0468% after rounding, and says so", () => {
    expect(DERIVED_RTP).toBeCloseTo(0.990468, 6);
    expect(Math.abs(DERIVED_RTP - TARGET)).toBeLessThan(0.001);
  });

  /**
   * A symmetric table cannot tell the symmetrised distribution from the raw one
   * — averaging mirrored probabilities leaves a symmetrically weighted sum
   * alone. So solving against MEASURED_SYMMETRIC costs nothing in honesty: the
   * table pays the same against what the run actually measured.
   */
  it("pays the same against the raw measured distribution", () => {
    expect(rtpOf(DERIVED_TABLE)).toBeCloseTo(DERIVED_RTP, 12);
  });

  /**
   * The two tables must not be interchangeable, or ADR 0001's whole argument
   * collapses. The Reference Table overpays here by a point and a half.
   */
  it("differs from the Reference Table where the physics differs", () => {
    expect(rtpOf(REFERENCE_TABLE as unknown as number[])).toBeGreaterThan(1.0);
    // The body barely moves — the physics is already binomial there.
    for (let i = 4; i <= 12; i++) expect(DERIVED_TABLE[i]).toBe(REFERENCE_TABLE[i]);
    // The tail is where it pays for the difference.
    expect(DERIVED_TABLE[0]).toBeGreaterThan(REFERENCE_TABLE[0] * 2);
    expect(DERIVED_TABLE[1]).toBeLessThan(REFERENCE_TABLE[1] * 0.8);
  });

  it("never prints a multiplier no seed can win", () => {
    for (let i = 0; i < DERIVED_TABLE.length; i++) {
      expect(MEASURED[i]).toBeGreaterThan(0);
    }
  });
});

describe("every risk level", () => {
  it("is exactly the rounded solve", () => {
    for (const risk of RISKS) {
      expect(DERIVED_TABLES[risk]).toEqual(
        derivedExactFor(REFERENCE_TABLES[risk]).map(roundMultiplier),
      );
    }
  });

  it("is symmetric and covers every bin", () => {
    for (const risk of RISKS) {
      expect(DERIVED_TABLES[risk]).toEqual([...DERIVED_TABLES[risk]].reverse());
      expect(REFERENCE_TABLES[risk]).toEqual([...REFERENCE_TABLES[risk]].reverse());
      expect(DERIVED_TABLES[risk].length).toBe(BOARD.rows + 1);
      expect(REFERENCE_TABLES[risk].length).toBe(BOARD.rows + 1);
    }
  });

  /**
   * The promise risk makes to a player: pick any of the three and you are
   * playing the same game for the same money. If a level drifted off the
   * target it would be quietly the wrong bet to take, which is precisely what
   * a risk selector must never be.
   */
  it("pays the same RTP as the others, in both modes", () => {
    for (const risk of RISKS) {
      expect(Math.abs(REFERENCE_RTPS[risk] - TARGET)).toBeLessThan(0.002);
      expect(Math.abs(DERIVED_RTPS[risk] - TARGET)).toBeLessThan(0.002);
    }
  });

  /**
   * Rounding is where a risk level can silently lose money, and low is where it
   * nearly did: its whole table lives between 0.5x and 1.6x, so the half-step
   * grid that medium is comfortable on rounded 1.1 and 1.2 both to 1.0 and paid
   * 94.52%. Pinned tightly, because 4.5 points hid behind a passing suite until
   * a second table existed to expose it. See ADR 0007.
   */
  it("survives rounding, low included", () => {
    expect(DERIVED_RTPS.low).toBeCloseTo(0.989658, 6);
    expect(DERIVED_RTPS.medium).toBeCloseTo(0.990468, 6);
    expect(DERIVED_RTPS.high).toBeCloseTo(0.990420, 6);
  });

  /** Same expected value, different variance — that is the whole point. */
  it("orders the three by volatility, not by value", () => {
    const spread = (t: readonly number[]) => Math.max(...t) / Math.min(...t);
    expect(spread(DERIVED_TABLES.low)).toBeLessThan(spread(DERIVED_TABLES.medium));
    expect(spread(DERIVED_TABLES.medium)).toBeLessThan(spread(DERIVED_TABLES.high));
    // Low never takes more than half a stake back on its worst bin; high does.
    expect(Math.min(...DERIVED_TABLES.low)).toBe(0.5);
    expect(Math.min(...DERIVED_TABLES.high)).toBe(0.2);
  });
});
