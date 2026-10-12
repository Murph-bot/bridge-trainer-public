import { Worker } from "node:worker_threads";
import { DdPool } from "./pool.ts";
import type { WorkerPort } from "./pool.ts";

/** Output of `npm run build:node`. */
export const NODE_WORKER_BUNDLE = new URL("../../dist-node/dd-node-worker.mjs", import.meta.url);

const nodePort = (w: Worker): WorkerPort => ({
  post: (m) => w.postMessage(m),
  onMessage: (cb) => w.on("message", cb),
  onError: (cb) => w.on("error", cb),
  terminate: () => void w.terminate(),
});

/** worker_threads pool running the same worker core as the browser; needs the esbuild bundle. */
export const createNodePool = (size = 4, bundle: URL = NODE_WORKER_BUNDLE): DdPool => new DdPool(() => nodePort(new Worker(bundle)), size);
