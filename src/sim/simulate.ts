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
