// Optional private book-data pack. If BRIDGE_DATA_DIR (or data/private/) holds lead-rules.json, the files below
// are read from there instead of the public samples in data/. Used by vite, vitest, esbuild and the tsx scripts.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PACK_FILES = ["lead-rules.json", "lead-card-choice.json", "lead-rules-rulings-01.json", "lead-test-problems.json"];

export function packDir() {
  const dir = process.env.BRIDGE_DATA_DIR ? resolve(process.env.BRIDGE_DATA_DIR) : join(ROOT, "data", "private");
  return existsSync(join(dir, "lead-rules.json")) ? dir : null;
}

/** Absolute path of a data file: the pack copy when present, else data/<name> (which may not exist). */
export function dataPath(name) {
  const dir = packDir();
  return dir && PACK_FILES.includes(name) && existsSync(join(dir, name)) ? join(dir, name) : join(ROOT, "data", name);
}

/** If an absolute path is one of the public data/ files the pack replaces, return the pack copy. */
export function redirect(absPath) {
  const name = PACK_FILES.find((f) => resolve(absPath) === join(ROOT, "data", f));
  if (!name) return null;
  const p = dataPath(name);
  return p === join(ROOT, "data", name) ? null : p;
}

/** Vite / Vitest plugin. */
export function dataPackPlugin() {
  return {
    name: "bridge-data-pack",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !PACK_FILES.some((f) => source.endsWith(f))) return null;
      return redirect(resolve(dirname(importer.split("?")[0]), source));
    },
  };
}

/** esbuild plugin. */
export const dataPackEsbuild = {
  name: "bridge-data-pack",
  setup(build) {
    build.onResolve({ filter: /lead-(rules|card-choice|rules-rulings-01|test-problems)\.json$/ }, (args) => {
      const p = redirect(resolve(args.resolveDir, args.path));
      return p ? { path: p } : undefined;
    });
  },
};
