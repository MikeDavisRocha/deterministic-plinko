/**
 * Every sound in the game, synthesised at runtime. No files, no fetch, no
 * decode — the whole audio layer costs nothing to load and cannot 404.
 *
 * It is also the only sensible way to make a peg tick *follow the physics*: the
 * pitch and loudness of each click come from the impact speed the solver just
 * produced, so the board sounds busier when the disc is moving fast and thins
 * out as it settles. A sample would play the same click every time.
 *
 * Nothing here can reach the simulation. Sfx reads the world and never writes
 * to it, which is what keeps a muted replay bit-identical to a loud one.
 */

/** Pentatonic minor, in semitones — no interval in it can sound wrong. */
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

const noteHz = (step: number) => 220 * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPegAt = 0;

  muted = false;

  /**
   * Browsers refuse to start audio without a user gesture, so the context is
   * built on the first one rather than at boot — where it would be created
   * suspended and never recover. Safe to call repeatedly.
   */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** One decaying voice. Everything below is built out of these. */
  private blip(
    type: OscillatorType,
    hz: number,
    gain: number,
    seconds: number,
    delay = 0,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;

    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);

    // Ramp to a floor rather than to zero: exponentialRamp cannot reach 0, and
    // a linear tail on a percussive envelope reads as a click.
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);

    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /**
   * A peg. `speed` is the disc's velocity magnitude at impact, in px/s, which
   * at this tuning runs to roughly 900 — a fast glance off the top of the
   * lattice is brighter and louder than the disc dribbling into a bin.
   */
  peg(speed: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;

    // Contact can persist across a couple of steps; without this the same peg
    // machine-guns.
    const now = ctx.currentTime;
    if (now - this.lastPegAt < 0.025) return;
    this.lastPegAt = now;

    const force = Math.min(1, speed / 900);
    this.blip("triangle", 900 + force * 1500, 0.05 + force * 0.22, 0.05);
  }

  /**
   * Landing. The thud is always the same weight; what changes is what plays
   * over it — a win climbs the scale, and climbs further the bigger it is, so
   * 230x announces itself without a single word of UI.
   */
  settle(multiplier: number) {
    if (!this.ctx || this.muted) return;

    this.blip("sine", 90, 0.5, 0.28);

    if (multiplier < 1) {
      // Not a punishment, just a shrug: two soft descending notes.
      this.blip("sine", noteHz(3), 0.16, 0.16, 0.04);
      this.blip("sine", noteHz(1), 0.13, 0.22, 0.13);
      return;
    }

    // 1x pays two notes, 230x pays nine. log2 keeps the tail from running off
    // the top of the scale — the multipliers span three orders of magnitude.
    const notes = Math.min(SCALE.length - 2, 2 + Math.floor(Math.log2(multiplier + 1) * 1.6));
    for (let i = 0; i < notes; i++) {
      this.blip("triangle", noteHz(i + 2), 0.2, 0.3, i * 0.055);
      if (multiplier >= 10) this.blip("sine", noteHz(i + 5), 0.1, 0.34, i * 0.055);
    }
  }
}
