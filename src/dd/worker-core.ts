import { dealChunk, solveChunk } from "./job.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";
import type { DdSolver } from "./solve.ts";

/** Shared body of the browser and Node workers: deal a chunk, report its stage, solve it, report it. */
export function createHandler(solver: Promise<DdSolver>, post: (m: FromWorker) => void): (m: ToWorker) => Promise<void> {
  return async (msg) => {
    try {
      const s = await solver;
      const dealt = dealChunk(msg.job, msg.chunk);
      if (msg.wantStage) post({ type: "stage", id: msg.id, stage: dealt.stage, dealt: dealt.deals.length, timedOut: dealt.timedOut });
      post({ type: "chunk", id: msg.id, result: solveChunk(msg.job, dealt, s) });
    } catch (e) {
      post({ type: "error", id: msg.id, message: e instanceof Error ? e.message : String(e) });
    }
  };
}
