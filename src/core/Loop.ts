/**
 * Fixed timestep with an accumulator.
 *
 * Physics advances in constant DT slices regardless of frame rate, so the
 * sequence of simulation states is identical on every machine. The leftover
 * accumulator is handed to the renderer as an interpolation alpha, which is
 * what keeps motion smooth when the physics rate (120 Hz) differs from the
 * display rate (usually 60 Hz).
 */
export class Loop {
  private acc = 0;

  constructor(
    private readonly dt: number,
    private readonly maxFrame = 0.25,
  ) {}

  /** Returns the interpolation alpha in [0, 1) after running the due steps. */
  advance(frameSeconds: number, step: () => void): number {
    // Clamp guards against the spiral of death after a tab-switch stall.
    this.acc += Math.min(frameSeconds, this.maxFrame);
    while (this.acc >= this.dt) {
      step();
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }

  reset() {
    this.acc = 0;
  }
}
