/**
 * Prints the reference trajectory hashes for whatever engine runs this.
 *
 * The determinism test that matters is not "same seed twice on my machine" —
 * that passes under V8 and under JavaScriptCore while the two disagree with
 * each other. Run this under a second engine and compare to GOLDEN, or let
 * `npm run cross-engine` do it inside three of them.
 *
 * The block it prints is the literal for golden.ts, so a new board's hashes are
 * pasted rather than transcribed.
 */
import { GOLDEN, GOLDEN_DROPS, trajectoryHash } from "./golden";
import { ROW_COUNTS } from "../sim/config";

let mismatch = false;
for (const { rows, seed } of GOLDEN_DROPS) {
  const got = trajectoryHash(seed, rows);
  const want = GOLDEN[rows][seed];
  const ok = got === want;
  if (!ok) mismatch = true;
  console.log(
    `${String(rows).padStart(2)} rows  seed ${String(seed).padStart(6)}  ${got}  ` +
    `${ok ? "matches" : `EXPECTED ${want || "(nothing committed)"}`}`,
  );
}

console.log("\nexport const GOLDEN: Readonly<Record<Rows, Readonly<Record<number, string>>>> = {");
for (const rows of ROW_COUNTS) {
  console.log(`  ${rows}: {`);
  for (const { seed } of GOLDEN_DROPS.filter((d) => d.rows === rows)) {
    console.log(`    ${seed}: ${JSON.stringify(trajectoryHash(seed, rows))},`);
  }
  console.log("  },");
}
console.log("};");

console.log(
  mismatch
    ? "\nMISMATCH — this engine does not reproduce the committed trajectories."
    : "\nall committed trajectories reproduce on this engine.",
);
process.exitCode = mismatch ? 1 : 0;
