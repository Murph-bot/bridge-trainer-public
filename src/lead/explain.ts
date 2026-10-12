import type { Card } from "../engine/types.ts";
import type { RateResult } from "../scoring/rate.ts";
import type { DecisionInfo } from "../scoring/rate-new.ts";
import type { LeadContext, RuleHit } from "../rules/types.ts";

/** An i18n key plus its parameters; the UI renders it in Greek or English. */
export interface MsgRef {
  key: string;
  params?: Record<string, string | number>;
}

export interface ExplainRule {
  ruleId: string;
  /** supports: recommends the user's card; against: the user's card is what the rule prefers to avoid; other: recommends something else. */
  relation: "supports" | "against" | "other" | "tip";
  weight: number;
  cards: Card[];
  /** The book's own wording, English as in data/lead-rules.json (not translated). */
  text: string;
  book: string;
  page: number;
  evidence: "simulation" | "author_advice";
}

export interface SampleInfo {
  n: number;
  tried: number;
  acceptanceRate: number;
  relaxations: string[];
  timedOut: boolean;
  seed: number;
  unmatchedCalls: number;
  /** Adaptive sampling: the deals were extended because the two best leads were within noise; capped = still within noise at the cap. */
  adaptive?: { start: number; cap: number; extended: boolean; capped: boolean } | null;
}

export interface Explanation {
  verdict: MsgRef;
  defeat: MsgRef;
  best: MsgRef;
  rules: ExplainRule[];
  cardAdvice: MsgRef | null;
  /** What the ace or king led from an AK holding asks of partner against notrump; null otherwise. */
  signal: MsgRef | null;
  biases: MsgRef[];
  notes: MsgRef[];
  weights: { dd: number; rules: number; context: string; metric: string };
  /** Present for the phase-6 scorer: double dummy decides, rules break near-ties. */
  decision: DecisionInfo | null;
}

const pct = (x: number): number => Math.round(x * 1000) / 10;
const trunc = (x: number): number => Math.round(x * 100) / 100;
export const FEW_DEALS = 200;

export function leadSignal(ctx: LeadContext, userCard: Card): MsgRef | null {
  const suit = userCard[1];
  const hasAK = ["A", "K"].every((r) => ctx.hand.includes((r + suit) as Card));
  if (ctx.contractType !== "NT" || !hasAK) return null;
  if (userCard[0] === "A") return { key: "explain.signal.ntAce" };
  return userCard[0] === "K" ? { key: "explain.signal.ntKing" } : null;
}

export function buildExplanation(
  rate: RateResult & { decision?: DecisionInfo },
  ctx: LeadContext,
  userCard: Card,
  sample: SampleInfo,
  weights: Explanation["weights"],
): Explanation {
  const bestIsUser = rate.top[0]?.cards.includes(userCard) ?? false;
  const d = rate.decision;
  const rulesParam = d?.ruleIds.slice(0, 3).join(", ") ?? "";
  const verdictKey = d
    ? d.userStatus === "top"
      ? d.ruleIds.length > 0 ? "explain.verdict.noiseRule" : "explain.verdict.ddBest"
      : d.userStatus === "noise"
        ? d.ruleIds.length > 0 ? "explain.verdict.noiseBehind" : "explain.verdict.noiseTie"
        : rate.ratingPct >= 50 ? "explain.verdict.close" : "explain.verdict.worse"
    : bestIsUser ? "explain.verdict.best" : rate.equalBest ? "explain.verdict.equalBest" : rate.sDD >= 0.5 ? "explain.verdict.close" : "explain.verdict.worse";
  const bestForVerdict = d && d.userStatus === "top" ? d.ddBest : rate.bestCard;
  const unit = ctx.scoring === "IMP" ? "imp" : "mp";
  const relation = (h: RuleHit): ExplainRule["relation"] =>
    h.kind === "tip" ? "tip" : h.cards.includes(userCard) || (h.suitWide && h.cards.some((c) => c[1] === userCard[1])) ? (h.kind === "recommend" ? "supports" : "against") : "other";
  const rank = { supports: 0, against: 1, tip: 2, other: 3 };
  const rules: ExplainRule[] = rate.allHits
    .map((h) => ({ ruleId: h.ruleId, relation: relation(h), weight: h.weight, cards: h.cards, text: h.text, book: h.book, page: h.page, evidence: h.evidence }))
    .sort((a, b) => rank[a.relation] - rank[b.relation] || Math.abs(b.weight) - Math.abs(a.weight) || a.ruleId.localeCompare(b.ruleId))
    .filter((r, i) => r.relation !== "other" || i < 12);
  const agreed = rate.cardPenalty;
  const notes: MsgRef[] = [];
  if (sample.n < FEW_DEALS) notes.push({ key: "explain.note.fewDeals", params: { n: sample.n, min: FEW_DEALS } });
  if (sample.timedOut) notes.push({ key: "explain.note.timedOut", params: { n: sample.n } });
  if (sample.relaxations.length > 0) notes.push({ key: "explain.note.relaxed", params: { steps: sample.relaxations.join(", ") } });
  if (sample.unmatchedCalls > 0) notes.push({ key: "explain.note.unmatchedCalls", params: { count: sample.unmatchedCalls } });
  if (sample.adaptive?.extended) notes.push({ key: "explain.note.adaptive", params: { n: sample.n, start: sample.adaptive.start } });
  if (sample.adaptive?.capped && d) notes.push({ key: "explain.note.capped", params: { cap: sample.adaptive.cap } });
  notes.push({ key: "explain.note.sample", params: { n: sample.n, acceptancePct: pct(sample.acceptanceRate), seed: sample.seed } });
  return {
    verdict: { key: verdictKey, params: { card: userCard, best: bestForVerdict, rules: rulesParam } },
    defeat: { key: "explain.defeat", params: { card: userCard, pDefPct: pct(rate.pDefUser), eDef: trunc(rate.eDefUser), n: rate.n } },
    best: { key: "explain.best", params: { card: rate.bestCard, pDefPct: pct(rate.pDefBest), eDef: trunc(rate.eDefBest), loss: trunc(rate.lossUser), unit } },
    rules,
    cardAdvice: agreed.applied && agreed.agreedCard ? { key: "explain.card.wrongCard", params: { card: userCard, agreed: agreed.agreedCard, source: agreed.agreed?.source ?? "partnership" } } : null,
    signal: leadSignal(ctx, userCard),
    biases: rate.biases.map((b) => ({ key: `explain.bias.${b.id}`, params: { pdefPoints: b.pdefPoints, edefTricks: b.edefTricks } })),
    notes,
    weights,
    decision: d ?? null,
  };
}

export const EXPLAIN_KEYS = [
  "explain.verdict.best", "explain.verdict.equalBest", "explain.verdict.close", "explain.verdict.worse",
  "explain.verdict.ddBest", "explain.verdict.noiseRule", "explain.verdict.noiseBehind", "explain.verdict.noiseTie",
  "explain.defeat", "explain.best", "explain.card.wrongCard", "explain.signal.ntAce", "explain.signal.ntKing",
  "explain.bias.B1", "explain.bias.B3", "explain.bias.B4", "explain.bias.B5",
  "explain.note.fewDeals", "explain.note.timedOut", "explain.note.relaxed", "explain.note.unmatchedCalls", "explain.note.sample",
  "explain.note.adaptive", "explain.note.capped",
] as const;
