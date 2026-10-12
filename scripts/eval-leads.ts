// npm run eval:leads -- [--deals N | --start 200 --step 100 --cap 1000] [--workers 7] [--seed 1] [--limit N] [--ids a,b] [--out .eval-out/leads.json] [--cache .eval-out/calib-cache.json]
// Default: adaptive sampling (lead-config.json "adaptive"): 200 deals, +100 while the two best options of IMP or MP are within noise, up to the cap.
// --deals N fixes the number of deals instead. --limit N takes N evenly spaced problems from the usable ones.
// Resumable: ids already in both --out and --cache are skipped. Writes the per-problem calibration cache (npm run calibrate reads it).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dataPath } from "./data-pack.mjs";
import { dirname } from "node:path";
import { Worker } from "node:worker_threads";
import type { CalibCache, CalibEntry } from "../src/calib/cache.ts";
import { defaultRulebook } from "../src/lead/analyse.ts";
import { markdown, summarize } from "../src/eval/summary.ts";
import type { EvalOptions, ProblemRecord } from "../src/eval/evaluate.ts";
import type { TestProblem } from "../src/eval/problems.ts";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const adaptive = defaultRulebook().config.adaptive;
const fixed = arg("deals") === undefined ? null : Number(arg("deals"));
const start = Number(arg("start") ?? adaptive.startDeals);
const step = Number(arg("step") ?? adaptive.step);
const cap = Number(arg("cap") ?? adaptive.cap);
const workers = Number(arg("workers") ?? 7);
const seed = Number(arg("seed") ?? 1);
const limit = arg("limit") === undefined ? undefined : Number(arg("limit"));
const ids = arg("ids")?.split(",");
const out = arg("out") ?? ".eval-out/leads.json";
const cachePath = arg("cache") ?? (out === ".eval-out/leads.json" ? ".eval-out/calib-cache.json" : `${out.replace(/\.json$/, "")}.calib-cache.json`);
const summaryPath = `${dirname(out)}/leads-summary.md`;
const sampling = fixed === null ? { start, step, cap, fixed: null } : { start: fixed, step: 0, cap: fixed, fixed };
const label = fixed === null ? `adaptive ${start} +${step} up to ${cap} deals` : `${fixed} deals`;

interface OutFile {
  settings: { deals: number; seed: number; start: number; step: number; cap: number; fixed: number | null };
  records: ProblemRecord[];
}

const all = (JSON.parse(readFileSync(dataPath("lead-test-problems.json"), "utf8")) as { tests: TestProblem[] }).tests.filter((t) => t.usable_as_acceptance_test);
let todo = ids ? all.filter((t) => ids.includes(t.id)) : all;
if (limit !== undefined && limit < todo.length) todo = Array.from({ length: limit }, (_, i) => todo[Math.floor((i * todo.length) / limit)]!);

mkdirSync(dirname(out), { recursive: true });
mkdirSync(dirname(cachePath), { recursive: true });
const file: OutFile = { settings: { deals: sampling.start, seed, ...sampling }, records: [] };
const cache: CalibCache = { version: 1, settings: { start: sampling.start, step: sampling.step, cap: sampling.cap, seed, fixedDeals: fixed, evalSeconds: 0 }, entries: [] };
const same = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => Object.keys(b).every((k) => a[k] === b[k]);
if (existsSync(out)) {
  const prev = JSON.parse(readFileSync(out, "utf8")) as OutFile;
  if (!same(prev.settings as never, file.settings as never)) {
    console.error(`${out} was written with ${JSON.stringify(prev.settings)}; delete it or pass --out`);
    process.exit(1);
  }
  file.records = prev.records;
}
if (existsSync(cachePath)) {
  const prev = JSON.parse(readFileSync(cachePath, "utf8")) as CalibCache;
  if (prev.version !== 1 || !same(prev.settings as never, { ...cache.settings, evalSeconds: prev.settings.evalSeconds } as never)) {
    console.error(`${cachePath} was written with ${JSON.stringify(prev.settings)}; delete it or pass --cache`);
    process.exit(1);
  }
  cache.entries = prev.entries;
  cache.settings.evalSeconds = prev.settings.evalSeconds;
}
const inCache = new Set(cache.entries.map((e) => e.id));
file.records = file.records.filter((r) => inCache.has(r.id));
const done = new Set(file.records.map((r) => r.id));
cache.entries = cache.entries.filter((e) => done.has(e.id));
const queue = todo.filter((t) => !done.has(t.id));
console.log(`${todo.length} problems selected, ${queue.length} to run, ${label}, ${workers} workers`);

const writeAtomic = (path: string, text: string): void => {
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
};
const t0 = Date.now();
const baseSeconds = cache.settings.evalSeconds;
const save = (): void => {
  cache.settings.evalSeconds = Math.round(baseSeconds + (Date.now() - t0) / 1000);
  writeAtomic(out, JSON.stringify(file));
  writeAtomic(cachePath, JSON.stringify(cache));
  const mine = file.records.filter((r) => todo.some((t) => t.id === r.id));
  writeFileSync(summaryPath, markdown(summarize(mine), { deals: label, seed }));
};

const bundle = new URL("../dist-node/eval-worker.mjs", import.meta.url);
const failures: string[] = [];
let finished = 0;
const opts: EvalOptions = fixed === null ? { seed, start, step, cap } : { seed, deals: fixed };

await Promise.all(
  Array.from({ length: Math.min(workers, queue.length) }, async () => {
    const w = new Worker(bundle);
    const next = (): TestProblem | undefined => queue.shift();
    await new Promise<void>((resolve, reject) => {
      const feed = (): void => {
        const t = next();
        if (!t) {
          void w.terminate();
          resolve();
          return;
        }
        w.postMessage({ test: t, opts });
      };
      w.on("message", (m: { ok: true; record: ProblemRecord; calib: CalibEntry } | { ok: false; id: string; error: string }) => {
        if (m.ok) {
          file.records.push(m.record);
          cache.entries.push(m.calib);
        } else failures.push(`${m.id}: ${m.error}`);
        finished++;
        if (finished % 10 === 0) {
          save();
          console.log(`${finished}/${todo.length - done.size} done, ${Math.round((Date.now() - t0) / 1000)}s`);
        }
        feed();
      });
      w.on("error", reject);
      feed();
    });
  }),
);
save();

const mine = file.records.filter((r) => todo.some((t) => t.id === r.id));
const s = summarize(mine);
const f = (r: { pct: number; pass: number; n: number }): string => `${r.pct}% (${r.pass}/${r.n})`;
console.log(`\n${s.total} problems in ${Math.round((Date.now() - t0) / 1000)}s; failures: ${failures.length}`);
for (const sc of ["imp", "mp"] as const) console.log(`${sc.toUpperCase()} top-1: blend ${f(s.overall[sc].blend)}, DD-only ${f(s.overall[sc].dd)}, rules-only ${f(s.overall[sc].rules)}, new ${f(s.overall[sc].new)}`);
console.log(`deals used: mean ${s.meanDeals}, min ${s.minDeals}, max ${s.maxDeals}; ms per problem: mean ${s.ms.mean}, median ${s.ms.median}, p90 ${s.ms.p90}`);
console.log(`summary ${summaryPath}; calibration cache ${cachePath} (npm run calibrate${cachePath === ".eval-out/calib-cache.json" ? "" : ` -- --cache ${cachePath}`})`);
for (const x of failures) console.error("FAILED", x);
process.exit(failures.length > 0 ? 1 : 0);
