/**
 * Prints the DERIVED_TABLES literal for src/sim/derived.ts, and what each table
 * costs to print.
 *
 *   npm run derived
 *
 * ADR 0001 keeps the rounded tables as hand-written literals because the
 * rounded numbers are the product and belong where a person can read them. This
 * is the other half of that bargain: the numbers are generated, pasted, and
 * then held to the solve by derived.test.ts — so "written by hand" never means
 * "typed from memory".
 *
 * Run it after every `npm run measure`. A new distribution is a new solve.
 */
import { REFERENCE_TABLES, RISKS, ROW_COUNTS } from "../sim/config";
import {
  derivedExactFor, GRIDS, roundedTable, ROUNDING_TOLERANCE, roundOn, rtpOn,
} from "../sim/derived";
import { MEASURED_RUNS } from "../sim/measured";

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

console.log("export const DERIVED_TABLES: Record<Rows, Record<Risk, readonly number[]>> = {");
for (const rows of ROW_COUNTS) {
  console.log(`  ${rows}: {`);
  for (const risk of RISKS) {
    console.log(`    ${risk}: [${roundedTable(derivedExactFor(REFERENCE_TABLES[rows][risk], rows), rows).join(", ")}],`);
  }
  console.log("  },");
}
console.log("};");

console.log("\nwhat each table costs to print");
for (const rows of ROW_COUNTS) {
  const run = MEASURED_RUNS[rows];
  console.log(`\n  ${rows} rows — ${run.samples.toLocaleString("en-US")} drops, tuning ${run.tuning}`);
  for (const risk of RISKS) {
    const exact = derivedExactFor(REFERENCE_TABLES[rows][risk], rows);
    const printed = roundedTable(exact, rows);
    const target = rtpOn(exact, rows);
    // Which rung of the ladder the table landed on, for the record.
    const rung = GRIDS.findIndex(
      (g) => Math.abs(rtpOn(exact.map((v) => roundOn(g, v)), rows) - target) <= ROUNDING_TOLERANCE,
    );
    const paid = run.rtpOf(printed);
    console.log(
      `    ${risk.padEnd(6)} exact ${pct(target)}  printed ${pct(paid)}  ` +
      `cost ${((paid - target) * 100).toFixed(4)} pt  grid ${rung < 0 ? "finest (missed)" : rung === 0 ? "coarse" : `fine (rung ${rung})`}`,
    );
  }
}
