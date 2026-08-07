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

export const PHYS: Phys = {
  gravity: 900,
  restitution: 0.5,
  friction: 0.05,
  airDrag: 0.0,
};

export const BOARD: BoardSpec = {
  width: 700,
  height: 620,
  rows: 16,
  firstRowPegs: 3,
  spacingX: 36,
  spacingYRatio: 0.87,
  topY: 60,
  pegRadius: 8,
  discRadius: 10,
  spawnJitter: 1.0,
  binHeight: 44,
};

/**
 * Horizontal room left for the disc's centre between two pegs of the same row.
 * At or below zero the disc cannot pass between them and grinds down the
 * lattice instead of falling through it — a board with non-positive clearance
 * is invalid.
 *
 * These starting values give exactly ZERO clearance (36 - 2*(8+10) = 0) and
 * produce ~13 s falls. The tuning that fixes this without collapsing the
 * distribution is still open; Board logs a warning rather than throwing so the
 * scaffold stays runnable while it is being settled.
 */
export const clearanceOf = (b: BoardSpec) =>
  b.spacingX - 2 * (b.pegRadius + b.discRadius);

export const CLEARANCE = clearanceOf(BOARD);

/**
 * Anti-tunneling invariant:
 *   maxSpeed * DT < discRadius + pegRadius
 * With DT = 1/120, r = 10 + 8 = 18px, the ceiling is 2160 px/s.
 * We clamp below that instead of adding CCD — the cheap correct fix here.
 */
export const maxSpeedOf = (b: BoardSpec) =>
  ((b.discRadius + b.pegRadius) / DT) * 0.85;

export const MAX_SPEED = maxSpeedOf(BOARD); // 1836 px/s

/**
 * The industry-standard 16-row medium-risk table. Pays exactly 98.99% against
 * a true binomial (64873 / 65536), so Outcome-First Mode uses it unchanged.
 * Physics-First Mode does NOT pay from this table — see the Derived Table and
 * docs/adr/0001-two-payout-tables-one-rtp-target.md.
 */
export const REFERENCE_TABLE = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
] as const;
