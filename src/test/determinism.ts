import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { DT } from "../sim/config";

/** Runs the same seed twice and compares every single state, bit for bit. */
export function verifyDeterminism(seed = 12345): boolean {
  const board = new Board();
  const trace = (s: number) => {
    const w = new World(board, s);
    const out: number[] = [];
    while (!w.settled && out.length < 40_000) {
      w.step(DT);
      out.push(w.disc.x, w.disc.y, w.disc.vx, w.disc.vy);
    }
    return out;
  };

  const a = trace(seed);
  const b = trace(seed);

  if (a.length !== b.length) {
    console.error(`length mismatch: ${a.length} vs ${b.length}`);
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) { // strict equality, not epsilon — it must be identical
      console.error(`divergence at index ${i}: ${a[i]} vs ${b[i]}`);
      return false;
    }
  }
  console.log(`deterministic: ${a.length / 4} steps identical`);
  return true;
}
