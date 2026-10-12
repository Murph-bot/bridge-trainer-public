import { DdPool } from "./pool.ts";
import type { WorkerPort } from "./pool.ts";

const browserPort = (w: Worker): WorkerPort => ({
  post: (m) => w.postMessage(m),
  onMessage: (cb) => w.addEventListener("message", (e) => cb(e.data)),
  onError: (cb) => w.addEventListener("error", (e) => cb(new Error(e.message))),
  terminate: () => w.terminate(),
});

/** Pool of module Web Workers; each runs bridge-dds (wasm) and the dealer. */
export const createBrowserPool = (size = 4): DdPool =>
  new DdPool(() => browserPort(new Worker(new URL("./dd.worker.ts", import.meta.url), { type: "module" })), size);
