import { deal as dealDeals } from "../engine/dealer.ts";
import type { Card, Contract, Deal, PlayerConstraints, Seat, Strain } from "../engine/types.ts";
import type { DdSolver } from "./solve.ts";

export const CHUNK_SIZE = 25;

/** Everything a worker needs to deal and solve; plain data, structured-clone safe. */
export interface LeadJob {
  seed: number;
  known: { seat: Seat; cards: Card[] };
  constraints: Record<Seat, PlayerConstraints>;
  contract: Contract;
  leader: Seat;
  mode: "exact" | "defeat";
  chunkSize?: number;
  softPenalty?: number;
  dealTimeoutMs?: number;
  akProof?: { declarer: Seat; trump: Strain };
  /** Relaxation stage pinned for every chunk; the pool learns it from chunk 0. */
  stage?: number;
}

export interface DealtChunk {
  chunk: number;
  deals: Deal[];
  tried: number;
  stage: number;
  relaxations: string[];
  timedOut: boolean;
  dealMs: number;
}

export interface SolvedChunk extends DealtChunk {
  /** Exact mode: defence tricks per lead, one record per deal. */
  dd: Record<Card, number>[];
  /** Defeat mode: the leads that beat the contract, one list per deal. */
  beats: Card[][];
  solveMs: number;
}

/** Deal i of chunk k depends only on (seed, k), so results do not depend on the number of workers. */
export function chunkSeed(seed: number, chunk: number): number {
  let z = (seed >>> 0) ^ Math.imul(chunk + 1, 0x9e3779b1);
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export function dealChunk(job: LeadJob, chunk: number): DealtChunk {
  const size = job.chunkSize ?? CHUNK_SIZE;
  const r = dealDeals({
    known: job.known,
    constraints: job.constraints,
    target: size,
    minDeals: size,
    max: Number.MAX_SAFE_INTEGER,
    timeoutMs: job.dealTimeoutMs ?? 10000,
    seed: chunkSeed(job.seed, chunk),
    softPenalty: job.softPenalty,
    akProof: job.akProof,
    stage: job.stage,
  });
  return { chunk, deals: r.deals, tried: r.tried, stage: r.stage, relaxations: r.relaxations, timedOut: r.timedOut, dealMs: r.elapsedMs };
}

export function solveChunk(job: LeadJob, dealt: DealtChunk, solver: DdSolver): SolvedChunk {
  const t0 = performance.now();
  const dd: Record<Card, number>[] = [];
  const beats: Card[][] = [];
  for (const d of dealt.deals) {
    if (job.mode === "exact") dd.push(solver.solveLeads(d, job.contract, job.leader));
    else beats.push([...solver.solveDefeat(d, job.contract, job.leader)]);
  }
  return { ...dealt, dd, beats, solveMs: performance.now() - t0 };
}
