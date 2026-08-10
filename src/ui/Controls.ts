import { Risk, RISKS } from "../sim/config";

export type Mode = "physics" | "outcome";

type Handlers = {
  onDrop: () => void;
  onReplay: () => void;
  onMonte: () => void;
  onMode: (mode: Mode) => void;
  onRisk: (risk: Risk) => void;
  /** A new client seed burns the session: new server seed, new commitment. */
  onClientSeed: (value: string) => void;
  onReveal: () => void;
  onMute: () => void;
  onReset: () => void;
};

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * The panel. It owns which fields are visible, and nothing else — every button
 * hands straight back to main.ts, because the two modes differ in what a drop
 * *is* and that decision does not belong in the widget that starts one.
 */
export class Controls {
  private seedInput = el<HTMLInputElement>("seed");
  private betInput = el<HTMLInputElement>("bet");
  private clientInput = el<HTMLInputElement>("client-seed");
  private physicsBox = el("physics-controls");
  private outcomeBox = el("outcome-controls");
  private revealBox = el("reveal-box");
  private modeButtons: Record<Mode, HTMLButtonElement> = {
    physics: el<HTMLButtonElement>("mode-physics"),
    outcome: el<HTMLButtonElement>("mode-outcome"),
  };

  constructor(h: Handlers) {
    el<HTMLButtonElement>("drop").onclick = () => h.onDrop();
    el<HTMLButtonElement>("replay").onclick = () => h.onReplay();
    el<HTMLButtonElement>("monte").onclick = () => h.onMonte();
    el<HTMLButtonElement>("reveal").onclick = () => h.onReveal();
    el<HTMLButtonElement>("mute").onclick = () => h.onMute();
    el<HTMLButtonElement>("reset").onclick = () => h.onReset();

    for (const mode of ["physics", "outcome"] as const) {
      this.modeButtons[mode].onclick = () => h.onMode(mode);
    }
    for (const risk of RISKS) {
      el<HTMLButtonElement>(`risk-${risk}`).onclick = () => h.onRisk(risk);
    }

    this.clientInput.onchange = () => h.onClientSeed(this.clientSeed);
  }

  setMode(mode: Mode) {
    for (const m of ["physics", "outcome"] as const) {
      this.modeButtons[m].classList.toggle("on", m === mode);
    }
    this.physicsBox.hidden = mode !== "physics";
    this.outcomeBox.hidden = mode !== "outcome";
    for (const id of ["l-target", "r-target", "l-nonce", "r-nonce"]) {
      el(id).hidden = mode !== "outcome";
    }
  }

  setMuted(muted: boolean) {
    el("mute").textContent = muted ? "sound: off" : "sound: on";
  }

  setRisk(risk: Risk) {
    for (const r of RISKS) el(`risk-${r}`).classList.toggle("on", r === risk);
  }

  /** The bet, floored at nothing and never more than the player actually has. */
  bet(balance: number): number {
    const v = parseFloat(this.betInput.value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(v, balance);
  }

  set betValue(v: number) {
    this.betInput.value = v.toFixed(2);
  }

  get seed(): number {
    const v = parseInt(this.seedInput.value, 10);
    return Number.isFinite(v) ? v : 1;
  }

  set seed(v: number) {
    this.seedInput.value = String(v);
  }

  get clientSeed(): string {
    return this.clientInput.value.trim() || "player-one";
  }

  /** Shown before the first drop of a session; the reveal is checked against it. */
  showCommit(commit: string) {
    el("commit").textContent = commit;
    this.revealBox.hidden = true;
  }

  /**
   * Close out a session: the commitment it was played under, the seed behind
   * it, and whether one really hashes to the other. Called after the next
   * session has already been armed, because showCommit hides this box.
   */
  showReveal(commit: string, serverSeed: string, drops: number, verified: boolean) {
    el("revealed-commit").textContent = commit;
    el("server-seed").textContent = serverSeed;
    const verdict = el("verdict");
    verdict.textContent = verified
      ? `verified — sha-256 of this seed is the hash published before ` +
        `${drops === 1 ? "that drop" : `those ${drops} drops`}`
      : "MISMATCH — this seed is not the one that was committed to";
    verdict.classList.toggle("bad", !verified);
    this.revealBox.hidden = false;
  }

  setReadout(id: string, value: string) {
    const target = document.getElementById(`r-${id}`);
    if (target) target.textContent = value;
  }
}
