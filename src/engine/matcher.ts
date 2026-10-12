import type { Rule, RuleVul, SystemFile, Vul } from "./types.ts";

/** `tokens` ends with "?" (the call being made). "P*" is only legal as the first token. */
export function patternMatches(tokens: readonly string[], prefix: readonly string[]): boolean {
  const toks = tokens.slice(0, -1);
  if (toks[0] === "P*") {
    const rest = toks.slice(1);
    const k = prefix.length - rest.length;
    if (k < 0 || prefix.slice(0, k).some((c) => c !== "P")) return false;
    return rest.every((t, i) => prefix[k + i] === t);
  }
  return toks.length === prefix.length && toks.every((t, i) => prefix[i] === t);
}

/** Concrete tokens, +1 without P*, +1 for seats, +1 for actorPassedHand. */
export function specificity(rule: Rule): number {
  const t = rule.context.auction;
  return (
    t.filter((x) => x !== "P*" && x !== "?").length +
    (t[0] === "P*" ? 0 : 1) +
    (rule.context.seats ? 1 : 0) +
    (rule.context.actorPassedHand !== undefined ? 1 : 0)
  );
}

export function vulMatches(ruleVul: RuleVul | undefined, actorVul: boolean, otherVul: boolean): boolean {
  switch (ruleVul) {
    case undefined:
    case "any":
      return true;
    case "none-vul":
      return !actorVul && !otherVul;
    case "both-vul":
      return actorVul && otherVul;
    case "we-vul":
    case "unfavourable":
      return actorVul && !otherVul;
    case "they-vul":
    case "favourable":
      return !actorVul && otherVul;
  }
}

export function sideVulnerable(vul: Vul, seat: "N" | "E" | "S" | "W"): [boolean, boolean] {
  const ns = vul === "NS" || vul === "both";
  const ew = vul === "EW" || vul === "both";
  return seat === "N" || seat === "S" ? [ns, ew] : [ew, ns];
}

export interface CandidateQuery {
  prefix: readonly string[];
  seatNo: number;
  passed: boolean;
  /** [actor's side vulnerable, other side vulnerable]; omitted = rule vul filters ignored. */
  vul?: [boolean, boolean];
}

/**
 * Most specific rule per call (ties: higher priority). The Map keeps first-appearance order of each call,
 * which fixes the order of siblings.
 */
export function candidates(system: SystemFile, q: CandidateQuery): Map<string, Rule> {
  const best = new Map<string, Rule>();
  for (const r of system.rules) {
    const c = r.context;
    if (!patternMatches(c.auction, q.prefix)) continue;
    if (c.seats && !c.seats.includes(q.seatNo)) continue;
    if (c.actorPassedHand !== undefined && c.actorPassedHand !== q.passed) continue;
    if (q.vul && !vulMatches(c.vul, q.vul[0], q.vul[1])) continue;
    const cur = best.get(r.call);
    if (!cur || specificity(r) > specificity(cur) || (specificity(r) === specificity(cur) && r.priority > cur.priority)) best.set(r.call, r);
  }
  return best;
}
