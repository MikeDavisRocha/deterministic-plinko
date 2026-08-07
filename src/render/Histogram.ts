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

    // Both series are normalised to their own peak, so the curve reads as the
    // shape the bars are being compared against, not as an absolute count.
    const peak = binom(rows, Math.floor(rows / 2));
    ctx.beginPath();
    ctx.strokeStyle = "#f5a524";
    ctx.lineWidth = 1;
    for (let k = 0; k < n; k++) {
      const y = h - (binom(rows, k) / peak) * (h - 10);
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
