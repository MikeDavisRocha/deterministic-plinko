export const DT = 1 / 120;

export const PHYS = {
  gravity: 900,       // px/s^2
  restitution: 0.5,   // bounciness against pegs
  friction: 0.05,     // tangential damping on contact
  airDrag: 0.0,       // keep 0 for now; raise if drops feel floaty
} as const;

export const BOARD = {
  width: 700,
  height: 620,
  rows: 16,
  firstRowPegs: 3,
  spacingX: 36,
  spacingYRatio: 0.87, // equilateral triangle lattice
  topY: 60,
  pegRadius: 8,
  discRadius: 10,
  spawnJitter: 1.0,    // +/- px, seeded — breaks the symmetry deadlock
  binHeight: 44,
} as const;

/**
 * Horizontal room left for the disc's centre between two pegs of the same row.
 * At or below zero the disc cannot pass between them and grinds down the
 * lattice instead of falling through it — a board with non-positive clearance
 * is invalid.
 *
 * These starting values give exactly ZERO clearance (36 - 2*(8+10) = 0) and
 * produce ~14 s falls. The tuning that fixes this without collapsing the
 * distribution is still open; Board logs a warning rather than throwing so the
 * scaffold stays runnable while it is being settled.
 */
export const CLEARANCE = BOARD.spacingX - 2 * (BOARD.pegRadius + BOARD.discRadius);

/**
 * Anti-tunneling invariant:
 *   maxSpeed * DT < discRadius + pegRadius
 * With DT = 1/120, r = 10 + 8 = 18px, the ceiling is 2160 px/s.
 * We clamp below that instead of adding CCD — the cheap correct fix here.
 */
export const MAX_SPEED = (BOARD.discRadius + BOARD.pegRadius) / DT * 0.85; // 1836 px/s

/**
 * The industry-standard 16-row medium-risk table. Pays exactly 98.99% against
 * a true binomial (64873 / 65536), so Outcome-First Mode uses it unchanged.
 * Physics-First Mode does NOT pay from this table — see the Derived Table and
 * docs/adr/0001-two-payout-tables-one-rtp-target.md.
 */
export const REFERENCE_TABLE = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
] as const;
