# Deterministic Plinko — esqueleto completo do projeto

Documento único e autossuficiente. Contém setup, arquitetura, todos os arquivos com
código completo, constantes de tuning, checklist de determinismo e roteiro de 5 dias.

Código e comentários em **inglês** de propósito: o repositório vai ser lido por um
cliente internacional. Só este documento está em português.

---

## 1. Setup

```bash
npm create vite@latest deterministic-plinko -- --template vanilla-ts
cd deterministic-plinko
npm install pixi.js
npm run dev
```

Apague `src/counter.ts`, `src/typescript.svg` e o conteúdo de `src/style.css`.
Pixi v8 — a API de `Graphics` mudou em relação à v7 (agora é `g.circle(...).fill(...)`),
então ignore tutoriais antigos.

### Estrutura final

```
src/
  main.ts
  style.css
  core/
    Rng.ts          mulberry32 — a única fonte de aleatoriedade
    Vec2.ts         helpers escalares
    Loop.ts         fixed timestep com acumulador
  sim/
    config.ts       todas as constantes de física e layout
    Board.ts        geração de pinos, bins e multiplicadores
    Disc.ts         estado do disco
    World.ts        step(dt) — ZERO import de pixi.js
  render/
    palette.ts      paleta de cores
    Renderer.ts     desenha o World
    Histogram.ts    painel do Monte Carlo
  ui/
    Controls.ts     seed, drop, replay, monte carlo
  test/
    determinism.ts  verificação de replay bit-a-bit
```

**A regra que sustenta o projeto inteiro:** nada dentro de `src/sim/` importa
`pixi.js`. É isso que faz o Monte Carlo de 10.000 quedas rodar em milissegundos
(simula sem desenhar) e é o que um revisor técnico procura primeiro.

---

## 2. `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Deterministic Plinko</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <main id="app">
      <div id="stage"></div>
      <aside id="panel">
        <div class="field">
          <label for="seed">seed</label>
          <input id="seed" type="text" inputmode="numeric" value="1" />
        </div>
        <div class="row">
          <button id="drop" class="primary">drop</button>
          <button id="replay">replay</button>
        </div>
        <button id="monte">run 10 000 sims</button>
        <div id="histogram"></div>
        <dl id="readout">
          <dt>drops</dt><dd id="r-drops">0</dd>
          <dt>last bin</dt><dd id="r-bin">—</dd>
          <dt>payout</dt><dd id="r-payout">—</dd>
          <dt>tick</dt><dd id="r-tick">120 hz</dd>
          <dt>fps</dt><dd id="r-fps">—</dd>
        </dl>
      </aside>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

## 3. `src/style.css`

```css
:root {
  --bg: #0b0f14;
  --panel: #141b24;
  --line: #2a3441;
  --text: #8a97a8;
  --text-hi: #dfe6ee;
  --accent: #f5a524;
  --win: #3ddc97;
  --lose: #ff5c5c;
  --mono: "JetBrains Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  padding: 24px;
  max-width: 1100px;
  margin: 0 auto;
}

#stage canvas { display: block; border-radius: 8px; }

#panel {
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}

label {
  display: block;
  margin-bottom: 6px;
  letter-spacing: 0.08em;
  color: var(--text);
}

input {
  width: 100%;
  padding: 9px 10px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-hi);
  font-family: var(--mono);
  font-size: 13px;
}

input:focus { outline: none; border-color: var(--accent); }

.row { display: flex; gap: 8px; }

button {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-hi);
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

button:hover { border-color: var(--accent); color: var(--accent); }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 500; }
button.primary:hover { color: var(--bg); opacity: 0.9; }
button:disabled { opacity: 0.4; cursor: default; }

#histogram { border-top: 1px solid var(--line); padding-top: 12px; }
#histogram canvas { display: block; width: 100%; }

#readout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 10px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

#readout dt { letter-spacing: 0.08em; }
#readout dd { margin: 0; text-align: right; color: var(--text-hi); }

@media (max-width: 900px) {
  #app { flex-direction: column; padding: 12px; }
  #panel { width: 100%; }
  #stage canvas { width: 100%; height: auto; }
}
```

---

## 4. `src/core/Rng.ts`

```ts
/**
 * mulberry32 — small, fast, seedable PRNG.
 * This is the ONLY source of randomness in the project.
 * Math.random() is banned: it would break replay determinism.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

## 5. `src/core/Vec2.ts`

```ts
export const len = (x: number, y: number) => Math.hypot(x, y);

export function clampMagnitude(x: number, y: number, max: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= max || m === 0) return [x, y];
  const s = max / m;
  return [x * s, y * s];
}
```

## 6. `src/core/Loop.ts`

```ts
/**
 * Fixed timestep with an accumulator.
 *
 * Physics advances in constant DT slices regardless of frame rate, so the
 * sequence of simulation states is identical on every machine. The leftover
 * accumulator is handed to the renderer as an interpolation alpha, which is
 * what keeps motion smooth when the physics rate (120 Hz) differs from the
 * display rate (usually 60 Hz).
 */
export class Loop {
  private acc = 0;

  constructor(
    private readonly dt: number,
    private readonly maxFrame = 0.25,
  ) {}

  /** Returns the interpolation alpha in [0, 1) after running the due steps. */
  advance(frameSeconds: number, step: () => void): number {
    // Clamp guards against the spiral of death after a tab-switch stall.
    this.acc += Math.min(frameSeconds, this.maxFrame);
    while (this.acc >= this.dt) {
      step();
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }

  reset() {
    this.acc = 0;
  }
}
```

---

## 7. `src/sim/config.ts`

```ts
export const DT = 1 / 120;

export const PHYS = {
  gravity: 900,       // px/s^2
  restitution: 0.5,   // bounciness against pegs
  friction: 0.05,     // tangential damping on contact
  airDrag: 0.0,       // keep 0 for now; raise if drops feel floaty
} as const;

export const BOARD = {
  width: 700,
  height: 620,
  rows: 16,
  firstRowPegs: 3,
  spacingX: 36,
  spacingYRatio: 0.87, // equilateral triangle lattice
  topY: 60,
  pegRadius: 8,
  discRadius: 10,
  spawnJitter: 1.0,    // +/- px, seeded — breaks the symmetry deadlock
  binHeight: 44,
} as const;

/**
 * Anti-tunneling invariant:
 *   maxSpeed * DT < discRadius + pegRadius
 * With DT = 1/120, r = 10 + 8 = 18px, the ceiling is 2160 px/s.
 * We clamp below that instead of adding CCD — the cheap correct fix here.
 */
export const MAX_SPEED = (BOARD.discRadius + BOARD.pegRadius) / DT * 0.85; // 1836 px/s

export const MULTIPLIERS = [
  110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110,
] as const;
```

## 8. `src/sim/Board.ts`

```ts
import { BOARD, MULTIPLIERS } from "./config";

export interface Peg { x: number; y: number; r: number; }
export interface Bin { x: number; left: number; right: number; multiplier: number; }

export class Board {
  readonly pegs: Peg[] = [];
  readonly bins: Bin[] = [];
  readonly centerX = BOARD.width / 2;
  readonly binY: number;

  constructor() {
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
        multiplier: MULTIPLIERS[i] ?? 1,
      });
    }
  }

  /** Walls sit just outside the outermost bins. */
  get wallLeft() { return this.bins[0].left; }
  get wallRight() { return this.bins[this.bins.length - 1].right; }
}
```

> Sanidade: 16 fileiras → última fileira com 18 pinos → 17 bins → o array
> `MULTIPLIERS` precisa ter exatamente 17 entradas. Se mudar `rows`, ajuste os
> multiplicadores.

## 9. `src/sim/Disc.ts`

```ts
import { BOARD } from "./config";

export class Disc {
  vx = 0;
  vy = 0;
  prevX: number;
  prevY: number;
  readonly r = BOARD.discRadius;

  constructor(public x: number, public y: number) {
    this.prevX = x;
    this.prevY = y;
  }

  savePrev() {
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
```

## 10. `src/sim/World.ts` — o núcleo

```ts
import { mulberry32 } from "../core/Rng";
import { clampMagnitude } from "../core/Vec2";
import { Board } from "./Board";
import { Disc } from "./Disc";
import { BOARD, MAX_SPEED, PHYS } from "./config";

export class World {
  readonly disc: Disc;
  settled = false;
  binIndex = -1;
  steps = 0;

  /** Deterministic side-channel for the renderer: peg indices hit this step. */
  readonly hits: number[] = [];

  constructor(
    readonly board: Board,
    readonly seed: number,
  ) {
    // The RNG is consumed HERE and nowhere else. step() is a pure function
    // of the previous state, which is what makes replay bit-exact.
    const rng = mulberry32(seed);
    const jitter = (rng() - 0.5) * 2 * BOARD.spawnJitter;
    this.disc = new Disc(board.centerX + jitter, BOARD.topY - 40);
  }

  step(dt: number) {
    if (this.settled) return;
    this.hits.length = 0;
    this.steps++;

    const d = this.disc;
    d.savePrev();

    // 1. Semi-implicit (symplectic) Euler: velocity first, then position.
    //    Energy-stable, same cost as explicit Euler.
    d.vy += PHYS.gravity * dt;
    if (PHYS.airDrag > 0) {
      d.vx -= d.vx * PHYS.airDrag * dt;
      d.vy -= d.vy * PHYS.airDrag * dt;
    }
    [d.vx, d.vy] = clampMagnitude(d.vx, d.vy, MAX_SPEED);

    d.x += d.vx * dt;
    d.y += d.vy * dt;

    // 2. Pegs. Fixed array order — never iterate a Set or object keys here,
    //    their order is not guaranteed stable across engines.
    for (let i = 0; i < this.board.pegs.length; i++) {
      this.resolvePeg(i);
    }

    // 3. Walls.
    this.resolveWalls();

    // 4. Landing.
    if (d.y >= this.board.binY) this.settle();
  }

  private resolvePeg(index: number) {
    const peg = this.board.pegs[index];
    const d = this.disc;

    let dx = d.x - peg.x;
    let dy = d.y - peg.y;
    let dist = Math.hypot(dx, dy);
    const minDist = d.r + peg.r;
    if (dist >= minDist) return;

    // Degenerate case: exact overlap would divide by zero and poison the
    // whole simulation with NaN. Pick an arbitrary but deterministic normal.
    if (dist < 1e-6) {
      dx = 0; dy = -1; dist = 1e-6;
    }

    const nx = dx / dist;
    const ny = dy / dist;

    // A. Positional correction — push the disc out of penetration.
    const pen = minDist - dist;
    d.x += nx * pen;
    d.y += ny * pen;

    // B. Velocity response. Skip if already separating, otherwise the disc
    //    sticks and jitters on the peg.
    const vn = d.vx * nx + d.vy * ny;
    if (vn >= 0) return;

    d.vx -= (1 + PHYS.restitution) * vn * nx;
    d.vy -= (1 + PHYS.restitution) * vn * ny;

    // C. Tangential friction.
    const vn2 = d.vx * nx + d.vy * ny;
    const tx = d.vx - vn2 * nx;
    const ty = d.vy - vn2 * ny;
    d.vx -= tx * PHYS.friction;
    d.vy -= ty * PHYS.friction;

    this.hits.push(index);
  }

  private resolveWalls() {
    const d = this.disc;
    const left = this.board.wallLeft + d.r;
    const right = this.board.wallRight - d.r;

    if (d.x < left) {
      d.x = left;
      if (d.vx < 0) d.vx = -d.vx * PHYS.restitution;
    } else if (d.x > right) {
      d.x = right;
      if (d.vx > 0) d.vx = -d.vx * PHYS.restitution;
    }
  }

  private settle() {
    this.settled = true;
    const bins = this.board.bins;
    let idx = 0;
    // Linear scan is fine at 17 bins and keeps the logic obvious.
    for (let i = 0; i < bins.length; i++) {
      if (this.disc.x >= bins[i].left && this.disc.x < bins[i].right) { idx = i; break; }
      if (i === bins.length - 1) idx = this.disc.x < bins[0].left ? 0 : bins.length - 1;
    }
    this.binIndex = idx;
  }

  get multiplier() {
    return this.binIndex >= 0 ? this.board.bins[this.binIndex].multiplier : 0;
  }
}
```

### Headless simulation (o que torna o Monte Carlo trivial)

```ts
// src/sim/simulate.ts
import { Board } from "./Board";
import { World } from "./World";
import { DT } from "./config";

export function simulate(board: Board, seed: number): number {
  const w = new World(board, seed);
  let guard = 0;
  while (!w.settled && guard++ < 20_000) w.step(DT);
  return w.binIndex;
}

export function monteCarlo(board: Board, runs: number): number[] {
  const hist = new Array(board.bins.length).fill(0);
  for (let s = 0; s < runs; s++) hist[simulate(board, s)]++;
  return hist;
}
```

---

## 11. `src/render/palette.ts`

```ts
export const PAL = {
  bg: 0x0b0f14,
  panel: 0x141b24,
  peg: 0x2a3441,
  pegFlash: 0xdfe6ee,
  text: 0x8a97a8,
  textHi: 0xdfe6ee,
  accent: 0xf5a524,
  win: 0x3ddc97,
  lose: 0xff5c5c,
} as const;
```

## 12. `src/render/Renderer.ts`

```ts
import {
  Application, Container, Graphics, RenderTexture, Sprite, Text, TextStyle,
} from "pixi.js";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { BOARD } from "../sim/config";
import { PAL } from "./palette";

const TRAIL_LEN = 18;
const FLASH_MS = 150;

export class Renderer {
  private pegLayer = new Graphics();
  private flashLayer = new Graphics();
  private binLayer = new Graphics();
  private liveTrail = new Graphics();
  private discG = new Graphics();

  private ghostTex: RenderTexture;
  private ghostScratch = new Graphics();

  private trail: number[] = [];          // flat [x0,y0,x1,y1,...]
  private flashes = new Map<number, number>(); // pegIndex -> ms remaining

  constructor(
    private app: Application,
    private board: Board,
  ) {
    const root = new Container();
    app.stage.addChild(root);

    this.ghostTex = RenderTexture.create({
      width: BOARD.width,
      height: BOARD.height,
      resolution: app.renderer.resolution,
    });
    const ghostSprite = new Sprite(this.ghostTex);
    ghostSprite.alpha = 1;

    root.addChild(ghostSprite, this.binLayer, this.pegLayer, this.flashLayer, this.liveTrail, this.discG);

    this.drawPegsOnce();
    this.drawBinsOnce(root);

    this.discG.circle(0, 0, BOARD.discRadius).fill({ color: PAL.accent });
    this.discG.visible = false;
  }

  /** Pegs are static — drawn a single time, never redrawn. */
  private drawPegsOnce() {
    for (const p of this.board.pegs) {
      this.pegLayer.circle(p.x, p.y, p.r).fill({ color: PAL.peg });
    }
  }

  private drawBinsOnce(root: Container) {
    const y = this.board.binY;
    const style = (color: number) =>
      new TextStyle({ fontFamily: "JetBrains Mono", fontSize: 10, fill: color });

    for (const bin of this.board.bins) {
      const hot = bin.multiplier >= 3;
      this.binLayer
        .roundRect(bin.left + 2, y, bin.right - bin.left - 4, BOARD.binHeight, 4)
        .fill({ color: PAL.panel })
        .stroke({ width: 1, color: hot ? PAL.win : PAL.peg });

      const label = new Text({
        text: bin.multiplier >= 1 ? `${bin.multiplier}x` : `${bin.multiplier}`,
        style: style(hot ? PAL.win : PAL.text),
      });
      label.anchor.set(0.5);
      label.x = bin.x;
      label.y = y + BOARD.binHeight / 2;
      root.addChild(label);
    }
  }

  /** Call once per rendered frame. `alpha` comes from the Loop. */
  draw(world: World | null, alpha: number, deltaMS: number) {
    this.tickFlashes(deltaMS);

    if (!world || world.settled) {
      this.discG.visible = false;
      this.liveTrail.clear();
      return;
    }

    const d = world.disc;
    const x = d.prevX + (d.x - d.prevX) * alpha;
    const y = d.prevY + (d.y - d.prevY) * alpha;

    this.discG.visible = true;
    this.discG.position.set(x, y);

    for (const i of world.hits) this.flashes.set(i, FLASH_MS);

    this.pushTrail(x, y);
    this.drawLiveTrail();
    this.bakeGhostSegment();
  }

  private pushTrail(x: number, y: number) {
    this.trail.push(x, y);
    if (this.trail.length > TRAIL_LEN * 2) this.trail.splice(0, 2);
  }

  private drawLiveTrail() {
    this.liveTrail.clear();
    const n = this.trail.length / 2;
    for (let i = 1; i < n; i++) {
      this.liveTrail
        .moveTo(this.trail[(i - 1) * 2], this.trail[(i - 1) * 2 + 1])
        .lineTo(this.trail[i * 2], this.trail[i * 2 + 1])
        .stroke({ width: 2, color: PAL.accent, alpha: (i / n) * 0.55, cap: "round" });
    }
  }

  /**
   * The signature visual: every trajectory is baked into a persistent
   * RenderTexture at very low alpha. After a few hundred drops the overlap
   * draws the binomial distribution by itself.
   */
  private bakeGhostSegment() {
    const n = this.trail.length / 2;
    if (n < 2) return;
    this.ghostScratch.clear();
    this.ghostScratch
      .moveTo(this.trail[(n - 2) * 2], this.trail[(n - 2) * 2 + 1])
      .lineTo(this.trail[(n - 1) * 2], this.trail[(n - 1) * 2 + 1])
      .stroke({ width: 1, color: PAL.accent, alpha: 0.06, cap: "round" });

    this.app.renderer.render({
      container: this.ghostScratch,
      target: this.ghostTex,
      clear: false,
    });
  }

  private tickFlashes(deltaMS: number) {
    this.flashLayer.clear();
    for (const [index, left] of this.flashes) {
      const next = left - deltaMS;
      if (next <= 0) { this.flashes.delete(index); continue; }
      this.flashes.set(index, next);

      const p = this.board.pegs[index];
      const t = next / FLASH_MS;
      this.flashLayer
        .circle(p.x, p.y, p.r * (1 + 0.5 * t))
        .fill({ color: PAL.pegFlash, alpha: t * 0.9 });
    }
  }

  resetTrail() {
    this.trail.length = 0;
    this.liveTrail.clear();
  }

  clearGhosts() {
    this.app.renderer.render({
      container: new Graphics().rect(0, 0, BOARD.width, BOARD.height).fill({ color: 0x000000, alpha: 0 }),
      target: this.ghostTex,
      clear: true,
    });
  }
}
```

## 13. `src/render/Histogram.ts`

```ts
/** Plain canvas — no need to involve Pixi for a static side panel. */
export class Histogram {
  private ctx: CanvasRenderingContext2D;

  constructor(host: HTMLElement, private w = 224, private h = 110) {
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.height = `${h}px`;
    host.appendChild(c);
    this.ctx = c.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
  }

  /** Empirical bars plus the theoretical binomial curve on top. */
  draw(counts: number[], rows: number) {
    const { ctx, w, h } = this;
    const n = counts.length;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(1, ...counts);
    const bw = w / n;

    ctx.fillStyle = "#2a3441";
    counts.forEach((c, i) => {
      const bh = (c / max) * (h - 10);
      ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh);
    });

    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const peak = binom(rows, Math.floor(rows / 2));
    ctx.beginPath();
    ctx.strokeStyle = "#f5a524";
    ctx.lineWidth = 1;
    for (let k = 0; k < n; k++) {
      const p = binom(rows, k) / peak;
      const y = h - p * ((max / total) * total / max) * (h - 10);
      k === 0 ? ctx.moveTo(k * bw + bw / 2, y) : ctx.lineTo(k * bw + bw / 2, y);
    }
    ctx.stroke();
  }
}

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
```

---

## 14. `src/ui/Controls.ts`

```ts
type Handlers = {
  onDrop: (seed: number) => void;
  onReplay: () => void;
  onMonte: () => void;
};

export class Controls {
  private seedInput = document.getElementById("seed") as HTMLInputElement;
  private dropBtn = document.getElementById("drop") as HTMLButtonElement;
  private replayBtn = document.getElementById("replay") as HTMLButtonElement;
  private monteBtn = document.getElementById("monte") as HTMLButtonElement;

  constructor(h: Handlers) {
    this.dropBtn.onclick = () => h.onDrop(this.seed);
    this.replayBtn.onclick = () => h.onReplay();
    this.monteBtn.onclick = () => h.onMonte();
  }

  get seed(): number {
    const v = parseInt(this.seedInput.value, 10);
    return Number.isFinite(v) ? v : 1;
  }

  set seed(v: number) {
    this.seedInput.value = String(v);
  }

  setReadout(id: string, value: string) {
    const el = document.getElementById(`r-${id}`);
    if (el) el.textContent = value;
  }
}
```

## 15. `src/main.ts`

```ts
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
  let drops = 0;
  const counts = new Array(board.bins.length).fill(0);

  const start = (seed: number) => {
    lastSeed = seed;
    world = new World(board, seed);
    loop.reset();
    renderer.resetTrail();
    controls.seed = seed;
  };

  const controls = new Controls({
    onDrop: () => start(Math.floor(Math.random() * 1e9)), // UI-only randomness, never inside step()
    onReplay: () => start(lastSeed),
    onMonte: () => {
      const t0 = performance.now();
      const hist = monteCarlo(board, 10_000);
      histogram.draw(hist, BOARD.rows);
      console.log(`10 000 sims in ${(performance.now() - t0).toFixed(1)} ms`);
    },
  });

  app.ticker.add((ticker) => {
    const alpha = loop.advance(ticker.deltaMS / 1000, () => world?.step(DT));
    renderer.draw(world, alpha, ticker.deltaMS);

    if (world?.settled && world.binIndex >= 0 && !(world as any)._counted) {
      (world as any)._counted = true;
      drops++;
      counts[world.binIndex]++;
      histogram.draw(counts, BOARD.rows);
      controls.setReadout("drops", String(drops));
      controls.setReadout("bin", String(world.binIndex));
      controls.setReadout("payout", `${world.multiplier}x`);
    }
    controls.setReadout("fps", app.ticker.FPS.toFixed(0));
  });

  start(1);
}

boot();
```

---

## 16. `src/test/determinism.ts` — a verificação que vale o projeto

```ts
import { Board } from "../sim/Board";
import { World } from "../sim/World";
import { DT } from "../sim/config";

/** Runs the same seed twice and compares every single state, bit for bit. */
export function verifyDeterminism(seed = 12345): boolean {
  const board = new Board();
  const trace = (s: number) => {
    const w = new World(board, s);
    const out: number[] = [];
    while (!w.settled && out.length < 40_000) {
      w.step(DT);
      out.push(w.disc.x, w.disc.y, w.disc.vx, w.disc.vy);
    }
    return out;
  };

  const a = trace(seed);
  const b = trace(seed);

  if (a.length !== b.length) {
    console.error(`length mismatch: ${a.length} vs ${b.length}`);
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) { // strict equality, not epsilon — it must be identical
      console.error(`divergence at index ${i}: ${a[i]} vs ${b[i]}`);
      return false;
    }
  }
  console.log(`deterministic: ${a.length / 4} steps identical`);
  return true;
}
```

Chame no console durante o desenvolvimento. Se falhar, procure por
`Math.random()`, `Date.now()`, iteração de `Set`/`Map`/`Object.keys`, ou algum
valor derivado de `deltaMS` vazando para dentro de `step()`.

---

## 17. Tuning

Ajuste nesta ordem, um parâmetro por vez:

| Sintoma | Parâmetro |
|---|---|
| Disco quica alto demais, parece bola de borracha | `restitution` ↓ para 0.35–0.45 |
| Disco desce lento, parece flutuar | `gravity` ↑ para 1100–1400 |
| Trajetórias quase retas, pouca dispersão | `friction` ↓ para 0.02 |
| Disco gruda ou vibra no pino | verifique a guarda `vn >= 0` |
| Disco atravessa pinos | `MAX_SPEED` está alto demais ou `DT` grande |
| Histograma assimétrico | `spawnJitter` grande demais, ou bug na resolução lateral |
| `NaN` e disco some | guarda `dist < 1e-6` ausente |

Bom ponto de partida: `gravity 900`, `restitution 0.45`, `friction 0.05`,
`spawnJitter 1.0`.

---

## 18. Roteiro de 5 dias

**Dia 3** — setup, `Rng`, `Loop`, `config`, `Disc`. Disco caindo com gravidade e
quicando no fundo do canvas. Contador de FPS na tela. Não avance sem entender o
`ticker`.

**Dia 4** — `Board` + `resolvePeg`. É o dia mais difícil. Meta: disco descendo por
16 fileiras sem travar, sem `NaN`, sem atravessar.

**Dia 5** — bins, `settle`, multiplicadores, leitura do resultado.

**Dia 6** — UI de seed e replay. Rode `verifyDeterminism()` até passar. Este é o
dia que define o valor do projeto — não passe adiante com replay aproximado.

**Dia 7** — Monte Carlo, histograma, rastros fantasma, flash de pino, som, deploy.

---

## 19. README do repositório (template)

````md
# Deterministic Plinko

![demo](docs/demo.gif)

**[Play it →](https://your-user.github.io/deterministic-plinko/)**

A Plinko simulation built with Pixi.js v8 and a hand-written physics solver —
no physics engine. Every drop is reproducible from its seed.

## Technical highlights

**Fixed timestep with an accumulator.** Physics runs at a constant 120 Hz
independent of frame rate, with render interpolation between steps. This is what
makes the simulation frame-rate independent and reproducible.

**Bit-exact determinism.** The seeded PRNG is consumed once at spawn; `step()` is
a pure function of the previous state. Entering the same seed replays the exact
same trajectory — verified by a test that compares 4-tuples of position and
velocity across two runs with strict equality.

**Tunneling handled by invariant, not by brute force.** Rather than shrinking the
timestep, velocity is clamped so that `maxSpeed * dt < discRadius + pegRadius`
always holds, guaranteeing no discrete step can skip a peg.

**Simulation decoupled from rendering.** Nothing under `src/sim/` imports Pixi,
so the same code runs headless — 10,000 Monte Carlo simulations complete in
~180 ms, and the resulting distribution converges to the theoretical binomial.

## Run locally

```bash
npm install
npm run dev
```

## Stack

Pixi.js v8 · TypeScript · Vite
````

Substitua o `~180 ms` pelo número real que sua máquina imprimir — número medido
sustenta conversa técnica, número inventado te queima.

---

## 20. Deploy (GitHub Pages)

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
export default defineConfig({ base: "/deterministic-plinko/" });
```

```bash
npm run build
npx gh-pages -d dist
```

Depois teste no celular de verdade, com o dedo. Se o toque não funcionar ou o
canvas estourar a tela, o projeto não conta como entregue.
