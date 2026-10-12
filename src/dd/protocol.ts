import type { LeadJob, SolvedChunk } from "./job.ts";

export type ToWorker = { type: "run"; id: number; job: LeadJob; chunk: number; wantStage: boolean };

export type FromWorker =
  | { type: "stage"; id: number; stage: number; dealt: number; timedOut: boolean }
  | { type: "chunk"; id: number; result: SolvedChunk }
  | { type: "error"; id: number; message: string };
