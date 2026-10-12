import { parentPort } from "node:worker_threads";
import { InlinePool } from "../src/dd/inline-pool.ts";
import { loadSolver } from "../src/dd/solve.ts";
import { evaluateProblem } from "../src/eval/evaluate.ts";
import type { EvalOptions } from "../src/eval/evaluate.ts";
import type { TestProblem } from "../src/eval/problems.ts";

const port = parentPort!;
const pool = loadSolver().then((s) => new InlinePool(s));

port.on("message", async (m: { test: TestProblem; opts: EvalOptions }) => {
  try {
    port.postMessage({ ok: true, ...(await evaluateProblem(m.test, await pool, m.opts)) });
  } catch (e) {
    port.postMessage({ ok: false, id: m.test.id, error: e instanceof Error ? e.message : String(e) });
  }
});
