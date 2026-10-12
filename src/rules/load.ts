import { parseMachine } from "./machine.ts";
import type { RuleOverlay } from "./machine.ts";
import type { LeadRule } from "./types.ts";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Boundary check of lead-rules.json (full validation is lead-rules.schema.json's job). */
export function parseLeadRules(raw: unknown): LeadRule[] {
  if (!Array.isArray(raw)) throw new Error("lead-rules: must be an array");
  raw.forEach((r: unknown, i) => {
    if (!isObj(r) || typeof r.id !== "string") throw new Error(`lead-rules[${i}]: needs an id`);
    const where = `lead-rules[${r.id}]`;
    const cond = r.conditions;
    if (!isObj(cond) || !isObj(cond.auction) || !Array.isArray(cond.auction.features) || !isObj(cond.holding) || !Array.isArray(cond.holding.patterns)) throw new Error(`${where}: bad conditions`);
    if (!isObj(r.recommendation) || typeof r.recommendation.card !== "string" || typeof r.recommendation.text !== "string") throw new Error(`${where}: bad recommendation`);
    if (!Array.isArray(r.preference_over) || typeof r.weight !== "number") throw new Error(`${where}: needs preference_over and weight`);
    if (!isObj(r.evidence) || (r.evidence.type !== "simulation" && r.evidence.type !== "author_advice")) throw new Error(`${where}: bad evidence.type`);
    if (!isObj(r.source) || typeof r.source.page !== "number") throw new Error(`${where}: bad source`);
  });
  return raw as unknown as LeadRule[];
}

/** Boundary check of lead-rules-rulings-01.json: overlays by rule id. */
export function parseRuleOverlays(raw: unknown, rules: readonly LeadRule[]): Record<string, RuleOverlay> {
  if (!isObj(raw) || !isObj(raw.rules)) throw new Error("rule overlays: missing rules");
  const ids = new Set(rules.map((r) => r.id));
  const out: Record<string, RuleOverlay> = {};
  for (const [id, o] of Object.entries(raw.rules)) {
    if (!ids.has(id)) throw new Error(`rule overlays: unknown rule ${id}`);
    if (!isObj(o)) throw new Error(`rule overlays[${id}]: must be an object`);
    const perScoring = (x: unknown, type: "string" | "number"): boolean => typeof x === type || (isObj(x) && typeof x.IMP === type && typeof x.MP === type);
    if (o.card !== undefined && !perScoring(o.card, "string")) throw new Error(`rule overlays[${id}]: bad card`);
    if (o.weight !== undefined && !perScoring(o.weight, "number")) throw new Error(`rule overlays[${id}]: bad weight`);
    out[id] = { machine: o.machine === undefined ? undefined : parseMachine(o.machine, `rule overlays[${id}]`), card: o.card as RuleOverlay["card"], weight: o.weight as RuleOverlay["weight"], technical: o.technical === true };
  }
  return out;
}
