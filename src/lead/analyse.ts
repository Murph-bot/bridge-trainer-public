import { inferConstraints, matchCalls } from "../engine/constraints.ts";
import { finalContract, openingLeader } from "../engine/contract.ts";
import { akProofApplies } from "../engine/dealer.ts";
import type { Call, Card, Contract, PlayerConstraints, Seat, SystemFile, Vul } from "../engine/types.ts";
import { assemble } from "../dd/assemble.ts";
import { CHUNK_SIZE } from "../dd/job.ts";
import type { LeadJob, SolvedChunk } from "../dd/job.ts";
import type { ChunkRunner, PoolResult } from "../dd/pool.ts";
import { parseBookTable, parsePartnershipTable } from "../rules/carding.ts";
import type { CardingOptions, CardTables } from "../rules/carding.ts";
import { deriveContext } from "../rules/context.ts";
import { compileRules, evaluateRules } from "../rules/engine.ts";
import type { CompiledRule } from "../rules/engine.ts";
import type { LeadContext, Scoring } from "../rules/types.ts";
import { makeRater, rateLead } from "../scoring/rate.ts";
import type { RateResult } from "../scoring/rate.ts";
import { topTwoUnresolved } from "../scoring/decide.ts";
import type { DecisionInput } from "../scoring/decide.ts";
import { groupOptions } from "../scoring/options.ts";
import { buildDecisionInput, paramsOf, rateNew } from "../scoring/rate-new.ts";
import type { DecisionSource } from "../scoring/rate-new.ts";
import type { DecisionInfo } from "../scoring/rate-new.ts";
import { decidingMetric, tieBreakSet, weightsFor } from "./config.ts";
import type { LeadConfig } from "./config.ts";
import { BASELINE_CONFIG, CARD_CHOICE_RAW, LEAD_CONFIG, LEAD_RULES, PARTNERSHIP_CARDING_RAW, RULE_OVERLAYS } from "./data.ts";
import { buildExplanation } from "./explain.ts";
import type { Explanation } from "./explain.ts";

export interface AnalyseSettings {
  /** Deals to solve; rounded up to whole chunks of 25. Default 250. */
  deals: number;
  seed: number;
  dealTimeoutMs: number;
  /** The user marks the slam auction as disciplined: the dealer then applies the AK-proof filter even without a control bid. */
  disciplined: boolean;
  softPenalty?: number;
  /** Optional carding agreements, off by default (lead-config.json settings.optionalCarding). */
  carding?: Partial<CardingOptions>;
  /** "new" (default): double dummy decides, rules break near-ties. "blend": the phase-5 weighted blend (also used whenever `weights` is set). */
  mode?: "new" | "blend";
  /** Custom blend weights (the UI slider); switches the scorer to the legacy blend. */
  weights?: { dd: number; rules: number };
  /** Start with `adaptive.start` deals (lead-config.json "adaptive" by default) and add `adaptive.step` deals while the two best options are within noise, up to `adaptive.cap` (defaults: lead-config.json "adaptive"). */
  adaptive?: boolean | { start?: number; step?: number; cap?: number };
  /** Defeat-only mode: one cheaper DDS call per deal tells only whether each lead sets the contract; Edef is not available. */
  defeatOnly?: boolean;
  /** Force the AK-proof filter on (slams only) or off; leave undefined to apply it for slams with control bids or when `disciplined`. */
  akProof?: boolean;
}

export const DEFAULT_SETTINGS: AnalyseSettings = { deals: 250, seed: 1, dealTimeoutMs: 10000, disciplined: false };

export interface LeadProblem {
  hand: Card[];
  auction: Call[];
  dealer: Seat;
  vul: Vul;
  scoring: Scoring;
  userCard: Card;
  /** System profile per seat (the partnership's file for the leader's side, the default 2/1 file for the opponents). */
  profiles: Record<Seat, SystemFile>;
  /** Replaces the constraints inferred from the auction (evaluation harness: auctions that could not be read). */
  constraintsOverride?: Record<Seat, PlayerConstraints>;
}

export interface Rulebook {
  config: LeadConfig;
  /** The phase-5 configuration read by the legacy "blend" mode. */
  baseline: LeadConfig;
  rules: CompiledRule[];
  cards: CardTables;
}

/** The bundled data/*.json, parsed and compiled once. */
let bundled: Rulebook | undefined;
export function defaultRulebook(): Rulebook {
  bundled ??= {
    config: LEAD_CONFIG,
    baseline: BASELINE_CONFIG,
    rules: compileRules(LEAD_RULES, RULE_OVERLAYS),
    cards: { partnership: parsePartnershipTable(PARTNERSHIP_CARDING_RAW), book: parseBookTable(CARD_CHOICE_RAW) },
  };
  return bundled;
}

export interface Analysis {
  contract: Contract;
  leader: Seat;
  ctx: LeadContext;
  rate: Rated;
  explanation: Explanation;
  sample: { n: number; tried: number; acceptanceRate: number; relaxations: string[]; timedOut: boolean; seed: number; stage: number; akProof: boolean; chunks: number; adaptive: { start: number; cap: number; extended: boolean; capped: boolean } | null };
  /** Bids and doubles no system rule matched (passes are not counted); they were read naturally. */
  unmatchedCalls: number;
}

export interface Prepared {
  contract: Contract;
  leader: Seat;
  ctx: LeadContext;
  job: LeadJob;
  akProof: boolean;
  unmatchedCalls: number;
}

/** Hand + auction -> contract, context, constraints and the dealing/solving job. Pure. */
export function prepare(p: LeadProblem, s: AnalyseSettings, book: Rulebook = defaultRulebook()): Prepared {
  const contract = finalContract(p.auction, p.dealer);
  if (!contract) throw new Error("auction is passed out: nothing to lead against");
  const leader = openingLeader(contract);
  if (p.hand.length !== 13 || new Set(p.hand).size !== 13) throw new Error("the leader needs 13 distinct cards");
  if (!p.hand.includes(p.userCard)) throw new Error(`lead ${p.userCard} is not in the leader's hand`);
  const inferInput = { auction: p.auction, dealer: p.dealer, leader, profiles: p.profiles, vul: p.vul };
  const matched = matchCalls(inferInput);
  const ctx = deriveContext({ hand: p.hand, auction: p.auction, dealer: p.dealer, vul: p.vul, scoring: p.scoring, disciplined: s.disciplined, matched }, book.config);
  const constraints = p.constraintsOverride ?? inferConstraints(inferInput);
  const ak = s.akProof === undefined ? akProofApplies(p.auction, contract, s.disciplined, matched) : s.akProof && contract.level >= 6;
  const job: LeadJob = {
    seed: s.seed,
    known: { seat: leader, cards: p.hand },
    constraints,
    contract,
    leader,
    mode: s.defeatOnly ? "defeat" : "exact",
    softPenalty: s.softPenalty ?? book.config.settings.softPenalty,
    dealTimeoutMs: s.dealTimeoutMs,
    akProof: ak ? { declarer: contract.declarer, trump: contract.strain } : undefined,
  };
  return { contract, leader, ctx, job, akProof: ak, unmatchedCalls: (["N", "E", "S", "W"] as Seat[]).reduce((n, seat) => n + constraints[seat].unmatched.filter((u) => u.call !== "P").length, 0) };
}

/** Defence tricks per lead and deal; defeat-only mode knows only whether a lead sets the contract. */
export function ddOf(prep: Prepared, solved: PoolResult, hand: Card[]): Record<Card, number>[] {
  return prep.job.mode === "defeat" ? defeatTricks(solved, hand, prep.contract) : solved.dd;
}

/** The scorer's inputs shared by both modes. */
export function rateInput(p: LeadProblem, prep: Prepared, solved: PoolResult, book: Rulebook, config: LeadConfig, carding?: Partial<CardingOptions>) {
  return {
    deals: solved.deals,
    dd: ddOf(prep, solved, p.hand),
    contract: prep.contract,
    vul: p.vul,
    scoring: p.scoring,
    leaderHand: p.hand,
    ctx: prep.ctx,
    config,
    rules: book.rules,
    cards: { ...book.cards, options: { ...config.settings.optionalCarding, ...carding } },
  };
}

/** The legacy blend's config is the phase-5 file; the new scorer's config has the biases the calibration kept. */
export function newConfigFor(book: Rulebook, scoring: Scoring): LeadConfig {
  const off = tieBreakSet(book.config.tieBreak, scoring).biasOff;
  return { ...book.config, biases: book.config.biases.filter((b) => !off.includes(b.id)) };
}

export type Rated = RateResult & { decision?: DecisionInfo };

/**
 * Rates one card on the solved deals; `over` swaps the card, the weights or the mode (the evaluation harness rates every option this way).
 * Custom `weights` select the legacy blend; otherwise `mode` (default "new").
 */
export function rateFor(p: LeadProblem, prep: Prepared, solved: PoolResult, book: Rulebook, over: { userCard?: Card; weights?: { dd: number; rules: number }; carding?: Partial<CardingOptions>; mode?: "new" | "blend" } = {}): Rated {
  const userCard = over.userCard ?? p.userCard;
  const mode = over.weights ? "blend" : (over.mode ?? "new");
  if (mode === "blend") {
    const weights = over.weights ?? weightsFor(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: p.scoring, sacrifice: prep.ctx.features.has("sacrifice") });
    return rateLead({ ...rateInput(p, prep, solved, book, book.baseline, over.carding), userCard, weights: { dd: weights.dd, rules: weights.rules } });
  }
  const config = newConfigFor(book, p.scoring);
  const metric = decidingMetric(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: p.scoring, sacrifice: prep.ctx.features.has("sacrifice") }, prep.job.mode === "defeat");
  const rater = makeRater(rateInput(p, prep, solved, book, config, over.carding));
  return rateNew(rater, userCard, { ctx: prep.ctx, scoring: p.scoring, config: book.config, rules: book.rules, metric, contract: prep.contract, vul: p.vul });
}

/** Rates the lead on the deals solved so far. Pure; also used for the progressive updates. */
export function analyseSolved(p: LeadProblem, s: AnalyseSettings, prep: Prepared, solved: PoolResult, book: Rulebook = defaultRulebook(), plan: AdaptivePlan | null = planFor(book, s.adaptive)): Analysis {
  if (solved.deals.length === 0) throw new Error("no deals could be generated for this auction (constraints are infeasible)");
  const sacrifice = prep.ctx.features.has("sacrifice");
  const blend = s.mode === "blend" || s.weights !== undefined;
  const table = weightsFor(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: p.scoring, sacrifice });
  const w = s.weights ? { ...s.weights, context: "custom", metric: "-" } : blend ? table : { dd: 1, rules: 0, context: "tie-break", metric: decidingMetric(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: p.scoring, sacrifice }, prep.job.mode === "defeat") };
  const rate = rateFor(p, prep, solved, book, { weights: blend ? w : undefined, mode: blend ? "blend" : "new", carding: s.carding });
  const sample = {
    n: solved.deals.length,
    tried: solved.tried,
    acceptanceRate: solved.tried === 0 ? 0 : solved.deals.length / solved.tried,
    relaxations: solved.relaxations,
    timedOut: solved.timedOut,
    seed: s.seed,
    stage: solved.stage,
    akProof: prep.akProof,
    chunks: solved.chunks.length,
    adaptive: plan ? { start: plan.start, cap: plan.cap, extended: solved.deals.length > plan.start, capped: solved.deals.length >= plan.cap && !solved.cancelled } : null,
  };
  return {
    contract: prep.contract,
    leader: prep.leader,
    ctx: prep.ctx,
    rate,
    explanation: buildExplanation(rate, prep.ctx, p.userCard, { ...sample, unmatchedCalls: prep.unmatchedCalls }, w),
    sample,
    unmatchedCalls: prep.unmatchedCalls,
  };
}

/**
 * Defeat-only mode knows just which leads set the contract. A lead that does is scored with exactly the tricks needed
 * to set it, any other with one fewer, so Pdef is exact and the score-based parts use that two-level approximation.
 */
function defeatTricks(solved: PoolResult, hand: Card[], contract: Contract): Record<Card, number>[] {
  const need = 8 - contract.level;
  return solved.beats.map((set) => Object.fromEntries(hand.map((c) => [c, set.includes(c) ? need : need - 1])) as Record<Card, number>);
}

export interface AnalyseOptions {
  settings?: Partial<AnalyseSettings>;
  /** Called after every chunk of 25 deals with the rating on the deals so far. */
  onProgress?: (a: Analysis & { solved: PoolResult }) => void;
  signal?: AbortSignal;
  /** Chunks from an earlier run with the same problem and seed: only the missing chunks are solved ("Refine"). */
  previous?: PoolResult;
  book?: Rulebook;
}

// ---- adaptive sampling ----------------------------------------------------------------------------------------

export interface AdaptivePlan {
  start: number;
  step: number;
  cap: number;
}

export function planFor(book: Rulebook, adaptive: AnalyseSettings["adaptive"]): AdaptivePlan | null {
  if (!adaptive) return null;
  const a = book.config.adaptive;
  const o = typeof adaptive === "object" ? adaptive : {};
  return { start: o.start ?? a.startDeals, step: o.step ?? a.step, cap: o.cap ?? a.cap };
}

/** Everything that determines the tie-break ranking of one problem/scoring: options with their tricks per deal, rule hits, metric, context. */
export function decisionSource(p: LeadProblem, prep: Prepared, solved: PoolResult, book: Rulebook): DecisionSource {
  const dd = ddOf(prep, solved, p.hand);
  const cols = new Map<Card, number[]>(p.hand.map((c) => [c, dd.map((d) => d[c]!)]));
  const options = groupOptions(p.hand, (c) => cols.get(c)!).map((o) => ({ cards: o.cards, rep: o.rep, tricks: cols.get(o.rep)! }));
  const ev = evaluateRules(prep.ctx, book.rules, book.config.settings.evidenceFactor);
  const metric = decidingMetric(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: p.scoring, sacrifice: prep.ctx.features.has("sacrifice") }, prep.job.mode === "defeat");
  return { options, need: 8 - prep.contract.level, metric, ctx: prep.ctx, hits: ev.hits, config: book.config, contract: prep.contract, vul: p.vul };
}

/** Summary statistics of the solved deals for one problem/scoring: the input that the scorer, the adaptive test and the calibration share. */
export const decisionInputFor = (p: LeadProblem, prep: Prepared, solved: PoolResult, book: Rulebook): DecisionInput => buildDecisionInput(decisionSource(p, prep, solved, book));

/** True while the two best options (by the metric) of any listed problem/scoring are within noiseK paired standard errors. */
export function needsMoreDeals(items: readonly { p: LeadProblem; prep: Prepared }[], solved: PoolResult, book: Rulebook): boolean {
  if (solved.deals.length === 0) return false;
  return items.some(({ p, prep }) => topTwoUnresolved(decisionInputFor(p, prep, solved, book), book.config.tieBreak.noiseK, paramsOf(book.config, book.rules, p.scoring).biasOn));
}

export interface SolveOptions {
  /** Fixed number of deals when `plan` is null. */
  deals: number;
  plan: AdaptivePlan | null;
  /** Problems/scorings whose two best options decide whether more deals are needed. */
  items: readonly { p: LeadProblem; prep: Prepared }[];
  book: Rulebook;
  previous?: PoolResult;
  signal?: AbortSignal;
  /** Called after every chunk with the deals solved so far. */
  onProgress?: (partial: PoolResult) => void;
}

/** Deals and solves; with a plan, starts at plan.start and adds plan.step deals while any item's two best options are within noise, up to plan.cap. */
export async function solveAdaptive(prep: Prepared, pool: ChunkRunner, o: SolveOptions): Promise<PoolResult> {
  const { plan } = o;
  let total = Math.ceil((plan ? plan.start : o.deals) / CHUNK_SIZE);
  let prev = o.previous;
  for (;;) {
    const have = prev?.chunks.length ?? 0;
    const before = prev;
    const merge = (fresh: SolvedChunk[], cancelled: boolean): PoolResult => assemble([...(before?.chunks ?? []), ...fresh], total * CHUNK_SIZE, before?.stage, cancelled);
    const job = before ? { ...prep.job, stage: before.stage } : prep.job;
    const result = await pool.run(job, {
      fromChunk: have,
      chunks: Math.max(0, total - have),
      signal: o.signal,
      onProgress: o.onProgress
        ? (pr) => {
            const partial = merge(pr.chunks, false);
            if (partial.deals.length > 0) o.onProgress!(partial);
          }
        : undefined,
    });
    const solved = merge(result.chunks, result.cancelled);
    const capChunks = plan ? Math.floor(plan.cap / CHUNK_SIZE) : 0;
    const more = plan !== null && !solved.cancelled && !solved.timedOut && solved.chunks.length < capChunks && needsMoreDeals(o.items, solved, o.book);
    if (!more) return solved;
    total = Math.min(capChunks, solved.chunks.length + Math.ceil(plan!.step / CHUNK_SIZE));
    prev = solved;
  }
}

/**
 * Orchestrator: hand + auction -> constraints -> dealer (AK-proof filter for slam auctions with control bids or keycard asks) -> DD -> scorer -> explanation.
 * With `settings.adaptive` it starts at `adaptive.start` (default 200) and adds chunks while the two best options are within noise.
 * Pure except for the injected pool.
 */
export async function analyse(p: LeadProblem, pool: ChunkRunner, opts: AnalyseOptions = {}): Promise<Analysis & { solved: PoolResult }> {
  const s: AnalyseSettings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const book = opts.book ?? defaultRulebook();
  const prep = prepare(p, s, book);
  const plan = planFor(book, s.adaptive);
  const solved = await solveAdaptive(prep, pool, {
    deals: s.deals,
    plan,
    items: [{ p, prep }],
    book,
    previous: opts.previous,
    signal: opts.signal,
    onProgress: opts.onProgress ? (partial) => opts.onProgress!({ ...analyseSolved(p, s, prep, partial, book, plan), solved: partial }) : undefined,
  });
  return { ...analyseSolved(p, s, prep, solved, book, plan), solved };
}
