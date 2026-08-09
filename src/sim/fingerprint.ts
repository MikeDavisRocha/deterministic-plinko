import { hashFloats } from "../core/hash";
import { BOARD, BoardSpec, DT, PHYS, Phys } from "./config";

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

export const TUNING_FINGERPRINT = fingerprintOf(PHYS, BOARD, DT);
