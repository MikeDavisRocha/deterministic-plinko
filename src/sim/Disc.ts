export class Disc {
  vx = 0;
  vy = 0;
  prevX: number;
  prevY: number;

  constructor(public x: number, public y: number, readonly r: number) {
    this.prevX = x;
    this.prevY = y;
  }

  savePrev() {
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
