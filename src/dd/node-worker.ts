import { parentPort } from "node:worker_threads";
import type { ToWorker } from "./protocol.ts";
import { loadSolver } from "./solve.ts";
import { createHandler } from "./worker-core.ts";

const port = parentPort!;
const handle = createHandler(loadSolver(), (m) => port.postMessage(m));
port.on("message", (m: ToWorker) => void handle(m));
