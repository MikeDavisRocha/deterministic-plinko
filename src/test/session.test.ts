import { describe, expect, it } from "vitest";
import { commitOf, verifyCommit } from "../fair/commitment";
import { Session } from "../fair/session";
import { Board } from "../sim/Board";
import { BOARD, REFERENCE_TABLE } from "../sim/config";
import { simulate } from "../sim/simulate";

const SERVER = "6b9dd7a1f0c3e5824d7a0be91c4f83d55e2a7c16b8409df3a1e6c0b7d2951f8e";
const session = () => new Session(SERVER, "player-one");

describe("a provably fair session", () => {
  it("publishes the commitment its server seed hashes to", () => {
    const s = session();
    expect(s.commit).toBe(commitOf(SERVER));
    expect(verifyCommit(s.serverSeed, s.commit)).toBe(true);
  });

  it("starts its nonce at zero and advances one per drop", () => {
    const s = session();
    expect(s.nonce).toBe(0);
    expect([s.deal().nonce, s.deal().nonce, s.deal().nonce]).toEqual([0, 1, 2]);
    expect(s.nonce).toBe(3);
  });

  /**
   * Replay must not consume a nonce. A drop the player asks to see again has to
   * be the same drop, or "provably fair" is describing something that changes
   * when you look at it twice.
   */
  it("redraws any past drop without moving the session on", () => {
    const s = session();
    const first = s.deal();
    s.deal();
    s.deal();
    expect(s.drawAt(first.nonce)).toEqual({
      targetBin: first.targetBin,
      seed: first.seed,
      poolIndex: first.poolIndex,
      poolSize: first.poolSize,
    });
    expect(s.nonce).toBe(3);
  });

  /**
   * Two sessions with the same seeds are the same session. This is what lets a
   * player recompute the operator's drops after the reveal instead of taking
   * their word for them.
   */
  it("is reproducible from the three published values", () => {
    const mine = session();
    const theirs = session();
    for (let i = 0; i < 20; i++) expect(mine.deal()).toEqual(theirs.deal());
  });

  it("gives a different game to a different client seed", () => {
    const mine = new Session(SERVER, "player-one");
    const theirs = new Session(SERVER, "player-two");
    const a = Array.from({ length: 40 }, () => mine.deal().seed);
    const b = Array.from({ length: 40 }, () => theirs.deal().seed);
    expect(a).not.toEqual(b);
  });

  /**
   * The end-to-end promise, run as the player would run it: take the drops, the
   * commitment published before them and the seed revealed after, and check
   * that each disc landed where the commitment said it would.
   */
  it("lands every drop of a session on its promised bin", () => {
    const board = new Board(BOARD, REFERENCE_TABLE);
    const s = session();
    for (let i = 0; i < 100; i++) {
      const drop = s.deal();
      expect(simulate(board, drop.seed)).toBe(drop.targetBin);
    }
    expect(verifyCommit(s.serverSeed, s.commit)).toBe(true);
  });
});
