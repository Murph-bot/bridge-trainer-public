// npm run calibrate -- [--cache .eval-out/calib-cache.json] [--cached-rules] [--no-legacy] [--no-write] [--report .eval-out/calibration-report.md]
// Fits noiseK and the rule tie-break weights from the cached DD vectors (no simulation), on the odd problem ids; reports the even ids.
// Rule firings are recomputed from data/lead-rules.json (rerun after a new lead-rules.json). Writes data/lead-config.json "tieBreak".
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CalibCache } from "../src/calib/cache.ts";
import { runCalibration } from "../src/calib/calibrate.ts";
import { compactJson } from "../src/calib/json.ts";
import { defaultRulebook } from "../src/lead/analyse.ts";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const cachePath = arg("cache") ?? ".eval-out/calib-cache.json";
const reportPath = arg("report") ?? `${dirname(cachePath)}/calibration-report.md`;
const configPath = new URL("../data/lead-config.json", import.meta.url);
if (!existsSync(cachePath)) {
  console.error(`${cachePath} not found: run npm run eval:leads first (it writes the calibration cache)`);
  process.exit(2);
}
const cache = JSON.parse(readFileSync(cachePath, "utf8")) as CalibCache;
if (cache.version !== 1) throw new Error(`unsupported cache version ${cache.version}`);
const result = runCalibration(cache, defaultRulebook(), { cachedRules: argv.includes("--cached-rules"), legacy: !argv.includes("--no-legacy") });
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, result.report);
console.log(result.report);
if (argv.includes("--no-write")) console.log("--no-write: data/lead-config.json left unchanged");
else {
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  raw.tieBreak = { doc: (raw.tieBreak as { doc?: string } | undefined)?.doc, ...result.tieBreak };
  writeFileSync(configPath, `${compactJson(raw)}\n`);
  console.log(`wrote tieBreak to data/lead-config.json; report ${reportPath}`);
}
