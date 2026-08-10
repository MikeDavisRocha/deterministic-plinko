import { describe, expect, it } from "vitest";
import { bytesOf, hexOf, hmacSha256, sha256 } from "../core/sha256";
import {
  commitOf,
  floatsOf,
  stepsOf,
  targetBinOf,
  verifyCommit,
} from "../fair/commitment";
import { Board } from "../sim/Board";
import { binomialPmf, BOARD, REFERENCE_TABLE } from "../sim/config";

const hex = (s: string) => hexOf(sha256(bytesOf(s)));

/**
 * The hash is written out by hand in src/core/sha256.ts, so it gets checked
 * against the published vectors rather than against itself. Everything below
 * this point is only as trustworthy as this block.
 */
describe("SHA-256", () => {
  it("matches the FIPS 180-4 vectors", () => {
    expect(hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // 56 bytes: the length field no longer fits beside the message, so this is
    // the case that forces a second block and catches padding off by one.
    expect(hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });
});

describe("HMAC-SHA256", () => {
  it("matches the RFC 4231 vectors", () => {
    expect(hexOf(hmacSha256(new Uint8Array(20).fill(0x0b), bytesOf("Hi There")))).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
    expect(
      hexOf(hmacSha256(bytesOf("Jefe"), bytesOf("what do ya want for nothing?"))),
    ).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });

  /**
   * Case 6: a 131-byte key, which has to be hashed down to 32 before padding.
   * Short keys never take that branch, so without this vector the branch ships
   * untested and only ever breaks on a long server seed.
   */
  it("hashes a key longer than one block first", () => {
    expect(
      hexOf(
        hmacSha256(
          new Uint8Array(131).fill(0xaa),
          bytesOf("Test Using Larger Than Block-Size Key - Hash Key First"),
        ),
      ),
    ).toBe("60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54");
  });
});

const SERVER = "6b9dd7a1f0c3e5824d7a0be91c4f83d55e2a7c16b8409df3a1e6c0b7d2951f8e";
const CLIENT = "player-one";
const seedsAt = (nonce: number) => ({ serverSeed: SERVER, clientSeed: CLIENT, nonce });

describe("the server seed commitment", () => {
  it("is the SHA-256 of the server seed", () => {
    expect(commitOf(SERVER)).toBe(
      "7313a09882d20497c4c2f9647534a683df8993a4b41d6ea8befb402e77834584",
    );
  });

  it("accepts the seed it was published for", () => {
    expect(verifyCommit(SERVER, commitOf(SERVER))).toBe(true);
  });

  /**
   * The whole promise of the scheme is that this fails. An operator who swaps
   * the server seed after seeing the client seed gets a different hash, and a
   * player who kept the published one can prove it.
   */
  it("rejects a server seed swapped after the fact", () => {
    expect(verifyCommit(`${SERVER}0`, commitOf(SERVER))).toBe(false);
    expect(verifyCommit(SERVER.replace(/^6/, "7"), commitOf(SERVER))).toBe(false);
  });

  it("forgives how a player pasted the hash back in", () => {
    expect(verifyCommit(SERVER, `  ${commitOf(SERVER).toUpperCase()}\n`)).toBe(true);
  });
});

describe("the commitment's float stream", () => {
  it("stays in [0, 1)", () => {
    for (let nonce = 0; nonce < 200; nonce++) {
      for (const f of floatsOf(seedsAt(nonce), 16)) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(1);
      }
    }
  });

  it("is a function of the three inputs and nothing else", () => {
    expect(floatsOf(seedsAt(7), 16)).toEqual(floatsOf(seedsAt(7), 16));
    expect(floatsOf(seedsAt(7), 16)).not.toEqual(floatsOf(seedsAt(8), 16));
    expect(floatsOf(seedsAt(7), 16)).not.toEqual(
      floatsOf({ serverSeed: SERVER, clientSeed: "player-two", nonce: 7 }, 16),
    );
    expect(floatsOf(seedsAt(7), 16)).not.toEqual(
      floatsOf({ serverSeed: `${SERVER}x`, clientSeed: CLIENT, nonce: 7 }, 16),
    );
  });

  /**
   * One HMAC round is 32 bytes and therefore only eight floats, so a 16-row
   * board needs a second round. Asking for more floats must extend the stream
   * rather than restart it.
   */
  it("extends rather than restarts when a second round is needed", () => {
    expect(floatsOf(seedsAt(3), 16).slice(0, 8)).toEqual(floatsOf(seedsAt(3), 8));
  });
});

describe("the Target Bin", () => {
  /**
   * Pinned outcomes for a fixed set of seeds. Any change to the derivation —
   * the message format, the byte-to-float weights, the round counter — moves
   * these, which is the point: the bin a player can verify is not free to
   * drift under a refactor.
   */
  it("reproduces its committed values", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => targetBinOf(seedsAt(n)))).toEqual([
      9, 5, 7, 11, 9, 8, 10, 6,
    ]);
    expect(stepsOf(seedsAt(0)).map((r) => (r ? "R" : "L")).join("")).toBe(
      "LLRRRLRLLRRLLRRR",
    );
  });

  it("is the number of steps that went right", () => {
    for (let nonce = 0; nonce < 500; nonce++) {
      const steps = stepsOf(seedsAt(nonce));
      expect(targetBinOf(seedsAt(nonce))).toBe(steps.filter(Boolean).length);
    }
  });

  /**
   * Every Target Bin has to index a real bin on the board this mode plays, or
   * the commitment can name an outcome the board cannot pay. The Reference
   * Table goes in unchanged here, which is the constructor parameter ADR 0001
   * added for exactly this.
   */
  it("indexes a bin on the Outcome-First board", () => {
    const board = new Board(BOARD, REFERENCE_TABLE as unknown as number[]);
    expect(board.bins.length).toBe(BOARD.rows + 1);
    for (let nonce = 0; nonce < 500; nonce++) {
      expect(board.bins[targetBinOf(seedsAt(nonce))]).toBeDefined();
    }
  });

  /**
   * The extremes are reachable, and here is the receipt. Bin 0 is one nonce in
   * 65 536, so a test that sampled until it saw one would be slow and flaky;
   * these two nonces were found once offline and pinned. Physics-First has to
   * measure reachability (see REACHABLE in src/sim/measured.ts) because its
   * tail is a property of the solver — here it is a property of arithmetic.
   */
  it("reaches both extremes", () => {
    expect(targetBinOf(seedsAt(186088))).toBe(0);
    expect(targetBinOf(seedsAt(146800))).toBe(16);
  });
});

/**
 * The distribution this mode is entitled to assume. Outcome-First pays from the
 * Reference Table unchanged, and that table is only worth 98.99% against a true
 * binomial — so "binomial by construction" is a claim the suite has to carry,
 * not a remark. A biased float extraction or a round counter that failed to
 * advance would still produce plausible-looking bins and would land here.
 *
 * Nothing below samples randomly: the nonces are 0..49 999, so every number is
 * a constant and pinned as one.
 */
describe("the walk the commitment draws", () => {
  const SAMPLES = 50_000;
  const counts = new Array(BOARD.rows + 1).fill(0);
  const right = new Array(BOARD.rows).fill(0);
  const agree = new Array(BOARD.rows / 2).fill(0);

  for (let nonce = 0; nonce < SAMPLES; nonce++) {
    const steps = stepsOf(seedsAt(nonce));
    counts[steps.filter(Boolean).length]++;
    for (let i = 0; i < BOARD.rows; i++) if (steps[i]) right[i]++;
    // Rows i and i+8 come from different HMAC rounds. If the round counter
    // never reached the message, round 1 would repeat round 0 and these would
    // agree every single time instead of half of it.
    for (let i = 0; i < BOARD.rows / 2; i++) if (steps[i] === steps[i + 8]) agree[i]++;
  }

  it("steps right half the time on every row", () => {
    for (const r of right) expect(Math.abs(r / SAMPLES - 0.5)).toBeLessThan(0.01);
  });

  it("draws the second half of the walk from a fresh round", () => {
    for (const a of agree) expect(Math.abs(a / SAMPLES - 0.5)).toBeLessThan(0.01);
  });

  it("centres where a binomial centres", () => {
    const mean = counts.reduce((s, c, i) => s + c * i, 0) / SAMPLES;
    expect(mean).toBeCloseTo(BOARD.rows / 2, 1);
  });

  /**
   * Chi-square against the binomial, with the two outermost bins on each side
   * pooled so no cell expects fewer than 5 — at this sample size bin 0 expects
   * 0.76 on its own, and a cell that thin makes the statistic meaningless.
   *
   * The value is pinned rather than bounded because the nonces are fixed: 11.78
   * on 14 degrees of freedom, p = 0.62. A loose bound would pass while the
   * derivation quietly changed underneath it.
   */
  it("is binomial by construction, and here is the statistic", () => {
    const pmf = binomialPmf(BOARD.rows);
    const cells = [
      { observed: counts[0] + counts[1], expected: (pmf[0] + pmf[1]) * SAMPLES },
      ...counts.slice(2, 15).map((observed: number, i: number) => ({
        observed,
        expected: pmf[i + 2] * SAMPLES,
      })),
      { observed: counts[15] + counts[16], expected: (pmf[15] + pmf[16]) * SAMPLES },
    ];

    for (const c of cells) expect(c.expected).toBeGreaterThan(5);

    const chiSquare = cells.reduce(
      (s, c) => s + (c.observed - c.expected) ** 2 / c.expected,
      0,
    );
    expect(chiSquare).toBeCloseTo(11.7782, 3);
  });
});
