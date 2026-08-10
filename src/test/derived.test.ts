import { describe, expect, it } from "vitest";
import { binomialPmf, BOARD, REFERENCE_TABLE } from "../sim/config";
import { DERIVED_EXACT, DERIVED_RTP, DERIVED_TABLE, roundMultiplier } from "../sim/derived";
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
