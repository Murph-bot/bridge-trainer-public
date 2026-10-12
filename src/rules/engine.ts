import type { Card, Suit } from "../engine/types.ts";
import { FEATURE_NAMES } from "./features.ts";
import { forScoring, runMachine } from "./machine.ts";
import type { Machine, RuleOverlay } from "./machine.ts";
import type { CardKind } from "./patterns.ts";
import { parseCardSelector, parseDescriptor, parseHolding, pickCards, sortedRanks, suitRole, suitViews } from "./patterns.ts";
import type { Descriptor, HoldingMatcher, SuitPred } from "./patterns.ts";
import type { LeadContext, LeadRule, PerScoring, RuleHit } from "./types.ts";

export { sortedRanks, suitViews };

/** "tip": a machine-readable rule that only shows advice in the UI and never scores. */
export type RuleStatus = "full" | "partial" | "skipped" | "tip";

export interface CompiledRule {
  rule: LeadRule;
  status: RuleStatus;
  reasons: string[];
  role: SuitPred | null;
  holdings: HoldingMatcher[];
  prefs: Descriptor[];
  machine: Machine | null;
  card: PerScoring<string>;
  weight: PerScoring<number>;
  technical: boolean;
}

const KNOWN_FEATURES = new Set<string>(FEATURE_NAMES);

/** Static analysis of one rule: which of its strings the engine understands. */
export function compileRule(rule: LeadRule, overlay: RuleOverlay = {}): CompiledRule {
  const reasons: string[] = [];
  const hard: string[] = [];
  const c = rule.conditions;
  for (const f of c.auction.features) if (!KNOWN_FEATURES.has(f)) hard.push(`unknown feature "${f}"`);
  const machine = overlay.machine ?? null;
  const role = suitRole(c.holding.suit_role);
  if (!role && !machine) hard.push(`unknown suit_role "${c.holding.suit_role}"`);
  const holdings: HoldingMatcher[] = [];
  const unparsed: string[] = [];
  for (const p of machine ? [] : c.holding.patterns) {
    const h = parseHolding(p);
    if (h) holdings.push(h);
    else unparsed.push(p);
  }
  // The patterns are alternatives: unread ones only narrow the rule, unless none can be read.
  if (holdings.length === 0) hard.push(...unparsed.map((p) => `unparsed pattern "${p}"`));
  else reasons.push(...unparsed.map((p) => `alternative pattern "${p}" ignored`));
  const card = overlay.card ?? rule.recommendation.card;
  for (const s of ["IMP", "MP"] as const) {
    const text = forScoring(card, s);
    if (!parseCardSelector(text, s).resolved) reasons.push(`card "${text}" read as any card of the suit`);
  }
  const prefs: Descriptor[] = [];
  for (const p of machine && (machine.avoid || machine.negative || machine.kind === "tip") ? [] : rule.preference_over) {
    const d = parseDescriptor(p);
    if (d) prefs.push(d);
    else reasons.push(`preference_over "${p}" ignored`);
  }
  const status: RuleStatus = hard.length > 0 ? "skipped" : machine?.kind === "tip" ? "tip" : reasons.length > 0 ? "partial" : "full";
  return { rule, status, reasons: [...hard, ...[...new Set(reasons)]], role, holdings, prefs, machine, card, weight: overlay.weight ?? rule.weight, technical: overlay.technical === true };
}

export const compileRules = (rules: readonly LeadRule[], overlays: Readonly<Record<string, RuleOverlay>> = {}): CompiledRule[] => rules.map((r) => compileRule(r, overlays[r.id]));

export interface CoverageReport {
  total: number;
  /** Every string of the rule is understood. */
  full: number;
  /** Machine-readable but advice only (weight 0). */
  tip: number;
  /** Applied, but a card description or a preference_over entry was ignored. */
  partial: number;
  /** Not applied: an unknown feature or an unparsed holding pattern. */
  skipped: number;
  byReason: Record<string, number>;
  rules: { id: string; status: RuleStatus; reasons: string[] }[];
}

export function coverage(compiled: readonly CompiledRule[]): CoverageReport {
  const byReason: Record<string, number> = {};
  for (const r of compiled) for (const reason of r.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
  const count = (s: RuleStatus): number => compiled.filter((r) => r.status === s).length;
  return {
    total: compiled.length,
    full: count("full"),
    tip: count("tip"),
    partial: count("partial"),
    skipped: count("skipped"),
    byReason,
    rules: compiled.map((r) => ({ id: r.rule.id, status: r.status, reasons: r.reasons })),
  };
}

const stripX = (code: string): string => code.replace(/X+$/, "");

function conditionsHold(r: LeadRule, ctx: LeadContext): boolean {
  const c = r.conditions;
  if (r.contract_type !== ctx.contractType) return false;
  if (c.level !== "any" && c.level !== ctx.levelClass) return false;
  if (c.contracts && !c.contracts.some((k) => stripX(k) === stripX(ctx.contractCode) && (k.endsWith("X") ? ctx.contract.doubled !== "" : true))) return false;
  if (!c.auction.features.every((f) => f === "few_entries" || ctx.features.has(f))) return false;
  if (c.hand_strength !== "any" && c.hand_strength !== ctx.handStrength) return false;
  if (c.scoring !== "both" && (c.scoring === "IMPs" ? "IMP" : "MP") !== ctx.scoring) return false;
  return true;
}

export interface RuleEvaluation {
  /** R(c): sum of sign * weight * evidence factor, per card of the leader's hand. */
  perCard: Map<Card, number>;
  hits: RuleHit[];
}

export function evaluateRules(ctx: LeadContext, compiled: readonly CompiledRule[], evidenceFactor: { simulation: number; author_advice: number }): RuleEvaluation {
  const views = suitViews(ctx.hand).map((v) => ({ suit: v.suit as Suit, ranks: sortedRanks(v.ranks) }));
  const perCard = new Map<Card, number>(ctx.hand.map((c) => [c, 0]));
  const hits: RuleHit[] = [];
  const cardsOf = (suits: Iterable<Suit>, kinds: readonly CardKind[]): Set<Card> => {
    const out = new Set<Card>();
    const want = new Set(suits);
    for (const v of views) if (want.has(v.suit)) for (const k of kinds) for (const card of pickCards(k, v)) out.add(card);
    return out;
  };
  for (const cr of compiled) {
    if (cr.status === "skipped" || !conditionsHold(cr.rule, ctx)) continue;
    const { rule, machine } = cr;
    const base = { ruleId: rule.id, text: rule.recommendation.text, book: rule.source.book, bookKey: rule.source.book_key, page: rule.source.page, evidence: rule.evidence.type, technical: cr.technical };
    const w = forScoring(cr.weight, ctx.scoring) * evidenceFactor[rule.evidence.type];
    if (machine?.kind === "tip") {
      hits.push({ ...base, kind: "tip", weight: 0, cards: [], suitWide: false });
      continue;
    }
    const sel = parseCardSelector(forScoring(cr.card, ctx.scoring), ctx.scoring);
    const fewOnly = rule.conditions.auction.features.includes("few_entries");
    const usable = views.filter((v) => !fewOnly || ctx.fewEntries[v.suit]);
    let rec = new Set<Card>();
    const avoid = new Set<Card>();
    if (machine) {
      const res = runMachine(machine, ctx);
      const matched = res.matched.filter((s) => usable.some((v) => v.suit === s));
      if (matched.length === 0) continue;
      if (machine.negative) for (const c of cardsOf(matched, ["any"])) avoid.add(c);
      else rec = cardsOf(matched, sel.kinds);
      if (machine.avoid) for (const c of cardsOf(machine.avoid.target === "matched" ? matched : res.others, forScoring(machine.avoid.kinds, ctx.scoring))) if (!rec.has(c)) avoid.add(c);
    } else {
      for (const v of usable) if (cr.role!(v, ctx) && cr.holdings.some((h) => h.matches(v, ctx))) for (const k of sel.kinds) for (const card of pickCards(k, v)) rec.add(card);
    }
    if (rec.size === 0 && avoid.size === 0) continue;
    if (rec.size > 0) {
      for (const d of cr.prefs) {
        if (d.only !== null && d.only !== ctx.scoring) continue;
        for (const v of views) if (d.suit(v, ctx)) for (const k of d.kinds) for (const card of pickCards(k, v)) if (!rec.has(card)) avoid.add(card);
      }
      // A rule that sets a card of the recommended suit against another card of it decides top-vs-low itself (technical):
      // it is judged card by card and overrides the carding agreement. Any other rule recommends the suit.
      const recSuits = new Set([...rec].map((c) => c[1]));
      const technical = cr.technical || [...avoid].some((c) => recSuits.has(c[1]));
      const credited = technical ? rec : new Set(ctx.hand.filter((c) => recSuits.has(c[1])));
      hits.push({ ...base, kind: "recommend", weight: w, cards: [...rec], suitWide: !technical, technical });
      for (const c of credited) perCard.set(c, perCard.get(c)! + w);
    }
    if (avoid.size > 0) {
      hits.push({ ...base, kind: "avoid", weight: -w, cards: [...avoid], suitWide: false, technical: base.technical });
      for (const c of avoid) perCard.set(c, perCard.get(c)! - w);
    }
  }
  return { perCard, hits };
}
