import { NO_OPTIONS } from "../rules/carding.ts";
import type { CardingOptions } from "../rules/carding.ts";
import type { Scoring } from "../rules/types.ts";

export interface WeightRow {
  context: string;
  wDD: number;
  wR: number;
  metric: string | { IMP: string; MP: string };
}

export interface BiasRow {
  id: string;
  when: "touching-honours-top" | "unsupported-ace-nt" | "short-trump-one-suit" | "singleton-king-ace-on-right";
  pdefPoints: number;
  edefTricks: number;
}

/** Deciding metric of the phase-6 scheme: P(defeat), mean defence tricks, or (IMP scoring) the expected duplicate score in IMPs against the score-best lead. */
export type Metric = "Pdef" | "Edef" | "IMP";

/** The tie-break weights and DD bias switches of one weight set (joint, or one scoring form). */
export interface TieBreakSet {
  familyWeights: Record<string, number>;
  weights: Record<string, number>;
  dropped: string[];
  biasOff: string[];
}

/** Phase 6 "new" mode: double dummy decides, rules break near-ties (docs/phase6-dd-decides.md). */
export interface TieBreakConfig {
  /** An option is within noise of the DD-best option when its gap is at most noiseK paired standard errors. */
  noiseK: number;
  /** Tie-break weight per rule family (the rule's source.book_key), used for rules without their own weight. */
  familyWeights: Record<string, number>;
  weights: Record<string, number>;
  dropped: string[];
  /** DD bias corrections (B1..B5) switched off by the calibration. */
  biasOff: string[];
  /** Metric difference (P(defeat) fraction, defence tricks, IMPs per board) that takes the rating from 100% to 0%; `doc` explains the values. */
  lossScale: Record<Metric, number> & { doc?: string };
  /**
   * Weights per scoring form (IMP, MP), fitted separately; `fit` says whether the form's own fit won the cross-validation on the odd ids ("separate")
   * or the joint values above are used ("joint"). A form without an entry uses the joint values. noiseK is shared.
   */
  byScoring: Partial<Record<Scoring, TieBreakSet & { fit: "separate" | "joint" }>>;
  fittedAt: string | null;
  fitSplit: unknown;
  metrics: unknown;
}

export interface AdaptiveConfig {
  startDeals: number;
  step: number;
  cap: number;
}

/** For a file without a tieBreak section (the phase-5 baseline). The rating scale has no default: the new scorer needs it from data/lead-config.json. */
export const DEFAULT_TIE_BREAK: TieBreakConfig = { noiseK: 1.5, familyWeights: {}, weights: {}, dropped: [], biasOff: [], lossScale: { Pdef: Number.NaN, Edef: Number.NaN, IMP: Number.NaN }, byScoring: {}, fittedAt: null, fitSplit: null, metrics: null };
export const DEFAULT_ADAPTIVE: AdaptiveConfig = { startDeals: 200, step: 100, cap: 1000 };

export interface LeadConfig {
  /** Absent in the phase-5 baseline file: the defaults apply. */
  tieBreak: TieBreakConfig;
  adaptive: AdaptiveConfig;
  weights: WeightRow[];
  settings: { optionalCarding: CardingOptions; L_IMP: number; L_MP: number; cardPenalty: number; softPenalty: number; noiseSE: number; evidenceFactor: { simulation: number; author_advice: number } };
  impTable: number[];
  handStrength: { weakMaxHcp: number; strongMinHcp: number; fewEntriesMax: number };
  biases: BiasRow[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, path: string): number => {
  if (typeof x !== "number") throw new Error(`lead-config: ${path} must be a number`);
  return x;
};

const BIAS_WHEN = new Set(["touching-honours-top", "unsupported-ace-nt", "short-trump-one-suit", "singleton-king-ace-on-right"]);

const numMap = (x: unknown, path: string): Record<string, number> => {
  if (x === undefined) return {};
  if (!isObj(x)) throw new Error(`lead-config: ${path} must be an object`);
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, num(v, `${path}.${k}`)]));
};
const strList = (x: unknown, path: string): string[] => {
  if (x === undefined) return [];
  if (!Array.isArray(x) || !x.every((v) => typeof v === "string")) throw new Error(`lead-config: ${path} must be a string array`);
  return x as string[];
};

function parseByScoring(raw: unknown): TieBreakConfig["byScoring"] {
  if (raw === undefined) return {};
  if (!isObj(raw)) throw new Error("lead-config: tieBreak.byScoring must be an object");
  const out: TieBreakConfig["byScoring"] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k !== "IMP" && k !== "MP") throw new Error(`lead-config: tieBreak.byScoring.${k} is not a scoring form (IMP, MP)`);
    if (!isObj(v) || (v.fit !== "separate" && v.fit !== "joint")) throw new Error(`lead-config: tieBreak.byScoring.${k}.fit must be "separate" or "joint"`);
    const path = `tieBreak.byScoring.${k}`;
    out[k] = { fit: v.fit, familyWeights: numMap(v.familyWeights, `${path}.familyWeights`), weights: numMap(v.weights, `${path}.weights`), dropped: strList(v.dropped, `${path}.dropped`), biasOff: strList(v.biasOff, `${path}.biasOff`) };
  }
  return out;
}

function parseTieBreak(raw: unknown): TieBreakConfig {
  if (raw === undefined) return DEFAULT_TIE_BREAK;
  if (!isObj(raw)) throw new Error("lead-config: tieBreak must be an object");
  if (!isObj(raw.lossScale)) throw new Error("lead-config: tieBreak.lossScale must be an object with Pdef, Edef and IMP");
  const ls = raw.lossScale;
  return {
    noiseK: num(raw.noiseK, "tieBreak.noiseK"),
    familyWeights: numMap(raw.familyWeights, "tieBreak.familyWeights"),
    weights: numMap(raw.weights, "tieBreak.weights"),
    dropped: strList(raw.dropped, "tieBreak.dropped"),
    biasOff: strList(raw.biasOff, "tieBreak.biasOff"),
    lossScale: { Pdef: num(ls.Pdef, "tieBreak.lossScale.Pdef"), Edef: num(ls.Edef, "tieBreak.lossScale.Edef"), IMP: num(ls.IMP, "tieBreak.lossScale.IMP"), ...(typeof ls.doc === "string" ? { doc: ls.doc } : {}) },
    byScoring: parseByScoring(raw.byScoring),
    fittedAt: typeof raw.fittedAt === "string" ? raw.fittedAt : null,
    fitSplit: raw.fitSplit ?? null,
    metrics: raw.metrics ?? null,
  };
}

function parseAdaptive(raw: unknown): AdaptiveConfig {
  if (raw === undefined) return DEFAULT_ADAPTIVE;
  if (!isObj(raw)) throw new Error("lead-config: adaptive must be an object");
  return { startDeals: num(raw.startDeals, "adaptive.startDeals"), step: num(raw.step, "adaptive.step"), cap: num(raw.cap, "adaptive.cap") };
}

/** Accepts the phase-5 file (no tieBreak/adaptive sections) and the phase-6 file. */
export function parseLeadConfig(raw: unknown): LeadConfig {
  if (!isObj(raw) || !Array.isArray(raw.weights) || !isObj(raw.settings) || !Array.isArray(raw.impTable) || !isObj(raw.handStrength) || !Array.isArray(raw.biases)) {
    throw new Error("lead-config: missing weights, settings, impTable, handStrength or biases");
  }
  const s = raw.settings;
  const ef = s.evidenceFactor;
  if (!isObj(ef)) throw new Error("lead-config: settings.evidenceFactor must be an object");
  const hs = raw.handStrength;
  return {
    tieBreak: parseTieBreak(raw.tieBreak),
    adaptive: parseAdaptive(raw.adaptive),
    weights: raw.weights.map((w: unknown, i) => {
      if (!isObj(w) || typeof w.context !== "string") throw new Error(`lead-config: weights[${i}] needs a context`);
      return { context: w.context, wDD: num(w.wDD, `weights[${i}].wDD`), wR: num(w.wR, `weights[${i}].wR`), metric: w.metric as WeightRow["metric"] };
    }),
    settings: {
      optionalCarding: isObj(s.optionalCarding) ? { reverseAK: s.optionalCarding.reverseAK === true, rusinow: s.optionalCarding.rusinow === true } : NO_OPTIONS,
      L_IMP: num(s.L_IMP, "L_IMP"),
      L_MP: num(s.L_MP, "L_MP"),
      cardPenalty: num(s.cardPenalty, "cardPenalty"),
      softPenalty: num(s.softPenalty, "softPenalty"),
      noiseSE: num(s.noiseSE, "noiseSE"),
      evidenceFactor: { simulation: num(ef.simulation, "evidenceFactor.simulation"), author_advice: num(ef.author_advice, "evidenceFactor.author_advice") },
    },
    impTable: raw.impTable.map((x, i) => num(x, `impTable[${i}]`)),
    handStrength: { weakMaxHcp: num(hs.weakMaxHcp, "weakMaxHcp"), strongMinHcp: num(hs.strongMinHcp, "strongMinHcp"), fewEntriesMax: num(hs.fewEntriesMax, "fewEntriesMax") },
    biases: raw.biases.map((b: unknown, i) => {
      if (!isObj(b) || typeof b.id !== "string" || typeof b.when !== "string" || !BIAS_WHEN.has(b.when)) throw new Error(`lead-config: biases[${i}] has an unknown 'when'`);
      return { id: b.id, when: b.when as BiasRow["when"], pdefPoints: num(b.pdefPoints, `biases[${i}].pdefPoints`), edefTricks: num(b.edefTricks, `biases[${i}].edefTricks`) };
    }),
  };
}

/** Weight row for this context; the doubled sacrifice, then slams, then NT/suit by scoring. */
export function weightsFor(
  cfg: LeadConfig,
  c: { contractType: "NT" | "suit"; levelClass: string; scoring: Scoring; sacrifice: boolean },
): { dd: number; rules: number; context: string; metric: string } {
  const key = c.sacrifice ? "doubled_sacrifice" : c.levelClass === "grand_slam" ? "grand_slam" : c.levelClass === "small_slam" ? "small_slam" : `${c.contractType}_${c.scoring}`;
  const row = cfg.weights.find((w) => w.context === key);
  if (!row) throw new Error(`lead-config: no weights row for ${key}`);
  return { dd: row.wDD, rules: row.wR, context: key, metric: typeof row.metric === "string" ? row.metric : row.metric[c.scoring] };
}

/** The weight set of a scoring form: its own entry in byScoring, else the joint values. */
export function tieBreakSet(tb: TieBreakConfig, scoring: Scoring): TieBreakSet {
  const own = tb.byScoring[scoring];
  if (own) return { familyWeights: own.familyWeights, weights: own.weights, dropped: own.dropped, biasOff: own.biasOff };
  return { familyWeights: tb.familyWeights, weights: tb.weights, dropped: tb.dropped, biasOff: tb.biasOff };
}

/** Rule weight of the tie-break for a scoring form: its own, else its family's; dropped rules count 0. */
export function tieBreakWeight(tb: TieBreakConfig, ruleId: string, family: string, scoring: Scoring): number {
  const set = tieBreakSet(tb, scoring);
  if (set.dropped.includes(ruleId)) return 0;
  return set.weights[ruleId] ?? set.familyWeights[family] ?? 0;
}

/** The phase-5 DD metric of this context (the weights table of the baseline config names it): P(defeat) or mean defence tricks. */
export function metricFor(cfg: LeadConfig, c: { contractType: "NT" | "suit"; levelClass: string; scoring: Scoring; sacrifice: boolean }): Metric {
  return weightsFor(cfg, c).metric === "Edef" ? "Edef" : "Pdef";
}

/**
 * The metric that decides the phase-6 ranking: at IMPs the expected duplicate score in IMPs (every context); at MPs the weights table
 * (mean tricks, P(defeat) in grand slams). Defeat-only mode knows only which leads set the contract, so it always decides by P(defeat).
 */
export function decidingMetric(cfg: LeadConfig, c: { contractType: "NT" | "suit"; levelClass: string; scoring: Scoring; sacrifice: boolean }, defeatOnly = false): Metric {
  if (defeatOnly) return "Pdef";
  return c.scoring === "IMP" ? "IMP" : metricFor(cfg, c);
}
