/// <reference lib="webworker" />
import type { ToWorker } from "./protocol.ts";
import { loadSolver } from "./solve.ts";
import { createHandler } from "./worker-core.ts";

const handle = createHandler(loadSolver(), (m) => self.postMessage(m));
self.onmessage = (e: MessageEvent<ToWorker>) => void handle(e.data);
