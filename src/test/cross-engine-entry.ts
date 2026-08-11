/**
 * The golden check, packaged to run inside a browser engine.
 *
 * `print-golden.ts` is the same idea for Node, and cannot be reused here: it
 * writes to `process.exitCode`, which does not exist in a page. This attaches
 * to `globalThis` rather than exporting, because the bundle is injected into a
 * blank page as a plain script and a module export would be unreachable from
 * the outside.
 *
 * Driven by scripts/cross-engine.mjs. See ADR 0002 for why an engine other
 * than V8 has to be the one answering.
 */
import { GOLDEN, GOLDEN_DROPS, trajectoryHash } from "./golden";

export interface CrossEngineRow {
  readonly rows: number;
  readonly seed: number;
  readonly got: string;
  readonly want: string;
}

(globalThis as unknown as Record<string, unknown>).__crossEngine =
  (): CrossEngineRow[] =>
    GOLDEN_DROPS.map(({ rows, seed }) => ({
      rows,
      seed,
      got: trajectoryHash(seed, rows),
      want: GOLDEN[rows][seed],
    }));
