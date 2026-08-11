import { describe, expect, it } from "vitest";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARDS, DT, ROW_COUNTS } from "../sim/config";
import { MAX_STEPS } from "../sim/simulate";
import { StallWatch } from "../sim/stall";
import { MEASURED_RUNS } from "../sim/measured";

/**
 * The state all three never-settling seeds end in, taken off seed 59027096:
 * pinned against the left wall at x = 52, resting on the upper-left flank of
 * the leftmost peg of the second-to-last row. See ADR 0009.
 */
const WEDGE = { x: 52, y: 488.7991878193699, vx: 5.120707281079565, vy: 1.487499773039627 };
/** That peg's y on the 16-row board, which is what WEDGE.y is measured against. */
const WEDGE_PEG_Y = 498.48;

/** Drops the disc into the wedge, in the given board's own coordinates. */
function wedged(rows: (typeof ROW_COUNTS)[number], mirrored = false): World {
  const board = new Board(BOARDS[rows]);
  const secondLast = board.rows[board.rows.length - 2];
  const peg = board.pegs[secondLast.start];
  const w = new World(board, 0);
  w.disc.x = mirrored ? 2 * board.centerX - WEDGE.x : WEDGE.x;
  w.disc.y = WEDGE.y - WEDGE_PEG_Y + peg.y;
  w.disc.prevX = w.disc.x;
  w.disc.prevY = w.disc.y;
  w.disc.vx = mirrored ? -WEDGE.vx : WEDGE.vx;
  w.disc.vy = WEDGE.vy;
  return w;
}

/** Steps until the drop settles, stalls, or runs out of guard. */
function resolve(w: World): { settled: boolean; stalled: boolean; steps: number } {
  const stall = new StallWatch();
  while (!w.settled && w.steps < MAX_STEPS) {
    w.step(DT);
    if (w.settled) break;
    if (stall.repeats(w.disc)) return { settled: false, stalled: true, steps: w.steps };
  }
  return { settled: w.settled, stalled: false, steps: w.steps };
}

describe("the drops that never settle", () => {
  /**
   * The seeds the measurement named, replayed. This is the test that will fail
   * on the day the wedge is fixed in the geometry — which is exactly when the
   * artefact and this file both need revisiting.
   */
  it.each(MEASURED_RUNS[16].unsettledSeeds as number[])(
    "seed %i deadlocks, and is caught in seconds rather than minutes",
    (seed) => {
      const outcome = resolve(new World(new Board(BOARDS[16]), seed));
      expect(outcome.settled).toBe(false);
      expect(outcome.stalled).toBe(true);
      // Caught at ~348 steps, under 3 simulated seconds. The step guard alone
      // would have made a player wait 167.
      expect(outcome.steps).toBeLessThan(600);
      expect(outcome.steps * DT).toBeLessThan(5);
    },
  );

  /**
   * ADR 0009's finding: the corner belongs to the geometry every board shares,
   * not to the 16-row board. The wall sits at x = 44 on all three and the
   * second-to-last row's leftmost peg at x = 62, so a disc pinned at the wall
   * is inside that peg's contact radius wherever it happens to be standing.
   * The smaller boards reported zero unsettled drops in 100 million because
   * nothing landed in a basin a few billionths of a pixel wide, not because
   * they are safe.
   */
  describe.each(ROW_COUNTS)("the wedge at %i rows", (rows) => {
    it("holds the disc forever, on both walls", () => {
      for (const mirrored of [false, true]) {
        const w = wedged(rows, mirrored);
        const y0 = w.disc.y;
        for (let i = 0; i < 2000; i++) w.step(DT);
        expect(w.settled, `${rows} rows, mirrored=${mirrored}`).toBe(false);
        // It does not have to hold still — only to stop making progress. The
        // right wall's cycle moves the disc a fraction of a pixel and puts it
        // back, 66px above the bins, for as long as anyone cares to watch.
        expect(Math.abs(w.disc.y - y0), `${rows} rows, mirrored=${mirrored}`).toBeLessThan(1);
      }
    });

    /**
     * Both walls, and the right one is the reason this is a cycle detector.
     * The left wedge is a fixed point; the right one cycles with period 2 at
     * 16 rows and period 4 at 12, because mirroring a state across the board
     * does not mirror the arithmetic that produced it.
     */
    it("is caught by the stall watch within a few steps", () => {
      for (const mirrored of [false, true]) {
        const outcome = resolve(wedged(rows, mirrored));
        expect(outcome.stalled, `${rows} rows, mirrored=${mirrored}`).toBe(true);
        expect(outcome.steps, `${rows} rows, mirrored=${mirrored}`).toBeLessThan(60);
      }
    });

    it("puts its walls exactly where the other boards put theirs", () => {
      const board = new Board(BOARDS[rows]);
      const secondLast = board.rows[board.rows.length - 2];
      expect(board.wallLeft).toBe(44);
      expect(board.pegs[secondLast.start].x).toBe(62);
    });
  });
});

/**
 * The other half of the claim, and the half that would be expensive to get
 * wrong: the watch must never end a drop that was going to land. A repeated
 * state is proof the drop is over, so this cannot fail for a subtle reason —
 * but it is the assertion a player's stake depends on.
 */
describe("the stall watch on drops that do settle", () => {
  it.each(ROW_COUNTS)("never fires across 20 000 drops at %i rows", (rows) => {
    const board = new Board(BOARDS[rows]);
    for (let seed = 0; seed < 20_000; seed++) {
      const outcome = resolve(new World(board, seed));
      expect(outcome.stalled, `seed ${seed} at ${rows} rows`).toBe(false);
      expect(outcome.settled, `seed ${seed} at ${rows} rows`).toBe(true);
    }
  });

  it("cannot fire on the first step of a drop", () => {
    const stall = new StallWatch();
    const w = new World(new Board(BOARDS[16]), 1);
    w.step(DT);
    expect(stall.repeats(w.disc)).toBe(false);
  });

  it("forgets the previous drop when reset", () => {
    const stall = new StallWatch();
    const w = new World(new Board(BOARDS[16]), 1);
    w.step(DT);
    stall.repeats(w.disc);
    // Same state offered twice would repeat — unless the watch was reset.
    stall.reset();
    expect(stall.repeats(w.disc)).toBe(false);
    expect(stall.repeats(w.disc)).toBe(true);
  });
});
