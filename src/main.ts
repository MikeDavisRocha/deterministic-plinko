import { Application } from "pixi.js";
import { Sfx } from "./audio/Sfx";
import { Loop } from "./core/Loop";
import { verifyCommit } from "./fair/commitment";
import { Session } from "./fair/session";
import { steerOf } from "./fair/steer";
import { Board } from "./sim/Board";
import { World } from "./sim/World";
import { monteCarlo } from "./sim/simulate";
import { BOARDS, DT, REFERENCE_RTPS, REFERENCE_TABLES, Risk, Rows } from "./sim/config";
import { DERIVED_RTPS, DERIVED_TABLES } from "./sim/derived";
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

/**
 * Which board a visitor opens on.
 *
 * The 16-row board is the project's default and the one every ADR describes,
 * but it is 700px wide and a phone is not. Its bin labels come out at 5px on a
 * 390px screen, which is the defect ADR 0008 exists to fix, so a narrow window
 * opens on a board that fits it. It is a starting point rather than a lock: all
 * three boards are one tap away on every screen.
 */
function startingRows(): Rows {
  const w = window.innerWidth;
  return w < 520 ? 8 : w < 760 ? 12 : 16;
}

async function boot() {
  let rows: Rows = startingRows();
  let mode: Mode = "physics";
  let risk: Risk = "medium";

  const app = new Application();
  await app.init({
    width: BOARDS[rows].width,
    height: BOARDS[rows].height,
    background: PAL.bg,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  const stage = document.getElementById("stage")!;
  stage.appendChild(app.canvas);

  /**
   * Make the canvas fit its column.
   *
   * This has to be set here, in JavaScript, and that is not a style choice:
   * `autoDensity` writes a fixed pixel size into the canvas's *inline* style,
   * and an inline style beats every rule in the stylesheet. So the responsive
   * rule in style.css was being silently overruled, and the board kept its
   * 700px width inside a 390px phone — the layout went to a single column
   * correctly and then overflowed it by 322px, cutting the lattice in half.
   *
   * It is a function rather than four statements because `renderer.resize()`
   * writes that inline size again, so every change of board has to re-apply it.
   *
   * Only the presentation is scaled. The drawing buffer stays at the board's
   * own size, so the disc still falls through the world the measurement was
   * taken in; on a phone the result is downscaled from a larger buffer and
   * comes out sharper, not blurrier. Resizing a board itself is not an option —
   * its dimensions are in the tuning fingerprint, and changing them invalidates
   * that board's 100-million drop measurement.
   */
  const fitCanvas = () => {
    stage.style.width = "100%";
    stage.style.maxWidth = `${BOARDS[rows].width}px`;
    app.canvas.style.width = "100%";
    app.canvas.style.height = "auto";
  };
  fitCanvas();

  /**
   * One board per row count, mode and risk — eighteen of them, differing in the
   * geometry ADR 0008 added and in the payout table ADR 0001 did. Built on
   * demand and kept, because a Board lays out up to 152 pegs and the player
   * only ever sees three of these.
   */
  const built = new Map<string, Board>();
  const board = (): Board => {
    const key = `${rows}:${mode}:${risk}`;
    let b = built.get(key);
    if (!b) {
      const table = mode === "physics" ? DERIVED_TABLES[rows][risk] : REFERENCE_TABLES[rows][risk];
      b = new Board(BOARDS[rows], table);
      built.set(key, b);
    }
    return b;
  };

  const rtpLabel = () =>
    mode === "physics"
      ? `${(DERIVED_RTPS[rows][risk] * 100).toFixed(4)}% measured`
      : `${(REFERENCE_RTPS[rows][risk] * 100).toFixed(4)}% exact`;

  const renderer = new Renderer(app, board());
  const histogram = new Histogram(document.getElementById("histogram")!);
  const loop = new Loop(DT);

  /**
   * Counted per board and per mode. Pooling two modes into one chart would
   * average the honest distribution with the drawn one and say nothing about
   * either; pooling two row counts would not even agree on how many bins there
   * are.
   */
  const counts = new Map<string, number[]>();
  const drops = new Map<string, number>();
  const tally = () => {
    const key = `${rows}:${mode}`;
    let c = counts.get(key);
    if (!c) {
      c = new Array(rows + 1).fill(0);
      counts.set(key, c);
    }
    return c;
  };
  const dropCount = () => drops.get(`${rows}:${mode}`) ?? 0;

  /**
   * The wallet. Without it the whole project measures an RTP that nothing is
   * ever paid against — CONTEXT.md defines Payout as `multiplier x bet`, and
   * until now there was no bet for the multiplier to act on.
   */
  const START_BALANCE = 1000;
  let balance = START_BALANCE;
  let wagered = 0;
  let returned = 0;
  /** The stake riding on the drop in flight; settled against on landing. */
  let stake = 0;

  const money = (v: number) => v.toFixed(2);

  const showWallet = () => {
    controls.setReadout("balance", money(balance));
    controls.setReadout("wagered", money(wagered));
    controls.setReadout("returned", money(returned));
    // The point of showing this: over a few hundred drops it walks towards the
    // target above it, so the player watches the mathematics happen instead of
    // being told about it.
    controls.setReadout(
      "actual",
      wagered > 0 ? `${((returned / wagered) * 100).toFixed(2)}%` : "—",
    );
  };

  const sfx = new Sfx();
  sfx.muted = localStorage.getItem("plinko.muted") === "1";

  // Audio cannot start before a gesture, so the context waits for the first
  // one rather than being built suspended at boot and never recovering.
  const unlock = () => sfx.unlock();
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });

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

  /**
   * Take the stake before the disc moves. Returns false when the player cannot
   * cover the bet, which is the one case a drop must not start — a round that
   * pays out against money that was never risked is not a round.
   */
  const placeBet = (): boolean => {
    const bet = controls.bet(balance);
    if (bet <= 0) return false;
    stake = bet;
    balance -= bet;
    wagered += bet;
    showWallet();
    return true;
  };

  const spawn = (seed: number) => {
    lastSeed = seed;
    world = new World(board(), seed);
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
   * solver either way — see ADR 0006. The row count goes in because the walk is
   * that many steps long and the pool is that board's own.
   */
  const dropOutcome = (nonce?: number) => {
    const draw = nonce === undefined
      ? session.deal(rows)
      : { ...session.drawAt(nonce, rows), nonce };
    lastNonce = draw.nonce;
    targetBin = draw.targetBin;
    controls.setReadout("target", String(draw.targetBin));
    controls.setReadout("nonce", String(draw.nonce));
    spawn(draw.seed);
  };

  /** Shared by the mode, risk and rows switches: all three change the board. */
  const rebind = (resetTrail: boolean) => {
    world = null;
    targetBin = -1;
    renderer.setBoard(board());
    if (resetTrail) renderer.resetTrail();
    controls.setReadout("rtp", rtpLabel());
    controls.setReadout("bin", "—");
    controls.setReadout("mult", "—");
    controls.setReadout("payout", "—");
    controls.setReadout("target", "—");
    controls.setReadout("seed", "—");
  };

  const setMode = (next: Mode) => {
    if (next === mode) return;
    mode = next;
    controls.setMode(mode);
    controls.setReadout("drops", String(dropCount()));
    rebind(true);
    histogram.draw(tally(), rows);
  };

  // Risk keeps the trail: the board and every trajectory on it are unchanged,
  // and only the numbers printed under the bins move.
  const setRisk = (next: Risk) => {
    if (next === risk) return;
    risk = next;
    controls.setRisk(risk);
    rebind(false);
  };

  /**
   * Rows changes everything the trail is a picture of — a different lattice, a
   * different number of bins, a different measured distribution — so the ghost
   * texture and the histogram both start again. The wallet does not: the money
   * is the player's across boards, and all nine tables pay the same 98.99%.
   */
  const setRows = (next: Rows) => {
    if (next === rows) return;
    rows = next;
    controls.setRows(rows);
    controls.setReadout("rows", String(rows));
    controls.setReadout("drops", String(dropCount()));
    rebind(true);
    fitCanvas();
    histogram.draw(tally(), rows);
  };

  const controls = new Controls({
    // In Physics-First, typing a seed and pressing drop plays THAT seed;
    // pressing drop again without editing the box draws a fresh one. UI-only
    // randomness — consumed here, never reaching step().
    onDrop: () => {
      if (!placeBet()) return;
      if (mode === "physics") {
        dropPhysics(controls.seed === lastSeed ? Math.floor(Math.random() * 1e9) : controls.seed);
      } else {
        dropOutcome();
      }
    },

    // Replaying a drop must not advance the nonce: the same commitment has to
    // produce the same drop, or the word means nothing. It is still a paid
    // round — the trajectory repeats, the stake does not come free.
    onReplay: () => {
      if (!placeBet()) return;
      if (mode === "physics") dropPhysics(lastSeed);
      else dropOutcome(lastNonce);
    },

    onMode: setMode,
    onRisk: setRisk,
    onRows: setRows,

    onReset: () => {
      balance = START_BALANCE;
      wagered = 0;
      returned = 0;
      showWallet();
    },

    onMute: () => {
      sfx.muted = !sfx.muted;
      localStorage.setItem("plinko.muted", sfx.muted ? "1" : "0");
      controls.setMuted(sfx.muted);
    },

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
        const { counts: hist, unsettled } = monteCarlo(board(), MONTE_RUNS);
        histogram.draw(hist, rows);
        console.log(
          `${MONTE_RUNS} physics drops on ${rows} rows in ${(performance.now() - t0).toFixed(1)} ms` +
          (unsettled ? ` — ${unsettled} never settled` : ""),
        );
      } else {
        // The commitment's own distribution, not the solver's. This is the
        // claim ADR 0005 rests on, drawn rather than measured: the bars land on
        // the binomial curve because they were drawn from it.
        const hist = new Array(rows + 1).fill(0);
        for (let nonce = 0; nonce < MONTE_RUNS; nonce++) {
          hist[steerOf(session.seedsAt(nonce), rows).targetBin]++;
        }
        histogram.draw(hist, rows);
        console.log(
          `${MONTE_RUNS} commitment draws in ${(performance.now() - t0).toFixed(1)} ms`,
        );
      }
    },
  });

  app.ticker.add((ticker) => {
    // Sound is emitted from inside the step, not from the frame: physics runs
    // at 120 Hz and rendering at 60, so reading hits once per frame would drop
    // every second peg the disc touched.
    const alpha = loop.advance(ticker.deltaMS / 1000, () => {
      if (!world) return;
      world.step(DT);
      if (world.hits.length) {
        const { vx, vy } = world.disc;
        sfx.peg(Math.sqrt(vx * vx + vy * vy));
      }
    });
    renderer.draw(world, alpha, ticker.deltaMS);

    if (world?.settled && world.binIndex >= 0 && !counted) {
      counted = true;
      sfx.settle(world.multiplier);
      renderer.celebrate(world.binIndex, world.multiplier);

      // Payout is multiplier x bet, which is what CONTEXT.md has said a payout
      // is since the first commit. The multiplier is reported beside it rather
      // than in place of it — they are different quantities.
      const payout = world.multiplier * stake;
      balance += payout;
      returned += payout;

      drops.set(`${rows}:${mode}`, dropCount() + 1);
      tally()[world.binIndex]++;
      histogram.draw(tally(), rows);
      showWallet();
      controls.setReadout("drops", String(dropCount()));
      controls.setReadout("bin", String(world.binIndex));
      controls.setReadout("mult", `${world.multiplier}x`);
      controls.setReadout("payout", money(payout));

      // The one thing Outcome-First is not allowed to get wrong: the disc has
      // to land where the commitment said before it moved. Loud rather than
      // silent, because a mismatch means the Seed Index disagrees with the
      // solver and every payout since is suspect.
      if (targetBin >= 0 && world.binIndex !== targetBin) {
        console.error(
          `steering failed: commitment promised bin ${targetBin}, seed ` +
          `${lastSeed} settled in ${world.binIndex} on the ${rows}-row board. ` +
          `The Seed Index is stale against the solver — regenerate with ` +
          `\`npm run measure -- ${rows}\`.`,
        );
      }
    }
    controls.setReadout("fps", app.ticker.FPS.toFixed(0));
  });

  // Reachable from the devtools console during development.
  (globalThis as Record<string, unknown>).verifyDeterminism = verifyDeterminism;

  startSession();
  controls.setMode(mode);
  controls.setRisk(risk);
  controls.setRows(rows);
  controls.setMuted(sfx.muted);
  controls.setReadout("rows", String(rows));
  controls.setReadout("rtp", rtpLabel());
  showWallet();
  // The boot drop is free: nothing has been staked yet and the player has not
  // asked for anything, so it shows the board working without touching the
  // balance.
  dropPhysics(1);
}

boot();
