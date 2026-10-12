# src/dd: double-dummy solving

- `solve.ts`: `solveLeads` (exact, `SolveBoardPBN(target=-1, solutions=3, mode=0)`, `equals` bit r = rank r expanded) and `solveDefeat`
  (target = tricks to set, solutions=2). Scores are tricks for the **leader's side** (defence); declarer takes `13 - score`.
- `job.ts`: a job is dealt and solved in chunks of 25 deals. Chunk k uses seed `chunkSeed(seed, k)`, so the result does not depend on the
  number of workers; "Refine" continues from the next chunk with the same seed and the pinned relaxation stage.
- `pool.ts`: transport-neutral pool (progress per chunk, `AbortSignal` cancel, error -> reject). `browser-pool.ts` = module Web Workers
  (`dd.worker.ts`), pool size 4. `node-pool.ts` = `worker_threads` running `dist-node/dd-node-worker.mjs`. `inline-pool.ts` = same thread.
- The worker deals (engine dealer, AK-proof filter included) and solves, so generation and solving overlap across workers.

## Node and `bridge-dds`

`bridge-dds` 1.4.0 imports `./lib/dds` without an extension, which plain Node ESM rejects. Two workarounds, both in the repo:

1. vitest: `vitest.config.ts` sets `server.deps.inline: ["bridge-dds"]`, so Vite resolves the import (in-process tests, `InlinePool`).
2. Node worker threads: `npm run build:node` bundles `src/dd/node-worker.ts` with esbuild into `dist-node/dd-node-worker.mjs` (git-ignored).
   The vitest global setup runs it before the tests; run it by hand before using `createNodePool` elsewhere.
