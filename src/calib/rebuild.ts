import type { LeadProblem, Rulebook } from "../lead/analyse.ts";
import { DEFAULT_SETTINGS, prepare } from "../lead/analyse.ts";
import { decidingMetric } from "../lead/config.ts";
import type { Metric } from "../lead/config.ts";
import { evaluateRules } from "../rules/engine.ts";
import type { LeadContext, Scoring } from "../rules/types.ts";
import type { DecisionInput } from "../scoring/decide.ts";
import { buildDecisionInput } from "../scoring/rate-new.ts";
import { acceptCards } from "../eval/modes.ts";
import { PARTNERSHIP_SYSTEM, profilesFor } from "../ui/systems.ts";
import { decodeTricks } from "./cache.ts";
import type { CalibEntry } from "./cache.ts";
import type { Card } from "../engine/types.ts";

export interface RebuiltScoring {
  ctx: LeadContext;
  metric: Metric;
  input: DecisionInput;
  /** accepted[i]: option i holds one of the book's accepted leads. */
  accepted: boolean[];
}

export interface Rebuilt {
  entry: CalibEntry;
  options: { cards: Card[]; rep: Card; tricks: Int8Array }[];
  byScoring: Record<Scoring, RebuiltScoring>;
}

export const problemOf = (e: CalibEntry, scoring: Scoring): LeadProblem => ({
  hand: e.hand,
  auction: e.auction,
  dealer: e.dealer,
  vul: e.vul,
  scoring,
  userCard: e.hand[0]!,
  profiles: profilesFor(e.leader, PARTNERSHIP_SYSTEM),
});

/**
 * Problem inputs from the cache entry: contexts and rule firings are recomputed from hand, auction and contract with the current rulebook (no DD);
 * only the per-deal tricks come from the cache. `cachedRules` reuses the firings stored at evaluation time instead.
 */
export function rebuild(entry: CalibEntry, book: Rulebook, o: { cachedRules?: boolean } = {}): Rebuilt {
  const options = entry.options.map((x) => ({ cards: x.cards, rep: x.rep, tricks: decodeTricks(x.tricks) }));
  const byScoring = {} as Record<Scoring, RebuiltScoring>;
  for (const scoring of ["IMP", "MP"] as const) {
    const p = problemOf(entry, scoring);
    const prep = prepare(p, { ...DEFAULT_SETTINGS, disciplined: entry.disciplined }, book);
    const ev = evaluateRules(prep.ctx, book.rules, book.config.settings.evidenceFactor);
    const metric = decidingMetric(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring, sacrifice: prep.ctx.features.has("sacrifice") });
    const input = buildDecisionInput({ options, need: entry.need, metric, ctx: prep.ctx, hits: ev.hits, config: book.config, contract: entry.contract, vul: entry.vul });
    if (o.cachedRules) {
      const cached = entry.rules[scoring];
      input.contrib = options.map((_, i) => Object.fromEntries(cached.filter((r) => r.contrib[i] !== 0).map((r) => [r.id, r.contrib[i]!])));
    }
    const accept = acceptCards(scoring === "IMP" ? entry.accept.IMP : entry.accept.MP);
    byScoring[scoring] = { ctx: prep.ctx, metric, input, accepted: options.map((x) => x.cards.some((c) => accept.has(c))) };
  }
  return { entry, options, byScoring };
}
