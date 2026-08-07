import { Application } from "pixi.js";
import { Loop } from "./core/Loop";
import { Board } from "./sim/Board";
import { World } from "./sim/World";
import { monteCarlo } from "./sim/simulate";
import { BOARD, DT } from "./sim/config";
import { Renderer } from "./render/Renderer";
import { Histogram } from "./render/Histogram";
import { PAL } from "./render/palette";
import { Controls } from "./ui/Controls";
import { verifyDeterminism } from "./test/determinism";
import "./style.css";

async function boot() {
  const app = new Application();
  await app.init({
    width: BOARD.width,
    height: BOARD.height,
    background: PAL.bg,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById("stage")!.appendChild(app.canvas);

  const board = new Board();
  const renderer = new Renderer(app, board);
  const histogram = new Histogram(document.getElementById("histogram")!);
  const loop = new Loop(DT);

  let world: World | null = null;
  let lastSeed = 1;
  let counted = false;
  let drops = 0;
  const counts = new Array(board.bins.length).fill(0);

  const start = (seed: number) => {
    lastSeed = seed;
    world = new World(board, seed);
    counted = false;
    loop.reset();
    renderer.resetTrail();
    controls.seed = seed;
  };

  const controls = new Controls({
    // Typing a seed and pressing drop plays THAT seed; pressing drop again
    // without editing the box draws a fresh one. UI-only randomness — it is
    // consumed here and never reaches step().
    onDrop: (seed) => start(seed === lastSeed ? Math.floor(Math.random() * 1e9) : seed),
    onReplay: () => start(lastSeed),
    onMonte: () => {
      const t0 = performance.now();
      const { counts: hist, unsettled } = monteCarlo(board, 10_000);
      histogram.draw(hist, BOARD.rows);
      console.log(
        `10 000 sims in ${(performance.now() - t0).toFixed(1)} ms` +
        (unsettled ? ` — ${unsettled} never settled` : ""),
      );
    },
  });

  app.ticker.add((ticker) => {
    const alpha = loop.advance(ticker.deltaMS / 1000, () => world?.step(DT));
    renderer.draw(world, alpha, ticker.deltaMS);

    if (world?.settled && world.binIndex >= 0 && !counted) {
      counted = true;
      drops++;
      counts[world.binIndex]++;
      histogram.draw(counts, BOARD.rows);
      controls.setReadout("drops", String(drops));
      controls.setReadout("bin", String(world.binIndex));
      controls.setReadout("payout", `${world.multiplier}x`);
    }
    controls.setReadout("fps", app.ticker.FPS.toFixed(0));
  });

  // Reachable from the devtools console during development.
  (globalThis as Record<string, unknown>).verifyDeterminism = verifyDeterminism;

  start(1);
}

boot();
