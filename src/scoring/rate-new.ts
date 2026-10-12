import type { Card, Contract, Vul } from "../engine/types.ts";
import { declarerVulnerable, defenderScore } from "./duplicate.ts";
import { biasesFor } from "./rate.ts";
import type { OptionRow, RateResult, Rater } from "./rate.ts";
import { tieBreakSet, tieBreakWeight } from "../lead/config.ts";
import type { LeadConfig, Metric } from "../lead/config.ts";
import type { CompiledRule } from "../rules/engine.ts";
import type { LeadContext, RuleHit, Scoring } from "../rules/types.ts";
import { decide, ratings, summarise } from "./decide.ts";
import type { Decision, DecisionInput } from "./decide.ts";

export interface OptionTricks {
  cards: Card[];
  rep: Card;
  /** Defence tricks after leading this option, one per deal. */
  tricks: ArrayLike<number>;
}

/** Cards that a rule hit speaks for: a suit-wide recommendation covers every card of the suit in the leader's hand. */
function credited(h: RuleHit, hand: readonly Card[]): Set<Card> {
  if (h.kind === "recommend" && h.suitWide) {
    const suits = new Set(h.cards.map((c) => c[1]));
    return new Set(hand.filter((c) => suits.has(c[1] as never)));
  }
  return new Set(h.cards);
}

/** Per option and rule id: +1 for each recommending hit, -1 for each avoiding hit that covers one of its cards. Tips and weight-0 (advice-only) hits do not count. */
export function ruleContrib(options: readonly { cards: readonly Card[] }[], hand: readonly Card[], hits: readonly RuleHit[]): Record<string, number>[] {
  const sets = hits.filter((h) => h.kind !== "tip" && h.weight !== 0).map((h) => ({ id: h.ruleId, sign: h.kind === "recommend" ? 1 : -1, cards: credited(h, hand) }));
  return options.map((o) => {
    const out: Record<string, number> = {};
    for (const s of sets) if (o.cards.some((c) => s.cards.has(c))) out[s.id] = (out[s.id] ?? 0) + s.sign;
    return out;
  });
}

export interface DecisionSource {
  options: readonly OptionTricks[];
  need: number;
  metric: Metric;
  ctx: LeadContext;
  hits: readonly RuleHit[];
  config: LeadConfig;
  /** Needed for the IMP metric (duplicate scores). */
  contract: Contract;
  vul: Vul;
}

const impOf = (table: readonly number[], diff: number): number => {
  const a = Math.abs(diff);
  return Math.sign(diff) * table.filter((t) => a >= t).length;
};
const avg = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * IMP metric (the phase-5 `ddScore` logic): the reference is the option with the highest mean duplicate score (ties: higher P(defeat), then the first);
 * option i's series is IMPs(score_i - score_ref) per deal, so its mean is minus the expected IMP loss against the reference and every paired SE is in IMPs.
 * A bias of p points of P(defeat) moves that share of the option's defeating deals to the "contract made" score (as phase 5 did); its amount is the
 * resulting drop of the option's mean, in IMPs.
 */
function impSeries(src: DecisionSource, defeat: number[][]): { series: number[][]; bias: number[][] } {
  const { options, need, contract, config } = src;
  const vulnerable = declarerVulnerable(src.vul, contract.declarer);
  const made = defenderScore(contract, need - 1, vulnerable);
  const scores = options.map((o) => Array.from(o.tricks, (t) => defenderScore(contract, t, vulnerable)));
  const ms = scores.map(avg);
  const pd = defeat.map(avg);
  const ref = ms.reduce((b, m, i) => (m > ms[b]! + 1e-9 || (Math.abs(m - ms[b]!) <= 1e-9 && pd[i]! > pd[b]!) ? i : b), 0);
  const R = scores[ref]!;
  const imps = (S: readonly number[]): number[] => S.map((s, d) => impOf(config.impTable, s - R[d]!));
  const series = scores.map(imps);
  const bias = options.map((o, i) => {
    const on = new Map(biasesFor(o.rep, src.ctx, config).map((b) => [b.id, b]));
    return config.biases.map((b) => {
      if (!on.has(b.id) || pd[i]! === 0) return 0;
      const share = Math.min(1, b.pdefPoints / 100 / pd[i]!);
      const adjusted = scores[i]!.map((s, d) => (defeat[i]![d] ? s - share * (s - made) : s));
      return avg(series[i]!) - avg(imps(adjusted));
    });
  });
  return { series, bias };
}
/** Summary statistics of a problem for one scoring: all that the tie-break scheme needs, and all the calibration caches (series aside). */
export function buildDecisionInput(src: DecisionSource): DecisionInput {
  const { options, need, metric, ctx, config } = src;
  const defeat = options.map((o) => Array.from(o.tricks, (t) => (t >= need ? 1 : 0)));
  const tricks = options.map((o) => Array.from(o.tricks));
  const biasIds = config.biases.map((b) => b.id);
  const contrib = ruleContrib(options, ctx.hand, src.hits);
  if (metric === "IMP") {
    const { series, bias } = impSeries(src, defeat);
    const tb = config.tieBreak.lossScale;
    return { ...summarise(series, defeat), biasIds, bias, contrib, unit: tb.IMP / tb.Pdef };
  }
  const sum = summarise(metric === "Pdef" ? defeat : tricks, metric === "Pdef" ? tricks : defeat);
  const bias = options.map((o) => {
    const on = new Map(biasesFor(o.rep, ctx, config).map((b) => [b.id, b]));
    return config.biases.map((b) => (on.has(b.id) ? (metric === "Pdef" ? b.pdefPoints / 100 : b.edefTricks) : 0));
  });
  return { ...sum, biasIds, bias, contrib };
}

/** Tie-break parameters for a scoring form: the shared noiseK with that form's weight set (lead-config.json tieBreak.byScoring). */
export function paramsOf(config: LeadConfig, rules: readonly CompiledRule[], scoring: Scoring) {
  const tb = config.tieBreak;
  const biasOff = tieBreakSet(tb, scoring).biasOff;
  const family = new Map(rules.map((r) => [r.rule.id, r.rule.source.book_key as string]));
  return { noiseK: tb.noiseK, weightOf: (id: string): number => tieBreakWeight(tb, id, family.get(id) ?? "", scoring), biasOn: (id: string): boolean => !biasOff.includes(id) };
}

export interface DecisionInfo {
  metric: Metric;
  noiseK: number;
  ddBest: Card;
  top: Card;
  /** The user's option: the top of the ranking, within noise of the DD-best, or clearly behind it. */
  userStatus: "top" | "noise" | "outside";
  /** Rules that put `top` above the DD-best option (when they differ), or above the user's option (when the user is within noise but not top); strongest first. */
  ruleIds: string[];
  sigma: number;
  /** DD-best minus the user's option, in metric units (P(defeat) fraction, tricks or IMPs), and the standard error of that gap. */
  gap: number;
  gapSe: number;
}

/** Rule ids whose weighted recommendation favours option `a` over option `b`, strongest first. */
export function favouring(inp: DecisionInput, weightOf: (id: string) => number, a: number, b: number): string[] {
  const ids = new Set([...Object.keys(inp.contrib[a]!), ...Object.keys(inp.contrib[b]!)]);
  return [...ids]
    .map((id) => ({ id, d: weightOf(id) * ((inp.contrib[a]![id] ?? 0) - (inp.contrib[b]![id] ?? 0)) }))
    .filter((x) => x.d > 0)
    .sort((x, y) => y.d - x.d || x.id.localeCompare(y.id))
    .map((x) => x.id);
}

/**
 * The phase-6 rating. The legacy rater supplies the per-option display numbers (bias-corrected P(defeat), tricks, loss, rule support, card agreement);
 * the order, the best lead, the rating and the verdict come from `decide`.
 */
export function rateNew(rater: Rater, userCard: Card, o: { ctx: LeadContext; scoring: Scoring; config: LeadConfig; rules: readonly CompiledRule[]; metric: Metric; contract: Contract; vul: Vul }): RateResult & { decision: DecisionInfo } {
  const legacy = rater.rate(userCard, { dd: 1, rules: 0 });
  const options = rater.options;
  const inp = buildDecisionInput({ options: options.map((x) => ({ cards: x.cards, rep: x.rep, tricks: rater.tricks(x) })), need: rater.need, metric: o.metric, ctx: o.ctx, hits: rater.ev.hits, config: o.config, contract: o.contract, vul: o.vul });
  const params = paramsOf(o.config, o.rules, o.scoring);
  const d: Decision = decide(inp, params);
  const userIdx = options.findIndex((x) => x.cards.includes(userCard));
  const top = d.order[0]!;
  const rate = ratings(d, o.config.tieBreak.lossScale[o.metric]);
  const rowOf = new Map<readonly Card[], OptionRow>(legacy.options.map((r) => [r.cards, r]));
  const rows: OptionRow[] = d.order.map((i) => rowOf.get(options[i]!.cards)!);
  const userRow = rowOf.get(options[userIdx]!.cards)!;
  const repCard = (i: number): Card => rowOf.get(options[i]!.cards)!.card;
  const userStatus = userIdx === top ? "top" : d.noise[userIdx]! ? "noise" : "outside";
  const ruleIds = userStatus === "top" ? (userIdx === d.best ? [] : favouring(inp, params.weightOf, userIdx, d.best)) : userStatus === "noise" ? favouring(inp, params.weightOf, top, userIdx) : [];
  const terms = d.ruleTerm;
  const [lo, hi] = [Math.min(...terms), Math.max(...terms)];
  const L = o.config.tieBreak.lossScale[o.metric];
  const sDD = Math.min(1, Math.max(0, 1 - d.gap[userIdx]! / L));
  return {
    ...legacy,
    ratingPct: rate[userIdx]!,
    sDD,
    sR: hi === lo ? 1 : (terms[userIdx]! - lo) / (hi - lo),
    sREffective: hi === lo ? 1 : (terms[userIdx]! - lo) / (hi - lo),
    pDefBest: rowOf.get(options[top]!.cards)!.pDef,
    eDefBest: rowOf.get(options[top]!.cards)!.eDef,
    pDefUser: userRow.pDef,
    eDefUser: userRow.eDef,
    top: rows.slice(0, 3),
    options: rows,
    equalBest: d.noise[userIdx]!,
    bestCard: repCard(top),
    decision: {
      metric: o.metric,
      noiseK: params.noiseK,
      ddBest: repCard(d.best),
      top: repCard(top),
      userStatus,
      ruleIds,
      sigma: d.sigma,
      gap: d.gap[userIdx]!,
      gapSe: d.gapSe[userIdx]!,
    },
  };
}
