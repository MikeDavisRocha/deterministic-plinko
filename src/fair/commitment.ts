import { bytesOf, hexOf, hmacSha256, sha256 } from "../core/sha256";
import { BOARD } from "../sim/config";

/**
 * The provably fair commitment: where Outcome-First Mode's bin comes from.
 *
 * Physics-First Mode lets the solver decide and pays from a table solved
 * against what the solver does. This mode inverts that — the Target Bin is
 * fixed before the disc moves, by a value neither side can steer alone, and the
 * simulation's job is to land there. Nothing in this file touches the solver;
 * the bin is decided from three strings and a hash.
 *
 * The scheme is deliberately the industry one rather than a better one of our
 * own. A player verifies a provably fair game with a third-party verifier they
 * already trust, and a scheme that only our page can check is a scheme that
 * cannot be checked. So: HMAC-SHA256 keyed with the Server Seed over
 * `clientSeed:nonce:round`, bytes taken four at a time into floats, one float
 * per row deciding left or right. That is what the public verifiers implement,
 * and the cost of matching them is spelled out in
 * docs/adr/0005-the-bin-is-drawn-from-the-commitment-not-the-physics.md.
 */

/** The three values a player needs to reproduce one drop's Target Bin. */
export interface FairSeeds {
  /** The operator's secret for the session. Published as a hash before play. */
  readonly serverSeed: string;
  /** The player's value. Its purpose is that the operator cannot act alone. */
  readonly clientSeed: string;
  /** Per-drop counter. Makes each drop distinct without changing either seed. */
  readonly nonce: number;
}

/**
 * What the operator publishes before a session: SHA-256 of the Server Seed.
 *
 * This is the whole promise. The seed is fixed at this moment and the hash
 * proves it, so when it is revealed the player can check that the value used to
 * decide their drops is the value that was committed to before they played.
 */
export const commitOf = (serverSeed: string): string =>
  hexOf(sha256(bytesOf(serverSeed)));

/** Does a revealed Server Seed match the hash published before play? */
export const verifyCommit = (serverSeed: string, commit: string): boolean =>
  commitOf(serverSeed) === commit.trim().toLowerCase();

/** Floats per HMAC round: 32 bytes of digest, four bytes to a float. */
const FLOATS_PER_ROUND = 8;

/**
 * The commitment as a stream of floats in [0, 1).
 *
 * Four bytes make one float, most significant first, each byte weighted by a
 * further 1/256 — the standard construction. A round is 32 bytes and therefore
 * only eight floats, so the round counter goes into the message and a 16-row
 * board consumes rounds 0 and 1.
 */
export function floatsOf(seeds: FairSeeds, count: number): number[] {
  const key = bytesOf(seeds.serverSeed);
  const out: number[] = [];
  for (let round = 0; out.length < count; round++) {
    const digest = hmacSha256(
      key,
      bytesOf(`${seeds.clientSeed}:${seeds.nonce}:${round}`),
    );
    for (let i = 0; i < FLOATS_PER_ROUND && out.length < count; i++) {
      let v = 0;
      for (let b = 0; b < 4; b++) v += digest[i * 4 + b] / 256 ** (b + 1);
      out.push(v);
    }
  }
  return out;
}

/**
 * One left/right step per row — `true` is right — which is the same walk the
 * Row entry in the glossary describes the disc performing.
 *
 * Each float is compared against a half, so the walk is fair by construction
 * and the bin count is Binomial(rows, 1/2) exactly. That is the distribution
 * the Reference Table was designed against, which is why this mode can use it
 * unchanged where Physics-First Mode needs the Derived Table.
 */
export const stepsOf = (
  seeds: FairSeeds,
  rows: number = BOARD.rows,
): boolean[] => floatsOf(seeds, rows).map((f) => f >= 0.5);

/**
 * The Target Bin: how many of the walk's steps went right.
 *
 * Bin 0 is every step left, which is the leftmost bin on the board, so this
 * index reads straight into `board.bins` with no mirroring.
 */
export const targetBinOf = (
  seeds: FairSeeds,
  rows: number = BOARD.rows,
): number => stepsOf(seeds, rows).reduce((n, right) => n + (right ? 1 : 0), 0);
