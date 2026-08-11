import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOARDS, clearanceOf, DT, maxSpeedOf, ROW_COUNTS } from "../sim/config";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { MAX_STEPS } from "../sim/simulate";
import { mulberry32 } from "../core/Rng";
import { verifyDeterminism } from "./determinism";
import { GOLDEN, GOLDEN_DROPS, trajectoryHash } from "./golden";

describe("replay", () => {
  for (const rows of ROW_COUNTS) {
    it(`reproduces a seed bit for bit at ${rows} rows`, () => {
      expect(verifyDeterminism(12345, rows)).toBe(true);
    });
  }

  // Same-engine equality is the weak half of the check: it passes under V8 and
  // passes under JavaScriptCore while the two disagree with each other. The
  // hashes are the half that catches that — run `npm run golden` on a second
  // engine to close the loop. See ADR 0002.
  for (const { rows, seed } of GOLDEN_DROPS) {
    it(`matches the committed trajectory hash for seed ${seed} at ${rows} rows`, () => {
      expect(trajectoryHash(seed, rows)).toBe(GOLDEN[rows][seed]);
    });
  }
});

describe("the solver's engine-dependent-operation ban", () => {
  // These files explain the ban in prose, and the prose names the calls it
  // bans — Rng.ts says "Math.random() is banned" — so the scan has to read
  // code only. No string in the solver contains // or /*, so this is enough.
  const code = (file: string) =>
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  const sources = [
    ...readdirSync("src/sim").map((f) => join("src/sim", f)),
    ...readdirSync("src/fair").map((f) => join("src/fair", f)),
    "src/core/Vec2.ts", // outside src/sim/, but World imports it
    "src/core/Rng.ts",
    "src/core/Loop.ts",
    "src/core/hash.ts", // decides whether a golden hash or a fingerprint matches
    "src/core/sha256.ts", // decides the Target Bin a player is told to verify
  ];

  it.each(sources)("%s does not call Math.hypot", (file) => {
    expect(code(file)).not.toContain("Math.hypot(");
  });

  it.each(sources)("%s does not call Math.random or Date.now", (file) => {
    expect(code(file)).not.toContain("Math.random(");
    expect(code(file)).not.toContain("Date.now(");
  });
});

describe.each(ROW_COUNTS)("board invariants at %i rows", (rows) => {
  const spec = BOARDS[rows];

  it("leaves the disc room to pass between two pegs of a row", () => {
    expect(clearanceOf(spec)).toBeGreaterThan(0);
  });

  it("cannot tunnel a peg in one step", () => {
    expect(maxSpeedOf(spec) * DT).toBeLessThan(spec.discRadius + spec.pegRadius);
  });

  /**
   * Every board keeps its lattice on integers about an integer centre — 350,
   * 278, 206 — which is what ADR 0004's licence to symmetrise rests on, and
   * why the widths in BOARDS are the numbers they are rather than round ones.
   */
  it("places its pegs and bins in exact mirror image", () => {
    const board = new Board(spec);
    expect(Number.isInteger(board.centerX)).toBe(true);
    for (const peg of board.pegs) {
      // Exact, not approximate: peg x land on integers about centerX = 350, so
      // a mirrored pair has no rounding to forgive. Anything else means the
      // lattice is subtly off-centre and mirror symmetry below cannot hold.
      expect(board.pegs.some((p) => p.y === peg.y && p.x === 2 * board.centerX - peg.x)).toBe(true);
    }
    const bins = board.bins;
    for (let i = 0; i < bins.length; i++) {
      expect(bins[i].left).toBe(2 * board.centerX - bins[bins.length - 1 - i].right);
    }
  });
});

/**
 * The solver has no side.
 *
 * Spawn jitter is the only randomness in a drop; everything after it is a
 * deterministic map from that one number to a bin. On a board whose geometry is
 * an exact mirror image, that map must be antisymmetric — spawn at centerX - j
 * and you land in bin 16 - b, where centerX + j lands in b.
 *
 * This matters beyond tidiness. The 100 000 000-drop Measured Distribution is
 * measurably lopsided (chi-square 26.5 on 8 df, p = 8.5e-4), and this invariant
 * is what proves the lopsidedness belongs to the jitters mulberry32 hands out
 * for sequential seeds rather than to the physics. That in turn is what licenses
 * MEASURED_SYMMETRIC, which the Derived Table is solved against.
 *
 * A few thousand pairs here; `npm run symmetry` sweeps a million.
 */
describe.each(ROW_COUNTS)("mirror symmetry at %i rows", (rows) => {
  const board = new Board(BOARDS[rows]);
  const lastBin = board.bins.length - 1;

  const binFromSpawn = (x: number) => {
    const w = new World(board, 0);
    w.disc.x = x;
    w.disc.prevX = x;
    while (!w.settled && w.steps < MAX_STEPS) w.step(DT);
    return w.binIndex;
  };

  const mirrors = (j: number) =>
    binFromSpawn(board.centerX + j) + binFromSpawn(board.centerX - j) === lastBin;

  it("mirrors the bin for every jitter the RNG produces", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const j = (mulberry32(seed)() - 0.5) * 2 * board.spec.spawnJitter;
      expect(mirrors(j), `seed ${seed}, jitter ${j}`).toBe(true);
    }
  });

  it("mirrors the bin across the whole jitter range", () => {
    // An even grid reaches spawns the RNG may never pick.
    const N = 2000;
    for (let k = 1; k <= N; k++) {
      const j = (k / (N + 1)) * board.spec.spawnJitter;
      expect(mirrors(j), `jitter ${j}`).toBe(true);
    }
  });
});
