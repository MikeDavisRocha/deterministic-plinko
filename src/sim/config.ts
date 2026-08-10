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

/** The risk the player picks. The only real decision a Plinko board offers. */
export type Risk = "low" | "medium" | "high";

export const RISKS: readonly Risk[] = ["low", "medium", "high"];

/**
 * The industry-standard 16-row tables, one per risk level.
 *
 * All three pay about 98.99% against a true binomial and differ only in where
 * the money sits: low never pays under 0.5x and tops out at 16x, high pays 0.2x
 * across five middle bins to fund a 1000x edge. Same expected value, wildly
 * different variance — which is what makes risk a decision rather than a
 * preference, and the reason a Plinko board offers it at all.
 *
 * Outcome-First Mode uses these unchanged, because it draws from the binomial
 * they were designed against. Physics-First Mode does NOT — see DERIVED_TABLES
 * and docs/adr/0001-two-payout-tables-one-rtp-target.md.
 */
export const REFERENCE_TABLES: Record<Risk, readonly number[]> = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
};

/** Medium is the default risk, and the table every ADR before 0007 refers to. */
export const REFERENCE_TABLE = REFERENCE_TABLES.medium;

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

/**
 * What Outcome-First Mode pays, per risk: 99.0001%, 98.9883% and 98.9769%.
 *
 * Rationals rather than measurements, because that mode draws its bin from a
 * binomial by construction (ADR 0005) and these tables were designed against
 * exactly that. Physics-First's counterparts in DERIVED_RTPS are measured — and
 * per ADR 0001 no figure may be quoted without saying which mode, which risk
 * and which distribution produced it.
 */
export const REFERENCE_RTPS: Record<Risk, number> = (() => {
  const binomial = binomialPmf(BOARD.rows);
  const rtp = (table: readonly number[]) =>
    table.reduce((sum, m, i) => sum + m * binomial[i], 0);
  return { low: rtp(REFERENCE_TABLES.low), medium: rtp(REFERENCE_TABLES.medium), high: rtp(REFERENCE_TABLES.high) };
})();

export const REFERENCE_RTP: number = REFERENCE_RTPS.medium;
