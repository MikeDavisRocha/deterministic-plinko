/**
 * Reproduce the committed trajectories under engines that are not V8.
 *
 * ADR 0002 is explicit that this is the check that matters and that a
 * same-engine determinism test cannot stand in for it: the suite "passes under
 * V8 and passes under JavaScriptCore while the two disagree with each other".
 * Node and Chrome are both V8, so running the tests twice locally proves
 * nothing about the claim the project makes.
 *
 * Playwright ships real builds of the other two engines — Firefox is
 * SpiderMonkey and WebKit is JavaScriptCore — so the trajectory hashes get
 * computed by three independent implementations of floating point and
 * compared. Chromium is included as a control: if it ever disagrees with Node,
 * the harness is broken rather than the solver.
 *
 *   npm run cross-engine
 */
import { build } from "esbuild";
import { chromium, firefox, webkit } from "playwright";

const bundle = await build({
  entryPoints: ["src/test/cross-engine-entry.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
  logLevel: "warning",
});
const code = bundle.outputFiles[0].text;

const ENGINES = [
  { engine: "V8", via: "Chromium", launcher: chromium, control: true },
  { engine: "SpiderMonkey", via: "Firefox", launcher: firefox, control: false },
  { engine: "JavaScriptCore", via: "WebKit", launcher: webkit, control: false },
];

let failed = false;

for (const { engine, via, launcher, control } of ENGINES) {
  let browser;
  try {
    browser = await launcher.launch();
  } catch (err) {
    console.error(`\n${engine} (${via}): could not launch — ${err.message}`);
    console.error("Run `npx playwright install firefox webkit chromium` first.");
    process.exitCode = 1;
    continue;
  }

  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>cross-engine</title>");
  await page.addScriptTag({ content: code });
  const results = await page.evaluate(() => globalThis.__crossEngine());
  await browser.close();

  const bad = results.filter((r) => r.got !== r.want);
  if (bad.length) failed = true;

  const label = `${engine} (${via})${control ? " [control]" : ""}`;
  console.log(`\n${label}`);
  for (const { rows, seed, got, want } of results) {
    const ok = got === want;
    console.log(
      `  ${String(rows).padStart(2)} rows  seed ${String(seed).padStart(6)}  ${got}  ` +
      `${ok ? "matches" : `EXPECTED ${want}`}`,
    );
  }
}

console.log(
  failed
    ? "\nMISMATCH — the engines do not agree on the trajectories. Something " +
      "engine-dependent got into the solver; see ADR 0002."
    : "\nEvery engine reproduces the committed trajectories bit for bit.",
);

process.exitCode = failed ? 1 : 0;
