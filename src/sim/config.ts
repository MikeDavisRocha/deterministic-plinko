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
 * Measured over 100 000 000 headless drops per board at this exact tuning and
 * committed in src/sim/measured.<rows>.data.ts. At 16 rows: mean fall 4.035 s,
 * dTV 0.0028 from the binomial, all 17 bins reached, and 3 drops in 100 million
 * that never settle. See
 * docs/adr/0003-lateral-drag-is-what-makes-the-walk-binomial.md — in
 * particular, airDrag is load-bearing here rather than cosmetic.
 *
 * The walk is binomial in the body and not in the tail: at 16 rows bins 3..13
 * land within 0.6% of the binomial, while the outermost bins come in at 0.46x
 * and the next pair at 1.36x. Since those are the bins carrying 110x and 41x,
 * the Reference Table pays 100.51% there rather than its binomial 98.99% —
 * which is ADR 0001's whole argument for a second table, now as a number rather
 * than a worry.
 *
 * Changing any of these constants invalidates every Measured Distribution and
 * every Derived Table solved against one. That used to be a comment; it is now
 * a test failure, via the fingerprints in src/sim/fingerprint.ts.
 */
export const PHYS: Phys = {
  gravity: 2000,
  restitution: 0.45,
  friction: 0.05,
  airDrag: 2.0,
};

/** The row counts the project ships a measured board for. */
export type Rows = 8 | 12 | 16;

export const ROW_COUNTS: readonly Rows[] = [8, 12, 16];

/**
 * Three boards, one lattice.
 *
 * Every number that touches a collision is shared: the same 36px spacing, the
 * same 6px pegs and 8px disc, the same jitter, the same triangle ratio. A row
 * count is therefore not a different physics but the same physics stopped
 * earlier, which is what makes ADR 0008's claim — that the smaller boards
 * inherit the 16-row board's tuning argument — something other than a hope.
 *
 * What does change is the frame the lattice sits in. Each board is exactly as
 * wide as its own last row plus the 44px margin the 16-row board has always
 * had, so `centerX` stays an integer (350, 278, 206) and every peg keeps
 * landing on an integer x about it. ADR 0004's mirror-symmetry licence depends
 * on precisely that, and `npm run symmetry` now checks it per board.
 *
 * The width is also the whole point of the smaller boards. The canvas is
 * scaled to the column it sits in, so a 700px board on a 390px phone renders
 * its 10px bin labels at 5px; a 412px board renders them at 9.5px. Fewer rows
 * buys legibility twice over — bigger bins, and less downscaling.
 */
export const BOARDS: Record<Rows, BoardSpec> = {
  8: {
    width: 412,
    height: 370,
    rows: 8,
    firstRowPegs: 3,
    spacingX: 36,
    spacingYRatio: 0.87,
    topY: 60,
    pegRadius: 6,
    discRadius: 8,
    spawnJitter: 1.0,
    binHeight: 44,
  },
  12: {
    width: 556,
    height: 496,
    rows: 12,
    firstRowPegs: 3,
    spacingX: 36,
    spacingYRatio: 0.87,
    topY: 60,
    pegRadius: 6,
    discRadius: 8,
    spawnJitter: 1.0,
    binHeight: 44,
  },
  16: {
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
  },
};

/**
 * The default board, and the one every ADR before 0008 means by "the board".
 * Its numbers are byte-identical to what they were before the row count became
 * a choice, so the 100-million drop run committed against it still stands.
 */
export const BOARD: BoardSpec = BOARDS[16];

/** The row count a fresh session opens on when nothing has been chosen yet. */
export const DEFAULT_ROWS: Rows = 16;

/**
 * Horizontal room left for the disc's centre between two pegs of the same row.
 * At or below zero the disc cannot pass between them and grinds down the
 * lattice instead of falling through it — a board with non-positive clearance
 * is invalid.
 *
 * The shipped boards all have 8px of clearance (36 - 2*(6+8)), because they all
 * share a spacing and a pair of radii. The spec's original radii gave exactly
 * zero, which cost ~13 s per fall; Board still warns rather than throwing,
 * because a swept spec is allowed to be invalid and the sweep should report
 * that rather than crash.
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
 * The industry-standard tables, one per row count and risk level.
 *
 * All nine pay about 98.99% against a true binomial and differ only in where
 * the money sits: low never pays under 0.5x, high pays 0.2x across the middle
 * to fund an edge worth hundreds. Same expected value, wildly different
 * variance — which is what makes risk a decision rather than a preference, and
 * the reason a Plinko board offers it at all.
 *
 * These are transcribed rather than designed, and deliberately so: they are the
 * tables a player will have seen elsewhere, which makes them a yardstick the
 * project does not own. What each one really returns is computed below rather
 * than assumed — see REFERENCE_RTPS.
 *
 * Outcome-First Mode uses them unchanged, because it draws from the binomial
 * they were designed against. Physics-First Mode does NOT — see DERIVED_TABLES
 * and docs/adr/0001-two-payout-tables-one-rtp-target.md.
 */
export const REFERENCE_TABLES: Record<Rows, Record<Risk, readonly number[]>> = {
  8: {
    low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
  },
  12: {
    low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
  },
  16: {
    low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

/** Medium at 16 rows: the table every ADR before 0007 refers to. */
export const REFERENCE_TABLE = REFERENCE_TABLES[16].medium;

/**
 * The distribution the Reference Tables were designed against: `rows` fair
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

export function rtpAgainstBinomial(table: readonly number[], rows: number): number {
  const binomial = binomialPmf(rows);
  return table.reduce((sum, m, i) => sum + m * binomial[i], 0);
}

/**
 * What Outcome-First Mode pays, per row count and risk. At 16 rows: 99.0001%,
 * 98.9883% and 98.9769%.
 *
 * Rationals rather than measurements, because that mode draws its bin from a
 * binomial by construction (ADR 0005) and these tables were designed against
 * exactly that. Physics-First's counterparts in DERIVED_RTPS are measured — and
 * per ADR 0001 no figure may be quoted without saying which mode, which risk,
 * which board and which distribution produced it.
 */
export const REFERENCE_RTPS: Record<Rows, Record<Risk, number>> = Object.fromEntries(
  ROW_COUNTS.map((rows) => [
    rows,
    Object.fromEntries(
      RISKS.map((risk) => [risk, rtpAgainstBinomial(REFERENCE_TABLES[rows][risk], rows)]),
    ) as Record<Risk, number>,
  ]),
) as Record<Rows, Record<Risk, number>>;

export const REFERENCE_RTP: number = REFERENCE_RTPS[16].medium;
