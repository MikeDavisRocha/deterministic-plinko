import { hashFloats } from "../core/hash";
import { BOARD, BOARDS, BoardSpec, DT, PHYS, Phys, Rows, ROW_COUNTS } from "./config";

/**
 * A hash of every number that can move a trajectory.
 *
 * ADR 0001 warns that a tuning change *silently* invalidates the Measured
 * Distribution and the Derived Table solved against it. This is what takes the
 * "silently" out: the artefact commits the fingerprint it was generated under,
 * and a test compares it to the fingerprint of the tuning in the tree. Change
 * gravity and the suite fails asking you to regenerate, instead of shipping a
 * payout table solved against a board that no longer exists.
 *
 * The field order is part of the hash, so it is spelled out rather than taken
 * from Object.values — reordering the BoardSpec interface must not look like a
 * tuning change.
 */
export function fingerprintOf(phys: Phys, board: BoardSpec, dt: number): string {
  return hashFloats([
    dt,
    phys.gravity,
    phys.restitution,
    phys.friction,
    phys.airDrag,
    board.width,
    board.height,
    board.rows,
    board.firstRowPegs,
    board.spacingX,
    board.spacingYRatio,
    board.topY,
    board.pegRadius,
    board.discRadius,
    board.spawnJitter,
    board.binHeight,
  ]);
}

/**
 * One per board, because each board has its own measurement to invalidate.
 * The row count is inside the hash, so these could not collide even if two
 * boards agreed on everything else.
 */
export const FINGERPRINTS: Record<Rows, string> = Object.fromEntries(
  ROW_COUNTS.map((rows) => [rows, fingerprintOf(PHYS, BOARDS[rows], DT)]),
) as Record<Rows, string>;

/** The 16-row board's, which is what the ADRs before 0008 mean by "the tuning". */
export const TUNING_FINGERPRINT = fingerprintOf(PHYS, BOARD, DT);
