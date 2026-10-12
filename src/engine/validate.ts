import { bidValue } from "./contract.ts";
import type { ConstraintSet, SystemFile } from "./types.ts";
import { SUITS } from "./types.ts";

type Json = unknown;
type Schema = { [k: string]: Json };

const isObj = (x: Json): x is Schema => typeof x === "object" && x !== null && !Array.isArray(x);

function resolveRef(root: Schema, ref: string): Schema {
  let cur: Json = root;
  for (const part of ref.replace(/^#\//, "").split("/")) cur = (cur as Schema)[part];
  return cur as Schema;
}

function jsonType(x: Json): string {
  if (Array.isArray(x)) return "array";
  if (x === null) return "null";
  if (typeof x === "number") return Number.isInteger(x) ? "integer" : "number";
  return typeof x;
}

/** Interprets the JSON Schema keywords used by system.schema.json; returns one message per violation. */
export function validateAgainstSchema(root: Schema, data: Json, schema: Schema = root, path = "$"): string[] {
  if (typeof schema.$ref === "string") return validateAgainstSchema(root, data, resolveRef(root, schema.$ref), path);
  const errs: string[] = [];
  if (schema.enum && !(schema.enum as Json[]).includes(data)) errs.push(`${path}: ${JSON.stringify(data)} not in enum`);
  if (schema.type) {
    const t = jsonType(data);
    if (!(t === schema.type || (schema.type === "number" && t === "integer"))) {
      errs.push(`${path}: expected ${String(schema.type)}, got ${t}`);
      return errs;
    }
  }
  if (typeof data === "string" && typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(data)) errs.push(`${path}: ${JSON.stringify(data)} does not match ${schema.pattern}`);
  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) errs.push(`${path}: ${data} < minimum ${schema.minimum}`);
    if (typeof schema.maximum === "number" && data > schema.maximum) errs.push(`${path}: ${data} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (typeof schema.minItems === "number" && data.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && data.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    const prefix = (schema.prefixItems as Schema[] | undefined) ?? [];
    data.forEach((item, i) => {
      const sub = i < prefix.length ? prefix[i] : (schema.items as Schema | undefined);
      if (sub) errs.push(...validateAgainstSchema(root, item, sub, `${path}[${i}]`));
    });
  }
  if (isObj(data)) {
    for (const k of (schema.required as string[] | undefined) ?? []) if (!(k in data)) errs.push(`${path}: missing required "${k}"`);
    const props = (schema.properties as Schema | undefined) ?? {};
    for (const [k, v] of Object.entries(data)) {
      if (k in props) errs.push(...validateAgainstSchema(root, v, props[k] as Schema, `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected property "${k}"`);
    }
  }
  return errs;
}

function checkConstraintSet(cs: ConstraintSet, where: string, errors: string[]): void {
  if (cs.hcp && cs.hcp[0] > cs.hcp[1]) errors.push(`${where}: hcp min > max`);
  const len = cs.len ?? {};
  for (const s of SUITS) {
    const r = len[s];
    if (r && r[0] > r[1]) errors.push(`${where}: len ${s} min > max`);
  }
  if (SUITS.reduce((a, s) => a + (len[s]?.[0] ?? 0), 0) > 13) errors.push(`${where}: min lengths exceed 13`);
  if (SUITS.reduce((a, s) => a + (len[s]?.[1] ?? 13), 0) < 13) errors.push(`${where}: max lengths below 13`);
  for (const k of ["anyOf", "notAny"] as const) (cs[k] ?? []).forEach((sub, i) => checkConstraintSet(sub, `${where}.${k}[${i}]`, errors));
}

function checkLegal(rule: SystemFile["rules"][number], errors: string[]): void {
  const toks = rule.context.auction;
  if (toks[toks.length - 1] !== "?" || toks.slice(0, -1).includes("?")) {
    errors.push(`${rule.id}: auction must end with a single '?'`);
    return;
  }
  if (toks.slice(1).includes("P*")) errors.push(`${rule.id}: 'P*' only allowed first`);
  const seq = [...toks.slice(0, -1).filter((t) => t !== "P*"), rule.call];
  const n = seq.length;
  let lastBid: string | null = null;
  let lastBidSide = -1;
  let doubled = false;
  let redoubled = false;
  let doubleSide = -1;
  seq.forEach((c, i) => {
    const side = (n - 1 - i) % 2;
    if (c === "P") return;
    if (c === "X") {
      if (lastBid === null || lastBidSide === side || doubled) errors.push(`${rule.id}: illegal X at ${i} in ${seq.join(" ")}`);
      doubled = true;
      doubleSide = side;
    } else if (c === "XX") {
      if (!doubled || redoubled || (lastBidSide !== side && doubleSide !== side)) errors.push(`${rule.id}: illegal XX at ${i} in ${seq.join(" ")}`);
      redoubled = true;
    } else {
      if (lastBid !== null && bidValue(c) <= bidValue(lastBid)) errors.push(`${rule.id}: insufficient bid ${c} after ${lastBid} in ${seq.join(" ")}`);
      lastBid = c;
      lastBidSide = side;
      doubled = false;
      redoubled = false;
      doubleSide = -1;
    }
  });
}

export interface ValidationReport {
  errors: string[];
  contexts: number;
  contextsWithoutPass: number;
}

/** Port of tools/validate.py for one system file: schema, unique ids and contexts, constraint sanity, call legality. */
export function validateSystem(schema: Schema, data: Json): ValidationReport {
  const errors = validateAgainstSchema(schema, data);
  if (!isObj(data) || !Array.isArray(data.rules)) return { errors, contexts: 0, contextsWithoutPass: 0 };
  const rules = (data as unknown as SystemFile).rules;
  const ids = new Map<string, number>();
  const keys = new Map<string, number>();
  for (const r of rules) {
    ids.set(r.id, (ids.get(r.id) ?? 0) + 1);
    const key = JSON.stringify([r.context.auction, r.call, r.context.seats ?? [], r.context.actorPassedHand ?? null]);
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  for (const [id, n] of ids) if (n > 1) errors.push(`duplicate id ${id}`);
  for (const [k, n] of keys) if (n > 1) errors.push(`duplicate context+call ${k}`);
  const ctx = new Map<string, Set<string>>();
  for (const r of rules) {
    checkConstraintSet(r.shows, r.id, errors);
    checkLegal(r, errors);
    const k = r.context.auction.join(" ");
    if (!ctx.has(k)) ctx.set(k, new Set());
    ctx.get(k)!.add(r.call);
  }
  return { errors, contexts: ctx.size, contextsWithoutPass: [...ctx.values()].filter((calls) => !calls.has("P")).length };
}
