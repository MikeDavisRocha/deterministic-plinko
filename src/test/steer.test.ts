import { describe, expect, it } from "vitest";
import { steerOf } from "../fair/steer";
import { Board } from "../sim/Board";
import { BOARDS, REFERENCE_RTP, REFERENCE_TABLES, ROW_COUNTS } from "../sim/config";
import { MEASURED_RUNS } from "../sim/measured";
import { simulate } from "../sim/simulate";

const SERVER = "6b9dd7a1f0c3e5824d7a0be91c4f83d55e2a7c16b8409df3a1e6c0b7d2951f8e";
const CLIENT = "player-one";
const seedsAt = (nonce: number) => ({ serverSeed: SERVER, clientSeed: CLIENT, nonce });

/** The board this mode plays: the Reference Table, unchanged, per ADR 0001. */
const outcomeFirstBoard = (rows: (typeof ROW_COUNTS)[number]) =>
  new Board(BOARDS[rows], REFERENCE_TABLES[rows].medium);

describe.each(ROW_COUNTS)("the Seed Index at %i rows", (rows) => {
  const run = MEASURED_RUNS[rows];

  /**
   * The claim the whole mode rests on. If one seed here settles somewhere other
   * than where the index files it, a player is shown a disc landing in a bin
   * the commitment did not name — which is the single failure this design must
   * not have. Every indexed seed on every board, and worth every millisecond.
   */
  it("puts every indexed seed in the bin it is filed under", () => {
    const board = outcomeFirstBoard(rows);
    for (let bin = 0; bin < run.binSeeds.length; bin++) {
      for (const seed of run.binSeeds[bin]) {
        expect(simulate(board, seed)).toBe(bin);
      }
    }
  });

  it("fills every bin's pool", () => {
    expect(run.binSeeds.length).toBe(rows + 1);
    for (const pool of run.binSeeds) expect(pool.length).toBe(run.seedsPerBin);
  });

  it("holds each seed once, in order", () => {
    for (const pool of run.binSeeds) {
      expect([...pool]).toEqual([...pool].sort((a, b) => a - b));
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  /**
   * "The first 128 seeds that land in bin k" is what makes this a canonical set
   * rather than a chosen one — a player can regenerate it instead of trusting
   * it was assembled without a thumb on the scale. Checked over the first
   * 20 000 seeds, which is enough to pin the near end of every pool.
   */
  it("really is the first seeds, not merely some of them", () => {
    const PREFIX = 20_000;
    const board = outcomeFirstBoard(rows);
    const found: number[][] = Array.from({ length: run.binSeeds.length }, () => []);
    for (let seed = 0; seed < PREFIX; seed++) {
      const bin = simulate(board, seed);
      if (bin >= 0) found[bin].push(seed);
    }
    for (let bin = 0; bin < run.binSeeds.length; bin++) {
      expect(run.binSeeds[bin].filter((s) => s < PREFIX)).toEqual(
        found[bin].slice(0, run.seedsPerBin),
      );
    }
  });

  /**
   * Drops that hang are excluded structurally rather than filtered later: only
   * a settled drop is ever pushed into a pool. A steered drop therefore cannot
   * draw a seed that never lands, which is the one way this mode could have
   * inherited that defect.
   */
  it("cannot hand out a seed that never settles", () => {
    const indexed = new Set(run.binSeeds.flat());
    for (const stuck of run.unsettledSeeds) expect(indexed.has(stuck)).toBe(false);
  });
});

describe.each(ROW_COUNTS)("steering to the Target Bin at %i rows", (rows) => {
  it("lands the drop where the commitment said it would", () => {
    const board = outcomeFirstBoard(rows);
    for (let nonce = 0; nonce < 300; nonce++) {
      const drop = steerOf(seedsAt(nonce), rows);
      expect(drop.rows).toBe(rows);
      expect(simulate(board, drop.seed)).toBe(drop.targetBin);
    }
  });

  it("is a function of the seeds and the board, and nothing else", () => {
    expect(steerOf(seedsAt(11), rows)).toEqual(steerOf(seedsAt(11), rows));
    expect(steerOf(seedsAt(11), rows).seed).not.toBe(steerOf(seedsAt(12), rows).seed);
  });

  it("draws its seed from inside the Target Bin's pool", () => {
    const pools = MEASURED_RUNS[rows].binSeeds;
    for (let nonce = 0; nonce < 300; nonce++) {
      const drop = steerOf(seedsAt(nonce), rows);
      expect(drop.poolIndex).toBeGreaterThanOrEqual(0);
      expect(drop.poolIndex).toBeLessThan(drop.poolSize);
      expect(pools[drop.targetBin][drop.poolIndex]).toBe(drop.seed);
    }
  });

  /**
   * A pool that is always entered near the same place would show the player one
   * fall over and over. Across 5 000 nonces the middle bin should reach most of
   * its 128 entries; the exact figure is a constant, since the nonces are.
   */
  it("spreads across the pool rather than favouring its start", () => {
    const seen = new Set<number>();
    for (let nonce = 0; nonce < 5_000; nonce++) {
      const drop = steerOf(seedsAt(nonce), rows);
      if (drop.targetBin === rows / 2) seen.add(drop.poolIndex);
    }
    expect(seen.size).toBeGreaterThan(100);
  });

  /**
   * Two boards, same nonce, different walk. Nothing is shared between them but
   * the seeds — which is the point: the commitment decides a walk, and how long
   * the walk is belongs to the board.
   */
  it("draws its own walk for its own board", () => {
    const other = ROW_COUNTS.find((r) => r !== rows)!;
    const mine = steerOf(seedsAt(7), rows);
    const theirs = steerOf(seedsAt(7), other);
    expect(mine.rows).not.toBe(theirs.rows);
    expect(mine.targetBin).toBeLessThanOrEqual(rows);
  });
});

describe("the drops a commitment produces", () => {
  /**
   * The drop a given commitment produces, pinned end to end: seeds in, bin and
   * trajectory out. ADR 0005 pins the bin; this pins the fall the player
   * actually watches, so a change to the pool, the index float or the seed
   * order cannot pass silently. The last two nonces are the ones fair.test.ts
   * uses for the extremes — the rarest bins get a real trajectory here.
   */
  it("reproduces its committed drops on the 16-row board", () => {
    expect([0, 1, 2, 186088, 146800].map((n) => {
      const d = steerOf(seedsAt(n), 16);
      return [d.targetBin, d.seed];
    })).toEqual([
      [9, 657],
      [5, 982],
      [7, 195],
      [0, 4098121],
      [16, 1740112],
    ]);
  });

  /**
   * The mode's RTP, and the reason it needs no Derived Table: the bin comes
   * from a binomial by construction, and the Reference Table was designed
   * against exactly that. Exactly 64873/65536 at 16 rows — a rational, not a
   * measurement, which is the contrast with Physics-First's measured 99.0468%.
   */
  it("pays the Reference Table's exact 98.99%", () => {
    expect(REFERENCE_RTP).toBeCloseTo(64873 / 65536, 12);
    expect(REFERENCE_RTP).toBeCloseTo(0.9899, 4);
  });
});
