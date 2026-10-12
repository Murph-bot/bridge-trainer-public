import { CHUNK_SIZE, dealChunk, solveChunk } from "./job.ts";
import type { LeadJob, SolvedChunk } from "./job.ts";
import { assemble } from "./assemble.ts";
import type { ChunkRunner, PoolResult, RunOptions } from "./pool.ts";
import type { DdSolver } from "./solve.ts";

/** Same chunking and seeds as the worker pools, run sequentially on the calling thread (tests, tiny jobs). */
export class InlinePool implements ChunkRunner {
  private readonly solver: DdSolver;

  constructor(solver: DdSolver) {
    this.solver = solver;
  }

  run(job: LeadJob, opts: RunOptions = {}): Promise<PoolResult> {
    const from = opts.fromChunk ?? 0;
    const total = opts.chunks ?? 10;
    const done: SolvedChunk[] = [];
    let pinned = job.stage;
    for (let k = from; k < from + total; k++) {
      if (opts.signal?.aborted) return Promise.resolve(assemble(done, total * (job.chunkSize ?? CHUNK_SIZE), pinned, true));
      const dealt = dealChunk({ ...job, stage: pinned }, k);
      pinned ??= dealt.stage;
      done.push(solveChunk(job, dealt, this.solver));
      opts.onProgress?.({ chunksDone: done.length, chunksTotal: total, deals: done.reduce((n, c) => n + c.deals.length, 0), chunks: [...done] });
      if (dealt.timedOut && dealt.deals.length < (job.chunkSize ?? CHUNK_SIZE)) break;
    }
    return Promise.resolve(assemble(done, total * (job.chunkSize ?? CHUNK_SIZE), pinned, false));
  }
}
