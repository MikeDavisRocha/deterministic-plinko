import { mulberry32 } from "../core/Rng";
import { clampMagnitude } from "../core/Vec2";
import { Board } from "./Board";
import { Disc } from "./Disc";
import { BOARD, MAX_SPEED, PHYS } from "./config";

export class World {
  readonly disc: Disc;
  settled = false;
  binIndex = -1;
  steps = 0;

  /** Deterministic side-channel for the renderer: peg indices hit this step. */
  readonly hits: number[] = [];

  constructor(
    readonly board: Board,
    readonly seed: number,
  ) {
    // The RNG is consumed HERE and nowhere else. step() is a pure function
    // of the previous state, which is what makes replay bit-exact.
    const rng = mulberry32(seed);
    const jitter = (rng() - 0.5) * 2 * BOARD.spawnJitter;
    this.disc = new Disc(board.centerX + jitter, BOARD.topY - 40);
  }

  step(dt: number) {
    if (this.settled) return;
    this.hits.length = 0;
    this.steps++;

    const d = this.disc;
    d.savePrev();

    // 1. Semi-implicit (symplectic) Euler: velocity first, then position.
    //    Energy-stable, same cost as explicit Euler.
    d.vy += PHYS.gravity * dt;
    if (PHYS.airDrag > 0) {
      d.vx -= d.vx * PHYS.airDrag * dt;
      d.vy -= d.vy * PHYS.airDrag * dt;
    }
    [d.vx, d.vy] = clampMagnitude(d.vx, d.vy, MAX_SPEED);

    d.x += d.vx * dt;
    d.y += d.vy * dt;

    // 2. Pegs. Fixed array order — never iterate a Set or object keys here,
    //    their order is not guaranteed stable across engines.
    for (let i = 0; i < this.board.pegs.length; i++) {
      this.resolvePeg(i);
    }

    // 3. Walls.
    this.resolveWalls();

    // 4. Landing.
    if (d.y >= this.board.binY) this.settle();
  }

  private resolvePeg(index: number) {
    const peg = this.board.pegs[index];
    const d = this.disc;

    let dx = d.x - peg.x;
    let dy = d.y - peg.y;
    // Math.sqrt, never Math.hypot — the two engines disagree on hypot and a
    // one-ULP difference here reroutes the whole trajectory. See ADR 0002.
    let dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = d.r + peg.r;
    if (dist >= minDist) return;

    // Degenerate case: exact overlap would divide by zero and poison the
    // whole simulation with NaN. Pick an arbitrary but deterministic normal.
    if (dist < 1e-6) {
      dx = 0; dy = -1; dist = 1e-6;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    // A. Positional correction — push the disc out of penetration.
    const pen = minDist - dist;
    d.x += nx * pen;
    d.y += ny * pen;

    // B. Velocity response. Skip if already separating, otherwise the disc
    //    sticks and jitters on the peg.
    const vn = d.vx * nx + d.vy * ny;
    if (vn >= 0) return;

    d.vx -= (1 + PHYS.restitution) * vn * nx;
    d.vy -= (1 + PHYS.restitution) * vn * ny;

    // C. Tangential friction.
    const vn2 = d.vx * nx + d.vy * ny;
    const tx = d.vx - vn2 * nx;
    const ty = d.vy - vn2 * ny;
    d.vx -= tx * PHYS.friction;
    d.vy -= ty * PHYS.friction;

    this.hits.push(index);
  }

  private resolveWalls() {
    const d = this.disc;
    const left = this.board.wallLeft + d.r;
    const right = this.board.wallRight - d.r;

    if (d.x < left) {
      d.x = left;
      if (d.vx < 0) d.vx = -d.vx * PHYS.restitution;
    } else if (d.x > right) {
      d.x = right;
      if (d.vx > 0) d.vx = -d.vx * PHYS.restitution;
    }
  }

  private settle() {
    this.settled = true;
    const bins = this.board.bins;
    let idx = 0;
    // Linear scan is fine at 17 bins and keeps the logic obvious.
    for (let i = 0; i < bins.length; i++) {
      if (this.disc.x >= bins[i].left && this.disc.x < bins[i].right) { idx = i; break; }
      if (i === bins.length - 1) idx = this.disc.x < bins[0].left ? 0 : bins.length - 1;
    }
    this.binIndex = idx;
  }

  get multiplier() {
    return this.binIndex >= 0 ? this.board.bins[this.binIndex].multiplier : 0;
  }
}
