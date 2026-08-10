export const DT = 1 / 120;

export interface Phys {
  /** px/s^2 */
  readonly gravity: number;
  /** bounciness against pegs */
  readonly restitution: number;
  /** tangential damping on contact */
  readonly friction: number;
  /** velocity damping per second; keep 0 for none */
  readonly airDrag: number;
}

export interface BoardSpec {
  readonly width: number;
  readonly height: number;
  readonly rows: number;
  readonly firstRowPegs: number;
  readonly spacingX: number;
  /** equilateral triangle lattice */
  readonly spacingYRatio: number;
  readonly topY: number;
  readonly pegRadius: number;
  readonly discRadius: number;
  /** +/- px, seeded — breaks the symmetry deadlock */
  readonly spawnJitter: number;
  readonly binHeight: number;
}

/**
 * Measured over 100 000 000 headless drops at this exact tuning and committed
 * in src/sim/measured.data.ts: mean fall 4.035 s, dTV 0.0028 from the binomial,
 * all 17 bins reached, and 3 drops in 100 million that never settle. See
 * docs/adr/0003-lateral-drag-is-what-makes-the-walk-binomial.md — in
 * particular, airDrag is load-bearing here rather than cosmetic.
 *
 * The walk is binomial in the body and not in the tail: bins 3..13 land within
 * 0.6% of the binomial, while the outermost bins come in at 0.46x and the next
 * pair at 1.36x. Since those are the bins carrying 110x and 41x, the Reference
 * Table pays 100.51% here rather than its binomial 98.99% — which is ADR 0001's
 * whole argument for a second table, now as a number rather than a worry.
 *
 * Changing any of these constants invalidates the Measured Distribution and the
 * Derived Table solved against it. That used to be a comment; it is now a test
 * failure, via the fingerprint in src/sim/fingerprint.ts.
 */
export const PHYS: Phys = {
  gravity: 2000,
  restitution: 0.45,
  friction: 0.05,
  airDrag: 2.0,
};

export const BOARD: BoardSpec = {
  width: 700,
  height: 620,
  rows: 16,
  firstRowPegs: 3,
  spacingX: 36,
  spacingYRatio: 0.87,
  topY: 60,
  pegRadius: 6,
  discRadius: 8,
  spawnJitter: 1.0,
  binHeight: 44,
};

/**
 * Horizontal room left for the disc's centre between two pegs of the same row.
 * At or below zero the disc cannot pass between them and grinds down the
 * lattice instead of falling through it — a board with non-positive clearance
 * is invalid.
 *
 * The shipped board has 8px of clearance (36 - 2*(6+8)). The spec's original
 * radii gave exactly zero, which cost ~13 s per fall; Board still warns rather
 * than throwing, because a swept spec is allowed to be invalid and the sweep
 * should report that rather than crash.
 */
export const clearanceOf = (b: BoardSpec) =>
  b.spacingX - 2 * (b.pegRadius + b.discRadius);

export const CLEARANCE = clearanceOf(BOARD);

/**
 * Anti-tunneling invariant:
 *   maxSpeed * DT < discRadius + pegRadius
 * With DT = 1/120 and r = 8 + 6 = 14px, the ceiling is 1680 px/s and we clamp
 * at 85% of it instead of adding CCD — the cheap correct fix here. At the
 * shipped tuning the clamp never actually binds (measured over 20 000 drops),
 * so it is a guard rail rather than part of the physics.
 */
export const maxSpeedOf = (b: BoardSpec) =>
  ((b.discRadius + b.pegRadius) / DT) * 0.85;

export const MAX_SPEED = maxSpeedOf(BOARD); // 1428 px/s

/**
 * The industry-standard 16-row medium-risk table. Pays exactly 98.99% against
 * a true binomial (64873 / 65536), so Outcome-First Mode uses it unchanged.
 * Physics-First Mode does NOT pay from this table — see the Derived Table and
 * docs/adr/0001-two-payout-tables-one-rtp-target.md.
 */
export const REFERENCE_TABLE = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
] as const;

/**
 * The distribution the Reference Table was designed against: `rows` fair
 * left/right steps, as a probability per bin. This is the yardstick, not a
 * description of our board — see src/sim/measured.ts for what the physics
 * actually does.
 */
export function binomialPmf(rows: number): number[] {
  const out: number[] = [];
  let c = 1;
  const total = 2 ** rows;
  for (let k = 0; k <= rows; k++) {
    out.push(c / total);
    c = (c * (rows - k)) / (k + 1);
  }
  return out;
}
