import type { SystemFile } from "./types.ts";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function fail(path: string, msg: string): never {
  throw new Error(`system file: ${path} ${msg}`);
}

/** Light runtime check at the JSON boundary; full schema checking lives in validate.ts. */
export function parseSystemFile(raw: unknown): SystemFile {
  if (!isObj(raw)) return fail("$", "must be an object");
  const meta = raw.meta;
  if (!isObj(meta)) return fail("meta", "must be an object");
  const conv = meta.constraintConventions;
  if (!isObj(conv) || typeof conv.hcpSlack !== "number") return fail("meta.constraintConventions.hcpSlack", "must be a number");
  if (typeof meta.name !== "string" || typeof meta.profile !== "string") return fail("meta", "needs name and profile");
  if (!Array.isArray(raw.rules)) return fail("rules", "must be an array");
  raw.rules.forEach((r: unknown, i: number) => {
    const p = `rules[${i}]`;
    if (!isObj(r)) return fail(p, "must be an object");
    if (typeof r.id !== "string") return fail(p, "needs string id");
    const ctx = r.context;
    if (!isObj(ctx) || !Array.isArray(ctx.auction) || !ctx.auction.every((t) => typeof t === "string")) return fail(`${p}(${r.id}).context.auction`, "must be a string array");
    if (typeof r.call !== "string") return fail(`${p}(${r.id}).call`, "must be a string");
    if (!isObj(r.shows)) return fail(`${p}(${r.id}).shows`, "must be an object");
    if (typeof r.priority !== "number" || typeof r.inferable !== "boolean") return fail(`${p}(${r.id})`, "needs numeric priority and boolean inferable");
  });
  return raw as unknown as SystemFile;
}
