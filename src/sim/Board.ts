import { BOARD, CLEARANCE, REFERENCE_TABLE } from "./config";

export interface Peg { x: number; y: number; r: number; }
export interface Bin { x: number; left: number; right: number; multiplier: number; }

export class Board {
  readonly pegs: Peg[] = [];
  readonly bins: Bin[] = [];
  readonly centerX = BOARD.width / 2;
  readonly binY: number;

  constructor() {
    if (CLEARANCE <= 0) {
      console.warn(
        `board clearance is ${CLEARANCE}px — the disc cannot pass between two ` +
        `pegs of the same row and will grind down the lattice. Geometry tuning ` +
        `is still open; expect ~14 s falls.`,
      );
    }

    const spacingY = BOARD.spacingX * BOARD.spacingYRatio;

    for (let row = 0; row < BOARD.rows; row++) {
      const count = row + BOARD.firstRowPegs;
      const y = BOARD.topY + row * spacingY;
      const startX = this.centerX - ((count - 1) / 2) * BOARD.spacingX;
      for (let i = 0; i < count; i++) {
        this.pegs.push({ x: startX + i * BOARD.spacingX, y, r: BOARD.pegRadius });
      }
    }

    const lastCount = BOARD.rows - 1 + BOARD.firstRowPegs;
    const lastY = BOARD.topY + (BOARD.rows - 1) * spacingY;
    this.binY = lastY + BOARD.spacingX * 0.7;

    const lastStartX = this.centerX - ((lastCount - 1) / 2) * BOARD.spacingX;
    const binCount = lastCount - 1;
    for (let i = 0; i < binCount; i++) {
      const cx = lastStartX + i * BOARD.spacingX + BOARD.spacingX / 2;
      this.bins.push({
        x: cx,
        left: cx - BOARD.spacingX / 2,
        right: cx + BOARD.spacingX / 2,
        multiplier: REFERENCE_TABLE[i] ?? 1,
      });
    }
  }

  /** Walls sit just outside the outermost bins. */
  get wallLeft() { return this.bins[0].left; }
  get wallRight() { return this.bins[this.bins.length - 1].right; }
}
