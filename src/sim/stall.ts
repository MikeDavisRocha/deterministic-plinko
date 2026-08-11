import { Disc } from "./Disc";

/**
 * Notices a drop that can no longer land.
 *
 * `step()` is a pure function of the previous state — that is the property the
 * whole project rests on, and it has a second consequence nobody needed until
 * now: **a state that comes back can never lead anywhere new.** If the disc
 * ever returns to a position and velocity it has already held, every step after
 * that repeats what followed the first time, forever. So this is a proof rather
 * than a heuristic. It cannot end a drop that would eventually settle, because
 * such a drop never revisits a state — if it did, it would still be falling.
 *
 * What it catches is a real configuration, not a hypothetical one. Three seeds
 * in the 100-million drop run never settle, and all three end in the same
 * place: wedged between the left wall and the upper-left flank of the leftmost
 * peg of the second-to-last row, 66px above the bins. Gravity pulls down, the
 * peg pushes up and left, the wall pushes right, and the three cancel. Every
 * board has that corner — the wall sits at x = 44 and the peg column at x = 62
 * on all three — so the 8-row and 12-row boards were sampled lucky rather than
 * being immune. See ADR 0009.
 *
 * **Why a cycle detector rather than "did the state just repeat".** The left
 * wall's wedge is a fixed point: the state is bit-identical every step, and
 * comparing against the previous step would be enough. The right wall's is not.
 * Mirroring an intermediate state across the board does not mirror its
 * arithmetic, and the same corner on the right settles into a cycle of period 2
 * at 16 rows and period 4 at 12. A one-step test would have missed both and
 * left the player waiting out the step guard — 167 simulated seconds — for a
 * drop that was already over.
 *
 * Brent's algorithm finds a cycle of any length in constant memory: hold one
 * saved state, compare every step against it, and move the save forward at
 * exponentially growing intervals. A cycle of length L is caught within about
 * 2L steps of entering it, which for these wedges is a few hundredths of a
 * second rather than three minutes.
 *
 * Bit equality, not a tolerance. A tolerance would be a guess about how small a
 * movement counts as none; equality is the question actually being asked.
 */
export class StallWatch {
  private x = NaN;
  private y = NaN;
  private vx = NaN;
  private vy = NaN;
  /** How far the save is allowed to fall behind before it moves up. */
  private power = 1;
  /** Steps since the saved state was taken. */
  private since = 0;

  /**
   * Call when a new drop begins. NaN never equals itself, so the first
   * observation of a drop can never look like a return.
   */
  reset() {
    this.x = NaN;
    this.y = NaN;
    this.vx = NaN;
    this.vy = NaN;
    this.power = 1;
    this.since = 0;
  }

  /**
   * Records this state and answers whether the drop has entered a cycle. Call
   * once per step, after the step.
   */
  repeats(d: Disc): boolean {
    if (d.x === this.x && d.y === this.y && d.vx === this.vx && d.vy === this.vy) return true;

    if (++this.since === this.power) {
      this.x = d.x;
      this.y = d.y;
      this.vx = d.vx;
      this.vy = d.vy;
      this.power *= 2;
      this.since = 0;
    }
    return false;
  }
}
