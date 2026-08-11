import { BOARD, BoardSpec, clearanceOf } from "./config";

export interface Peg { x: number; y: number; r: number; }
export interface Bin { x: number; left: number; right: number; multiplier: number; }

/** Where one lattice row sits in the flat `pegs` array. Drives the broad phase. */
export interface PegRow { y: number; start: number; count: number; }

export class Board {
  readonly pegs: Peg[] = [];
  readonly rows: PegRow[] = [];
  readonly bins: Bin[] = [];
  readonly centerX: number;
  readonly binY: number;
  readonly clearance: number;

  /**
   * The payout table is a parameter because the two modes do not share one:
   * Physics-First pays from the Derived Table and Outcome-First passes the
   * Reference Table unchanged. See
   * docs/adr/0001-two-payout-tables-one-rtp-target.md.
   *
   * It defaults to nothing at all — every bin pays 1x — rather than to the
   * Derived Table, and that is a dependency decision rather than a taste one.
   * The Derived Table is solved from a generated artefact, so defaulting to it
   * would make everything that touches a Board depend on a measurement,
   * *including `npm run measure` itself*: adding a row count would then require
   * the measurement of that row count to already exist. A Board with no table
   * is a board being used for its physics, which is exactly what the harness
   * wants.
   */
  constructor(
    readonly spec: BoardSpec = BOARD,
    readonly table: readonly number[] = [],
  ) {
    this.centerX = spec.width / 2;
    this.clearance = clearanceOf(spec);

    if (this.clearance <= 0) {
      console.warn(
        `board clearance is ${this.clearance}px — the disc cannot pass between ` +
        `two pegs of the same row and will grind down the lattice. Geometry ` +
        `tuning is still open; expect ~13 s falls.`,
      );
    }

    const spacingY = spec.spacingX * spec.spacingYRatio;

    for (let row = 0; row < spec.rows; row++) {
      const count = row + spec.firstRowPegs;
      const y = spec.topY + row * spacingY;
      const startX = this.centerX - ((count - 1) / 2) * spec.spacingX;
      this.rows.push({ y, start: this.pegs.length, count });
      for (let i = 0; i < count; i++) {
        this.pegs.push({ x: startX + i * spec.spacingX, y, r: spec.pegRadius });
      }
    }

    const lastCount = spec.rows - 1 + spec.firstRowPegs;
    const lastY = spec.topY + (spec.rows - 1) * spacingY;
    this.binY = lastY + spec.spacingX * 0.7;

    const lastStartX = this.centerX - ((lastCount - 1) / 2) * spec.spacingX;
    const binCount = lastCount - 1;
    for (let i = 0; i < binCount; i++) {
      const cx = lastStartX + i * spec.spacingX + spec.spacingX / 2;
      this.bins.push({
        x: cx,
        left: cx - spec.spacingX / 2,
        right: cx + spec.spacingX / 2,
        multiplier: this.table[i] ?? 1,
      });
    }
  }

  /** Walls sit just outside the outermost bins. */
  get wallLeft() { return this.bins[0].left; }
  get wallRight() { return this.bins[this.bins.length - 1].right; }
}
