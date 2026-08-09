import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DT, MAX_SPEED, BOARD, CLEARANCE } from "../sim/config";
import { verifyDeterminism } from "./determinism";
import { GOLDEN, trajectoryHash } from "./golden";

describe("replay", () => {
  it("reproduces a seed bit for bit", () => {
    expect(verifyDeterminism(12345)).toBe(true);
  });

  // Same-engine equality is the weak half of the check: it passes under V8 and
  // passes under JavaScriptCore while the two disagree with each other. The
  // hashes are the half that catches that — run `npm run golden` on a second
  // engine to close the loop. See ADR 0002.
  for (const seed of Object.keys(GOLDEN).map(Number)) {
    it(`matches the committed trajectory hash for seed ${seed}`, () => {
      expect(trajectoryHash(seed)).toBe(GOLDEN[seed]);
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
    "src/core/Vec2.ts", // outside src/sim/, but World imports it
    "src/core/Rng.ts",
    "src/core/Loop.ts",
    "src/core/hash.ts", // decides whether a golden hash or a fingerprint matches
  ];

  it.each(sources)("%s does not call Math.hypot", (file) => {
    expect(code(file)).not.toContain("Math.hypot(");
  });

  it.each(sources)("%s does not call Math.random or Date.now", (file) => {
    expect(code(file)).not.toContain("Math.random(");
    expect(code(file)).not.toContain("Date.now(");
  });
});

describe("board invariants", () => {
  it("leaves the disc room to pass between two pegs of a row", () => {
    expect(CLEARANCE).toBeGreaterThan(0);
  });

  it("cannot tunnel a peg in one step", () => {
    expect(MAX_SPEED * DT).toBeLessThan(BOARD.discRadius + BOARD.pegRadius);
  });
});
