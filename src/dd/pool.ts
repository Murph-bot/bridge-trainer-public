import type { Card, Deal } from "../engine/types.ts";
import { assemble } from "./assemble.ts";
import { CHUNK_SIZE } from "./job.ts";
import type { LeadJob, SolvedChunk } from "./job.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

/** Transport-neutral worker handle: a browser Worker or a Node worker_thread. */
export interface WorkerPort {
  post(m: ToWorker): void;
  onMessage(cb: (m: FromWorker) => void): void;
  onError(cb: (e: Error) => void): void;
  terminate(): void;
}

export interface PoolProgress {
  chunksDone: number;
  chunksTotal: number;
  deals: number;
  /** Completed chunks so far, in chunk order. */
  chunks: SolvedChunk[];
}

export interface PoolResult {
  chunks: SolvedChunk[];
  deals: Deal[];
  dd: Record<Card, number>[];
  beats: Card[][];
  tried: number;
  stage: number;
  relaxations: string[];
  /** Fewer deals than requested because the dealer budget ran out or the constraints are infeasible. */
  timedOut: boolean;
  cancelled: boolean;
}

export interface RunOptions {
  /** First chunk index; refining continues from the chunks already done. Default 0. */
  fromChunk?: number;
  /** Number of chunks to run. Default 10 (250 deals). */
  chunks?: number;
  onProgress?: (p: PoolProgress) => void;
  signal?: AbortSignal;
}

/** What the orchestrator needs from a pool; DdPool (workers) and InlinePool (same thread) both fit. */
export interface ChunkRunner {
  run(job: LeadJob, opts?: RunOptions): Promise<PoolResult>;
}

type Listener = (worker: number, m: FromWorker) => void;

export class DdPool implements ChunkRunner {
  private workers: WorkerPort[] = [];
  private nextId = 0;
  private listener: Listener | null = null;
  private failure: ((e: Error) => void) | null = null;

  private readonly factory: () => WorkerPort;
  readonly size: number;

  constructor(factory: () => WorkerPort, size = 4) {
    this.factory = factory;
    this.size = size;
  }

  private ensure(): WorkerPort[] {
    while (this.workers.length < this.size) {
      const idx = this.workers.length;
      const w = this.factory();
      w.onMessage((m) => this.listener?.(idx, m));
      w.onError((e) => this.failure?.(e));
      this.workers.push(w);
    }
    return this.workers;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  /**
   * Deals and solves `chunks` chunks of CHUNK_SIZE deals across the pool. Chunk k uses a seed derived from
   * (job.seed, k), so the result is the same for any pool size. The relaxation stage is learned from the first
   * chunk (which is dealt before anything else starts) and pinned for the rest, so chunks are statistically alike.
   */
  run(job: LeadJob, opts: RunOptions = {}): Promise<PoolResult> {
    const from = opts.fromChunk ?? 0;
    const total = opts.chunks ?? 10;
    const size = job.chunkSize ?? CHUNK_SIZE;
    const id = ++this.nextId;
    const workers = this.ensure();
    const queue = Array.from({ length: total }, (_, i) => from + i);
    const done = new Map<number, SolvedChunk>();
    const idle = workers.map((_, i) => i);
    let inflight = 0;
    let pinned = job.stage;
    let stopped = false;
    let probing = pinned === undefined;

    return new Promise<PoolResult>((resolve, reject) => {
      const ordered = (): SolvedChunk[] => [...done.values()].sort((a, b) => a.chunk - b.chunk);
      const finish = (cancelled: boolean): void => {
        this.listener = null;
        this.failure = null;
        resolve(assemble(ordered(), total * size, pinned, cancelled));
      };
      const dispatch = (): void => {
        if (probing && inflight > 0) return;
        while (!stopped && idle.length > 0 && queue.length > 0) {
          const w = idle.shift()!;
          const chunk = queue.shift()!;
          inflight++;
          workers[w]!.post({ type: "run", id, job: { ...job, stage: pinned }, chunk, wantStage: probing });
          if (probing) return;
        }
        if (inflight === 0 && (queue.length === 0 || stopped)) finish(false);
      };
      this.failure = (e) => {
        this.listener = null;
        this.failure = null;
        this.dispose();
        reject(e);
      };
      this.listener = (w, m) => {
        if (m.id !== id) return;
        if (m.type === "error") return this.failure?.(new Error(m.message));
        if (m.type === "stage") {
          pinned = m.stage;
          probing = false;
          if (m.timedOut && m.dealt < size) stopped = true;
          dispatch();
          return;
        }
        inflight--;
        idle.push(w);
        done.set(m.result.chunk, m.result);
        opts.onProgress?.({ chunksDone: done.size, chunksTotal: total, deals: [...done.values()].reduce((n, c) => n + c.deals.length, 0), chunks: ordered() });
        dispatch();
      };
      opts.signal?.addEventListener(
        "abort",
        () => {
          if (this.listener === null) return;
          this.dispose();
          finish(true);
        },
        { once: true },
      );
      if (opts.signal?.aborted) {
        this.dispose();
        return finish(true);
      }
      dispatch();
    });
  }
}
