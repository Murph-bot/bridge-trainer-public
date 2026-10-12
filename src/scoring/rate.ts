import type { Card, Contract, Deal, Rank, Vul } from "../engine/types.ts";
import type { LeadConfig } from "../lead/config.ts";
import { partnershipCard } from "../rules/carding.ts";
import type { AgreedCard, CardTables } from "../rules/carding.ts";
import { evaluateRules, sortedRanks } from "../rules/engine.ts";
import type { CompiledRule } from "../rules/engine.ts";
import type { LeadContext, RuleHit, Scoring } from "../rules/types.ts";
import { declarerVulnerable, defenderScore } from "./duplicate.ts";
import { groupOptions } from "./options.ts";
import type { LeadOption } from "./options.ts";

export interface RateInput {
  deals: Deal[];
  /** Defence tricks per legal lead, one record per deal (DDS score of the leader's side). */
  dd: Record<Card, number>[];
  contract: Contract;
  vul: Vul;
  scoring: Scoring;
  userCard: Card;
  leaderHand: Card[];
  ctx: LeadContext;
  weights: { dd: number; rules: number };
  config: LeadConfig;
  rules: CompiledRule[];
  cards: CardTables;
}

export interface TopOption {
  card: Card;
  cards: Card[];
  /** Defeat probability 0..1 after the DD bias corrections. */
  pDef: number;
  eDef: number;
  /** IMPs (IMP scoring) or match-point fraction (MP scoring) lost against the best option. */
  loss: number;
}

export interface OptionRow extends TopOption {
  /** Rules score of the option, 0..1. */
  sR: number;
}

export interface RateResult {
  ratingPct: number;
  sDD: number;
  sR: number;
  /** sR after the card-within-suit penalty. */
  sREffective: number;
  pDefUser: number;
  pDefBest: number;
  eDefUser: number;
  eDefBest: number;
  /** Uncorrected sample statistics of the user's card. */
  pDefUserRaw: number;
  eDefUserRaw: number;
  top: TopOption[];
  /** Every lead option, best first. */
  options: OptionRow[];
  ruleHits: { ruleId: string; source: string }[];
  /** All rule hits of the hand, with weights and cards (for the explanation). */
  allHits: RuleHit[];
  /** The user's card is the best option or within the noise band of it. */
  equalBest: boolean;
  bestCard: Card;
  /** Loss of the user's card against the best option, in IMPs or MP fraction. */
  lossUser: number;
  seLossUser: number;
  biases: { id: string; pdefPoints: number; edefTricks: number }[];
  cardPenalty: { applied: boolean; agreed: AgreedCard | null; agreedCard: Card | null };
  n: number;
}

const impOf = (table: readonly number[], diff: number): number => {
  const a = Math.abs(diff);
  return Math.sign(diff) * table.filter((t) => a >= t).length;
};

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
function seOf(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
}

const HON = "AKQJ";
const ORDER = "AKQJT98765432";

/** Which DD bias corrections (lead-weights.md section 3) apply to leading this card. */
export function biasesFor(card: Card, ctx: LeadContext, cfg: LeadConfig): { id: string; pdefPoints: number; edefTricks: number }[] {
  const suit = card[1]!;
  const ranks = sortedRanks(ctx.hand.filter((c) => c[1] === suit).map((c) => c[0] as Rank));
  const rank = card[0] as Rank;
  // Leading any card of a sequence topped by two touching honours saves a real declarer the same guess.
  const groups: Rank[][] = [];
  for (const r of ranks) {
    const g = groups.at(-1);
    if (g && ORDER.indexOf(g.at(-1)!) + 1 === ORDER.indexOf(r)) g.push(r);
    else groups.push([r]);
  }
  const group = groups.find((g) => g.includes(rank))!;
  const touchingTop = group.length >= 2 && HON.includes(group[0]!) && HON.includes(group[1]!);
  const holds: Record<string, boolean> = {
    "touching-honours-top": touchingTop,
    "unsupported-ace-nt": ctx.contractType === "NT" && rank === "A" && !ranks.includes("K"),
    "short-trump-one-suit": suit === ctx.trump && ranks.length <= 2 && ctx.features.has("one_suit_auction"),
    "singleton-king-ace-on-right": rank === "K" && ranks.length === 1 && (ctx.roles.declarer.includes(suit as never) || ctx.roles.shownAce.includes(suit as never)),
  };
  return cfg.biases.filter((b) => holds[b.when]).map((b) => ({ id: b.id, pdefPoints: b.pdefPoints, edefTricks: b.edefTricks }));
}

export type RaterInput = Omit<RateInput, "userCard" | "weights">;

export interface BiasHit {
  id: string;
  pdefPoints: number;
  edefTricks: number;
}

/** Per-deal statistics of every lead option and the rule evaluation, computed once; `rate` rates any card with any weights (legacy blend). */
export function makeRater(inp: RaterInput) {
  const { dd, contract, scoring, config: cfg, ctx } = inp;
  const N = dd.length;
  if (N === 0) throw new Error("rateLead needs at least one solved deal");
  const need = 8 - contract.level;
  const vulnerable = declarerVulnerable(inp.vul, contract.declarer);
  const madeScore = defenderScore(contract, need - 1, vulnerable);
  const col = (c: Card): number[] => dd.map((d) => {
    const v = d[c];
    if (v === undefined) throw new Error(`dd is missing lead ${c}`);
    return v;
  });
  const cols = new Map<Card, number[]>(inp.leaderHand.map((c) => [c, col(c)]));
  const options = groupOptions(inp.leaderHand, (c) => cols.get(c)!);

  interface Stat {
    pDef: number;
    eDef: number;
    pDefRaw: number;
    eDefRaw: number;
    S: number[];
    biases: BiasHit[];
  }
  const stat = new Map<Card, Stat>();
  for (const [c, tr] of cols) {
    const pDefRaw = mean(tr.map((t) => (t >= need ? 1 : 0)));
    const eDefRaw = mean(tr);
    const biases = biasesFor(c, ctx, cfg);
    const pp = biases.reduce((a, b) => a + b.pdefPoints, 0) / 100;
    const share = pDefRaw > 0 ? Math.min(1, pp / pDefRaw) : 0;
    const S = tr.map((t) => {
      const s = defenderScore(contract, t, vulnerable);
      return t >= need ? s - share * (s - madeScore) : s;
    });
    stat.set(c, { pDefRaw, eDefRaw, pDef: Math.max(0, pDefRaw - pp), eDef: eDefRaw - biases.reduce((a, b) => a + b.edefTricks, 0), S, biases });
  }

  const ownOf = (c: Card): LeadOption => options.find((o) => o.cards.includes(c))!;
  /** Per-deal match-point fraction of a card against the representative of every option other than its own. */
  const mpSeries = (c: Card, own: LeadOption): number[] => {
    const S = stat.get(c)!.S;
    const others = options.filter((o) => o !== own).map((o) => stat.get(o.rep)!.S);
    if (others.length === 0) return S.map(() => 0.5);
    return S.map((s, i) => others.reduce((a, O) => a + (s > O[i]! ? 1 : s === O[i]! ? 0.5 : 0), 0) / others.length);
  };
  const series = new Map<Card, number[]>();
  const seriesOf = (c: Card): number[] => {
    if (!series.has(c)) series.set(c, scoring === "MP" ? mpSeries(c, ownOf(c)) : stat.get(c)!.S);
    return series.get(c)!;
  };
  /** Paired per-deal difference a - b in IMPs (IMP scoring) or MP fraction (MP scoring). */
  const diffs = (a: Card, b: Card): number[] => {
    const A = seriesOf(a);
    const B = seriesOf(b);
    return A.map((x, i) => (scoring === "IMP" ? impOf(cfg.impTable, x - B[i]!) : x - B[i]!));
  };
  const value = (c: Card): number => mean(scoring === "IMP" ? stat.get(c)!.S : seriesOf(c));
  const L = scoring === "IMP" ? cfg.settings.L_IMP : cfg.settings.L_MP;
  const ev = evaluateRules(ctx, inp.rules, cfg.settings.evidenceFactor);
  /** R of an option: the best-scoring card of its group, the exact card is judged by the card-within-suit check. */
  const R = (o: LeadOption): number => Math.max(...o.cards.map((c) => ev.perCard.get(c) ?? 0));
  const rs = options.map(R);
  const [lo, hi] = [Math.min(...rs), Math.max(...rs)];
  const sROf = (o: LeadOption): number => (hi === lo ? 1 : (R(o) - lo) / (hi - lo));

  const rate = (userCard: Card, weights: { dd: number; rules: number }): RateResult => {
    const userOpt = options.find((o) => o.cards.includes(userCard));
    if (!userOpt) throw new Error(`user card ${userCard} is not in the leader's hand`);
    const repOf = (o: LeadOption): Card => (o.cards.includes(userCard) ? userCard : o.rep);
    const optCards = options.map(repOf);
    const bestCard = optCards.reduce((best, c) => {
      const d = value(c) - value(best);
      return d > 1e-12 || (Math.abs(d) <= 1e-12 && stat.get(c)!.pDef > stat.get(best)!.pDef) ? c : best;
    });
    const lossOf = (c: Card): { loss: number; se: number } => {
      const d = diffs(bestCard, c);
      return { loss: Math.max(0, mean(d)), se: seOf(d) };
    };
    const sddOf = (c: Card): { s: number; loss: number; se: number; noise: boolean } => {
      const { loss, se } = lossOf(c);
      const noise = loss <= cfg.settings.noiseSE * se;
      return { s: noise ? 1 : Math.min(1, Math.max(0, 1 - loss / L)), loss, se, noise };
    };
    const user = sddOf(userCard);
    const equalBest = userOpt === ownOf(bestCard) || user.noise;

    const ranked = [...optCards].sort((a, b) => value(b) - value(a) || stat.get(b)!.pDef - stat.get(a)!.pDef);
    const sR = sROf(userOpt);
    const optionRows: OptionRow[] = ranked.map((c) => ({ card: c, cards: ownOf(c).cards, pDef: stat.get(c)!.pDef, eDef: stat.get(c)!.eDef, loss: lossOf(c).loss, sR: sROf(ownOf(c)) }));

    const suit = userCard[1]!;
    const suitRanks = sortedRanks(inp.leaderHand.filter((c) => c[1] === suit).map((c) => c[0] as Rank));
    // Only the partnership's own card table can be "wrong"; a book rule that decides top-vs-low (technical) overrides the table.
    const technical = ev.hits.some((h) => h.kind === "recommend" && h.technical && h.cards.some((c) => c[1] === suit));
    const agreed = technical ? null : partnershipCard(inp.cards.partnership, suitRanks, ctx.contractType, inp.cards.options);
    const agreedCardId = agreed && !agreed.ranks.includes(userCard[0] as Rank) ? ((agreed.ranks[0]! + suit) as Card) : null;
    let penalised = false;
    if (agreedCardId && cols.has(agreedCardId)) {
      const d = diffs(agreedCardId, userCard);
      penalised = Math.abs(mean(d)) <= cfg.settings.noiseSE * seOf(d);
    }
    const sREffective = penalised ? sR * cfg.settings.cardPenalty : sR;
    const ratingPct = Math.round(100 * (weights.dd * user.s + weights.rules * sREffective));

    const us = stat.get(userCard)!;
    const bs = stat.get(bestCard)!;
    return {
      ratingPct,
      sDD: user.s,
      sR,
      sREffective,
      pDefUser: us.pDef,
      pDefBest: bs.pDef,
      eDefUser: us.eDef,
      eDefBest: bs.eDef,
      pDefUserRaw: us.pDefRaw,
      eDefUserRaw: us.eDefRaw,
      top: optionRows.slice(0, 3),
      options: optionRows,
      ruleHits: ev.hits.filter((h) => h.cards.includes(userCard) || (h.suitWide && h.cards.some((c) => c[1] === suit))).map((h) => ({ ruleId: h.ruleId, source: `${h.book} p.${h.page}` })),
      allHits: ev.hits,
      equalBest,
      bestCard,
      lossUser: user.loss,
      seLossUser: user.se,
      biases: us.biases,
      cardPenalty: { applied: penalised, agreed, agreedCard: agreedCardId },
      n: N,
    };
  };

  return {
    options,
    ev,
    n: N,
    need,
    /** Defence tricks of an option's representative card, one per deal. */
    tricks: (o: LeadOption): number[] => cols.get(o.rep)!,
    biasesOf: (c: Card): BiasHit[] => stat.get(c)!.biases,
    rate,
  };
}

export type Rater = ReturnType<typeof makeRater>;

export function rateLead(inp: RateInput): RateResult {
  return makeRater(inp).rate(inp.userCard, inp.weights);
}
