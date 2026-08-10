import {
  Application, Container, Graphics, RenderTexture, Sprite, Text, TextStyle,
} from "pixi.js";
import { Board } from "../sim/Board";
import { World } from "../sim/World";
// Geometry comes from the board being drawn, not from the module default, so
// the renderer follows a swept tuning as readily as the shipped one.
import { PAL } from "./palette";

const TRAIL_LEN = 18;
const FLASH_MS = 150;

export class Renderer {
  private pegLayer = new Graphics();
  private flashLayer = new Graphics();
  private binLayer = new Graphics();
  private binLabels = new Container();
  private liveTrail = new Graphics();
  private discG = new Graphics();

  private ghostTex: RenderTexture;
  private ghostScratch = new Graphics();

  private trail: number[] = [];          // flat [x0,y0,x1,y1,...]
  private flashes = new Map<number, number>(); // pegIndex -> ms remaining

  private root!: Container;
  private burstLayer = new Graphics();
  /** Flat [x, y, vx, vy, msLeft, msTotal, color] per spark. */
  private sparks: number[] = [];
  private shake = 0;
  private binGlow = -1;
  private binGlowMs = 0;

  constructor(
    private app: Application,
    private board: Board,
  ) {
    // Geometry is shared by both modes; only the printed multipliers differ.
    // That is why switching modes redraws the bins and leaves everything else
    // — pegs, ghost texture, trail — exactly where it was.
    const root = new Container();
    this.root = root;
    app.stage.addChild(root);

    this.ghostTex = RenderTexture.create({
      width: board.spec.width,
      height: board.spec.height,
      resolution: app.renderer.resolution,
    });
    const ghostSprite = new Sprite(this.ghostTex);
    ghostSprite.alpha = 1;

    root.addChild(
      ghostSprite, this.binLayer, this.binLabels,
      this.pegLayer, this.flashLayer, this.liveTrail, this.discG, this.burstLayer,
    );

    this.drawPegsOnce();
    this.drawBins();

    this.discG.circle(0, 0, this.board.spec.discRadius).fill({ color: PAL.accent });
    this.discG.visible = false;
  }

  /** Pegs are static — drawn a single time, never redrawn. */
  private drawPegsOnce() {
    for (const p of this.board.pegs) {
      this.pegLayer.circle(p.x, p.y, p.r).fill({ color: PAL.peg });
    }
  }

  /**
   * Point the renderer at another board. Both modes share a BoardSpec, so this
   * is only ever a change of payout table — and seeing 110x become 230x at the
   * edges when the mode switches is the clearest statement the project makes.
   */
  setBoard(board: Board) {
    this.board = board;
    // A glow in flight was scaling a label that drawBins is about to destroy,
    // and its sparks belong to the drop that just ended on the old table.
    this.binGlow = -1;
    this.binGlowMs = 0;
    this.sparks.length = 0;
    this.shake = 0;
    this.drawBins();
  }

  private drawBins() {
    const y = this.board.binY;
    const style = (color: number) =>
      new TextStyle({ fontFamily: "JetBrains Mono", fontSize: 10, fill: color });

    this.binLayer.clear();
    this.binLabels.removeChildren().forEach((c) => c.destroy());

    for (const bin of this.board.bins) {
      const hot = bin.multiplier >= 3;
      this.binLayer
        .roundRect(bin.left + 2, y, bin.right - bin.left - 4, this.board.spec.binHeight, 4)
        .fill({ color: PAL.panel })
        .stroke({ width: 1, color: hot ? PAL.win : PAL.peg });

      const label = new Text({
        text: bin.multiplier >= 1 ? `${bin.multiplier}x` : `${bin.multiplier}`,
        style: style(hot ? PAL.win : PAL.text),
      });
      label.anchor.set(0.5);
      label.x = bin.x;
      label.y = y + this.board.spec.binHeight / 2;
      this.binLabels.addChild(label);
    }
  }

  /**
   * A disc has landed. Everything here is scaled by what the bin paid, so the
   * board reacts in proportion — 0.3x gets a quiet glow, 230x shakes the
   * screen. Purely presentational: called after the simulation is already over
   * and unable to affect it.
   */
  celebrate(binIndex: number, multiplier: number) {
    const bin = this.board.bins[binIndex];
    if (!bin) return;

    // log2 because the table spans 0.3x to 230x; linear scaling would make
    // everything below 10x indistinguishable.
    const weight = Math.min(1, Math.max(0, Math.log2(multiplier + 1) / Math.log2(231)));
    const win = multiplier >= 1;

    this.binGlow = binIndex;
    this.binGlowMs = 260 + weight * 500;
    this.shake = win ? weight * 9 : 0;

    const count = win ? Math.round(6 + weight * 44) : 4;
    const color = multiplier >= 3 ? PAL.win : win ? PAL.accent : PAL.peg;
    const y = this.board.binY;

    for (let i = 0; i < count; i++) {
      // Fanned upward out of the bin mouth. Randomness here is presentation
      // only — it never touches the solver, so a replay looks alike without
      // being required to spark identically.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (win ? 2.0 : 0.9);
      const speed = (60 + Math.random() * 190) * (0.45 + weight);
      const life = 380 + Math.random() * 520;
      this.sparks.push(
        bin.x + (Math.random() - 0.5) * (bin.right - bin.left) * 0.7, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        life, life, color,
      );
    }
  }

  /** Call once per rendered frame. `alpha` comes from the Loop. */
  draw(world: World | null, alpha: number, deltaMS: number) {
    this.tickFlashes(deltaMS);
    this.tickSparks(deltaMS);
    this.tickShake(deltaMS);

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

  /**
   * The bin that just paid, lit and lifted for a moment. Drawn into the flash
   * layer rather than the bin layer so it decays without forcing the static
   * bins to be rebuilt every frame.
   */
  private drawBinGlow(deltaMS: number) {
    if (this.binGlow < 0) return;

    this.binGlowMs -= deltaMS;
    const bin = this.board.bins[this.binGlow];
    if (this.binGlowMs <= 0 || !bin) {
      this.binGlow = -1;
      for (const label of this.binLabels.children) label.scale.set(1);
      return;
    }

    const t = Math.min(1, this.binGlowMs / 260);
    const hot = bin.multiplier >= 3;
    const h = this.board.spec.binHeight;

    this.flashLayer
      .roundRect(bin.left + 2, this.board.binY, bin.right - bin.left - 4, h, 4)
      .fill({ color: hot ? PAL.win : PAL.accent, alpha: 0.10 + t * 0.35 })
      .stroke({ width: 1, color: hot ? PAL.win : PAL.accent, alpha: t });

    // The label rides the same curve, which is what sells it as one event
    // rather than a rectangle that happened to light up behind some text.
    this.binLabels.children[this.binGlow]?.scale.set(1 + t * 0.35);
  }

  /** Sparks are a flat array so a burst of fifty allocates nothing per frame. */
  private tickSparks(deltaMS: number) {
    this.burstLayer.clear();
    if (!this.sparks.length) return;

    const dt = deltaMS / 1000;
    const STRIDE = 7;

    for (let i = this.sparks.length - STRIDE; i >= 0; i -= STRIDE) {
      const left = (this.sparks[i + 4] -= deltaMS);
      if (left <= 0) {
        // Swap-remove: order does not matter to a particle field, and this
        // keeps removal O(1) instead of shifting the tail every frame.
        for (let k = 0; k < STRIDE; k++) {
          this.sparks[i + k] = this.sparks[this.sparks.length - STRIDE + k];
        }
        this.sparks.length -= STRIDE;
        continue;
      }

      this.sparks[i + 3] += 620 * dt;                 // gravity, in px/s^2
      this.sparks[i] += this.sparks[i + 2] * dt;
      this.sparks[i + 1] += this.sparks[i + 3] * dt;

      const t = left / this.sparks[i + 5];
      this.burstLayer
        .circle(this.sparks[i], this.sparks[i + 1], 1 + t * 2)
        .fill({ color: this.sparks[i + 6], alpha: t * t });
    }
  }

  private tickShake(deltaMS: number) {
    if (this.shake <= 0.05) {
      this.shake = 0;
      this.root.position.set(0, 0);
      return;
    }
    // Halve every ~60ms, so even the biggest hit is done inside a fifth of a
    // second. Shake that outlasts the moment reads as a bug.
    this.shake *= Math.pow(0.5, deltaMS / 60);
    this.root.position.set(
      (Math.random() - 0.5) * 2 * this.shake,
      (Math.random() - 0.5) * 2 * this.shake,
    );
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
    this.drawBinGlow(deltaMS);
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
      container: new Graphics().rect(0, 0, this.board.spec.width, this.board.spec.height).fill({ color: 0x000000, alpha: 0 }),
      target: this.ghostTex,
      clear: true,
    });
  }
}
