import { Application } from "pixi.js";
import { Loop } from "./core/Loop";
import { verifyCommit } from "./fair/commitment";
import { Session } from "./fair/session";
import { steerOf } from "./fair/steer";
import { Board } from "./sim/Board";
import { World } from "./sim/World";
import { monteCarlo } from "./sim/simulate";
import { BOARD, DT, REFERENCE_RTP, REFERENCE_TABLE } from "./sim/config";
import { DERIVED_RTP, DERIVED_TABLE } from "./sim/derived";
import { Renderer } from "./render/Renderer";
import { Histogram } from "./render/Histogram";
import { PAL } from "./render/palette";
import { Controls, Mode } from "./ui/Controls";
import { verifyDeterminism } from "./test/determinism";
import "./style.css";

const MONTE_RUNS = 10_000;

/**
 * The operator's secret for one session.
 *
 * This is the single place in the project where unpredictability is the
 * requirement rather than the defect: a Server Seed a player could guess proves
 * nothing. It is generated here in the UI so that nothing under src/fair/ or
 * src/sim/ needs a source of randomness — both are covered by the determinism
 * ban, and Session takes the seed as an argument for exactly this reason.
 */
function newServerSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

  /**
   * One board per mode, differing only in the payout table — the constructor
   * parameter ADR 0001 added. Same spec, so the same geometry, the same solver
   * and the same trajectories; what changes is what the bins are worth.
   */
  const boards: Record<Mode, Board> = {
    physics: new Board(BOARD, DERIVED_TABLE),
    outcome: new Board(BOARD, REFERENCE_TABLE),
  };
  const rtp: Record<Mode, string> = {
    physics: `${(DERIVED_RTP * 100).toFixed(4)}% measured`,
    outcome: `${(REFERENCE_RTP * 100).toFixed(4)}% exact`,
  };

  let mode: Mode = "physics";
  const renderer = new Renderer(app, boards[mode]);
  const histogram = new Histogram(document.getElementById("histogram")!);
  const loop = new Loop(DT);

  // Counted per mode: pooling them into one chart would average the honest
  // distribution with the drawn one and say nothing about either.
  const counts: Record<Mode, number[]> = {
    physics: new Array(boards.physics.bins.length).fill(0),
    outcome: new Array(boards.outcome.bins.length).fill(0),
  };
  const drops: Record<Mode, number> = { physics: 0, outcome: 0 };

  let world: World | null = null;
  let counted = false;
  let lastSeed = 1;
  let lastNonce = 0;
  /** What the commitment promised for the drop in flight; -1 in Physics-First. */
  let targetBin = -1;
  let session: Session;

  const startSession = () => {
    session = new Session(newServerSeed(), controls.clientSeed);
    controls.showCommit(session.commit);
    controls.setReadout("nonce", "0");
  };

  const spawn = (seed: number) => {
    lastSeed = seed;
    world = new World(boards[mode], seed);
    counted = false;
    loop.reset();
    controls.setReadout("seed", String(seed));
  };

  /** Physics-First: the seed decides the bin, and the player holds the seed. */
  const dropPhysics = (seed: number) => {
    targetBin = -1;
    controls.seed = seed;
    spawn(seed);
  };

  /**
   * Outcome-First: the bin is drawn from the commitment first, then a seed that
   * reaches it comes out of the Seed Index. The disc falls under the same
   * solver either way — see ADR 0006.
   */
  const dropOutcome = (nonce?: number) => {
    const draw = nonce === undefined ? session.deal() : { ...session.drawAt(nonce), nonce };
    lastNonce = draw.nonce;
    targetBin = draw.targetBin;
    controls.setReadout("target", String(draw.targetBin));
    controls.setReadout("nonce", String(draw.nonce));
    spawn(draw.seed);
  };

  const setMode = (next: Mode) => {
    if (next === mode) return;
    mode = next;
    world = null;
    targetBin = -1;
    renderer.setBoard(boards[mode]);
    renderer.resetTrail();
    controls.setMode(mode);
    controls.setReadout("drops", String(drops[mode]));
    controls.setReadout("rtp", rtp[mode]);
    controls.setReadout("bin", "—");
    controls.setReadout("payout", "—");
    controls.setReadout("target", "—");
    controls.setReadout("seed", "—");
    histogram.draw(counts[mode], BOARD.rows);
  };

  const controls = new Controls({
    // In Physics-First, typing a seed and pressing drop plays THAT seed;
    // pressing drop again without editing the box draws a fresh one. UI-only
    // randomness — consumed here, never reaching step().
    onDrop: () =>
      mode === "physics"
        ? dropPhysics(
            controls.seed === lastSeed ? Math.floor(Math.random() * 1e9) : controls.seed,
          )
        : dropOutcome(),

    // Replaying a drop must not advance the nonce: the same commitment has to
    // produce the same drop, or the word means nothing.
    onReplay: () => (mode === "physics" ? dropPhysics(lastSeed) : dropOutcome(lastNonce)),

    onMode: setMode,

    // A new client seed is a new session, so the old server seed has to be
    // revealed on the way out — which is the cycle a real operator runs.
    onClientSeed: () => startSession(),

    // Revealing burns the seed, so the session ends here and the next one is
    // armed immediately. The order matters: the new commitment goes up first,
    // then the closed session is shown beneath it — showCommit clears the
    // reveal, so doing it the other way round wipes what was just revealed.
    onReveal: () => {
      const closed = session;
      const verified = verifyCommit(closed.serverSeed, closed.commit);
      startSession();
      controls.showReveal(closed.commit, closed.serverSeed, closed.nonce, verified);
    },

    onMonte: () => {
      const t0 = performance.now();
      if (mode === "physics") {
        const { counts: hist, unsettled } = monteCarlo(boards.physics, MONTE_RUNS);
        histogram.draw(hist, BOARD.rows);
        console.log(
          `${MONTE_RUNS} physics drops in ${(performance.now() - t0).toFixed(1)} ms` +
          (unsettled ? ` — ${unsettled} never settled` : ""),
        );
      } else {
        // The commitment's own distribution, not the solver's. This is the
        // claim ADR 0005 rests on, drawn rather than measured: the bars land on
        // the binomial curve because they were drawn from it.
        const hist = new Array(boards.outcome.bins.length).fill(0);
        for (let nonce = 0; nonce < MONTE_RUNS; nonce++) {
          hist[steerOf(session.seedsAt(nonce)).targetBin]++;
        }
        histogram.draw(hist, BOARD.rows);
        console.log(
          `${MONTE_RUNS} commitment draws in ${(performance.now() - t0).toFixed(1)} ms`,
        );
      }
    },
  });

  app.ticker.add((ticker) => {
    const alpha = loop.advance(ticker.deltaMS / 1000, () => world?.step(DT));
    renderer.draw(world, alpha, ticker.deltaMS);

    if (world?.settled && world.binIndex >= 0 && !counted) {
      counted = true;
      drops[mode]++;
      counts[mode][world.binIndex]++;
      histogram.draw(counts[mode], BOARD.rows);
      controls.setReadout("drops", String(drops[mode]));
      controls.setReadout("bin", String(world.binIndex));
      controls.setReadout("payout", `${world.multiplier}x`);

      // The one thing Outcome-First is not allowed to get wrong: the disc has
      // to land where the commitment said before it moved. Loud rather than
      // silent, because a mismatch means the Seed Index disagrees with the
      // solver and every payout since is suspect.
      if (targetBin >= 0 && world.binIndex !== targetBin) {
        console.error(
          `steering failed: commitment promised bin ${targetBin}, seed ` +
          `${lastSeed} settled in ${world.binIndex}. The Seed Index is stale ` +
          `against the solver — regenerate with \`npm run measure\`.`,
        );
      }
    }
    controls.setReadout("fps", app.ticker.FPS.toFixed(0));
  });

  // Reachable from the devtools console during development.
  (globalThis as Record<string, unknown>).verifyDeterminism = verifyDeterminism;

  startSession();
  controls.setMode(mode);
  controls.setReadout("rtp", rtp[mode]);
  dropPhysics(1);
}

boot();
