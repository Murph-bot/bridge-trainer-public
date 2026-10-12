import type { SolvedChunk } from "./job.ts";
import type { PoolResult } from "./pool.ts";

export function assemble(chunks: SolvedChunk[], requested: number, pinned: number | undefined, cancelled: boolean): PoolResult {
  const sorted = [...chunks].sort((a, b) => a.chunk - b.chunk);
  const deals = sorted.flatMap((c) => c.deals);
  return {
    chunks: sorted,
    deals,
    dd: sorted.flatMap((c) => c.dd),
    beats: sorted.flatMap((c) => c.beats),
    tried: sorted.reduce((n, c) => n + c.tried, 0),
    stage: pinned ?? sorted[0]?.stage ?? 0,
    relaxations: sorted[0]?.relaxations ?? [],
    timedOut: sorted.some((c) => c.timedOut) || (!cancelled && deals.length < requested),
    cancelled,
  };
}
