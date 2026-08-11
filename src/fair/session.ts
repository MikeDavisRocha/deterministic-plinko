import { DEFAULT_ROWS, Rows } from "../sim/config";
import { commitOf, FairSeeds } from "./commitment";
import { SteeredDrop, steerOf } from "./steer";

/**
 * One provably fair session: a Server Seed fixed and published as a hash before
 * the first drop, a Client Seed the player owns, and a Nonce that advances per
 * drop.
 *
 * The Client Seed is readonly because changing it mid-session would quietly
 * change what the published Commitment covers. A player who wants a different
 * one gets a new session, a new Server Seed and a new Commitment — which is the
 * cycle real operators run, and the reason the old seed has to be revealed on
 * the way out.
 *
 * Nothing here generates the Server Seed. It arrives from the caller, so this
 * module stays a pure function of its inputs and the determinism ban that
 * covers src/fair/ stays honest — the one genuinely unpredictable value in the
 * scheme is the operator's to produce, in the UI, once per session.
 */
export class Session {
  /**
   * Published before the first drop. After this the Server Seed cannot change
   * without the player being able to prove it did.
   */
  readonly commit: string;

  /** The Nonce the next drop will use. */
  private n = 0;

  constructor(
    readonly serverSeed: string,
    readonly clientSeed: string,
  ) {
    this.commit = commitOf(serverSeed);
  }

  get nonce(): number {
    return this.n;
  }

  seedsAt(nonce: number): FairSeeds {
    return { serverSeed: this.serverSeed, clientSeed: this.clientSeed, nonce };
  }

  /**
   * The drop at a given Nonce, on a given board. Pure, so replaying one costs
   * nothing and moves nothing — a player can recompute any drop of the session
   * after the fact.
   *
   * The row count is an argument rather than a property of the session, because
   * it is a property of the board and not of the commitment: the same three
   * values decide a 16-step walk and an 8-step one, and a player who switches
   * boards mid-session is still playing the seed they were promised. It is what
   * a third-party verifier asks for alongside the seeds, for the same reason.
   */
  drawAt(nonce: number, rows: Rows = DEFAULT_ROWS): SteeredDrop {
    return steerOf(this.seedsAt(nonce), rows);
  }

  /** The next drop, advancing the Nonce. */
  deal(rows: Rows = DEFAULT_ROWS): SteeredDrop & { readonly nonce: number } {
    const nonce = this.n++;
    return { ...this.drawAt(nonce, rows), nonce };
  }
}
