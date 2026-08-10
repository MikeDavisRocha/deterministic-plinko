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

  constructor(
    private app: Application,
    private board: Board,
  ) {
    // Geometry is shared by both modes; only the printed multipliers differ.
    // That is why switching modes redraws the bins and leaves everything else
    // — pegs, ghost texture, trail — exactly where it was.
    const root = new Container();
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
      this.pegLayer, this.flashLayer, this.liveTrail, this.discG,
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
      container: new Graphics().rect(0, 0, this.board.spec.width, this.board.spec.height).fill({ color: 0x000000, alpha: 0 }),
      target: this.ghostTex,
      clear: true,
    });
  }
}
