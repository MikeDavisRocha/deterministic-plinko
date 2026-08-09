/**
 * FNV-1a over the raw bit patterns of a list of numbers.
 *
 * Hashing the bytes rather than the printed numbers is the point: two engines
 * that disagree by one ULP produce identical `toFixed(6)` output and different
 * bit patterns, and it is the bit patterns that decide whether a replay
 * verifies. See docs/adr/0002-no-math-hypot-in-the-solver.md.
 */
export function hashFloats(values: readonly number[]): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (const v of values) {
    buf.setFloat64(0, v);
    for (let b = 0; b < 8; b++) {
      h ^= buf.getUint8(b);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}
