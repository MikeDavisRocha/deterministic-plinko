/**
 * Scalar helpers for the solver.
 *
 * Math.hypot is banned here even though this file lives outside src/sim/ —
 * World.ts imports it, so it is part of the solver's dependency closure.
 * V8 and JavaScriptCore disagree on Math.hypot by one ULP for 38% of inputs,
 * which is enough to make a replay verified in Chrome diverge in Safari.
 * See docs/adr/0002-no-math-hypot-in-the-solver.md.
 */
export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

export function clampMagnitude(x: number, y: number, max: number): [number, number] {
  const m = Math.sqrt(x * x + y * y);
  if (m <= max || m === 0) return [x, y];
  const s = max / m;
  return [x * s, y * s];
}
