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
