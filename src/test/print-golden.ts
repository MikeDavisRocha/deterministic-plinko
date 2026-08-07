/**
 * Prints the reference trajectory hashes for whatever engine runs this.
 *
 * The determinism test that matters is not "same seed twice on my machine" —
 * that passes under V8 and under JavaScriptCore while the two disagree with
 * each other. Run this under a second engine and compare to GOLDEN.
 */
import { GOLDEN, trajectoryHash } from "./golden";

let mismatch = false;
for (const seed of Object.keys(GOLDEN).map(Number)) {
  const got = trajectoryHash(seed);
  const want = GOLDEN[seed];
  const ok = got === want;
  if (!ok) mismatch = true;
  console.log(`seed ${String(seed).padStart(6)}  ${got}  ${ok ? "matches" : `EXPECTED ${want}`}`);
}
console.log(mismatch ? "\nMISMATCH — this engine does not reproduce the committed trajectories." : "\nall committed trajectories reproduce on this engine.");
process.exitCode = mismatch ? 1 : 0;
