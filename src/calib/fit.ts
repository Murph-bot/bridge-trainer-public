import { decide } from "../scoring/decide.ts";
import type { DecisionInput, DecisionParams } from "../scoring/decide.ts";

/** One problem under one scoring: the cached statistics and which options hold an accepted lead. */
export interface Item {
  problem: string;
  scoring: "IMP" | "MP";
  input: DecisionInput;
  accepted: boolean[];
}

export interface Params {
  noiseK: number;
  /** Tie-break weight per rule family (source.book_key). */
  family: Record<string, number>;
  /** Own weight of individually refined rules. */
  weights: Record<string, number>;
  dropped: Set<string>;
  biasOff: Set<string>;
}

export const K_GRID = [0, 0.5, 1, 1.5, 2, 2.5, 3];
export const W_GRID = [0, 0.25, 0.5, 1, 2, 4];
/** A rule gets its own weight only when it fires on at least this many fitting problems. */
export const MIN_FIRE = 8;
export const FOLDS = 5;
/** Parsimony: a weight must buy more than this many problems per unit of weight to be kept (ties go to the smaller weight). */
const PENALTY = 1e-3;

export const familyOf = (families: ReadonlyMap<string, string>, id: string): string => families.get(id) ?? "";

export function paramsFor(p: Params, families: ReadonlyMap<string, string>): DecisionParams {
  return {
    noiseK: p.noiseK,
    weightOf: (id) => (p.dropped.has(id) ? 0 : (p.weights[id] ?? p.family[familyOf(families, id)] ?? 0)),
    biasOn: (id) => !p.biasOff.has(id),
  };
}

export const cloneParams = (p: Params): Params => ({ noiseK: p.noiseK, family: { ...p.family }, weights: { ...p.weights }, dropped: new Set(p.dropped), biasOff: new Set(p.biasOff) });

export function isCorrect(it: Item, dp: DecisionParams): boolean {
  return it.accepted[decide(it.input, dp).order[0]!]!;
}

export const countCorrect = (items: readonly Item[], p: Params, families: ReadonlyMap<string, string>): number => {
  const dp = paramsFor(p, families);
  return items.reduce((n, it) => n + (isCorrect(it, dp) ? 1 : 0), 0);
};

const ruleIdsOf = (it: Item): Set<string> => new Set(it.input.contrib.flatMap((c) => Object.keys(c)));

/** Problems (items) in which each rule recommends or avoids something. */
export function indexRules(items: readonly Item[]): Map<string, number[]> {
  const by = new Map<string, number[]>();
  items.forEach((it, i) => {
    for (const id of ruleIdsOf(it)) by.set(id, [...(by.get(id) ?? []), i]);
  });
  return by;
}

/** Number of distinct problems each rule fires on. */
export function fireCounts(items: readonly Item[]): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const it of items) for (const id of ruleIdsOf(it)) (sets.get(id) ?? sets.set(id, new Set()).get(id)!).add(it.problem);
  return new Map([...sets].map(([id, s]) => [id, s.size]));
}

const sum = (xs: Iterable<number>): number => [...xs].reduce((a, b) => a + b, 0);
const complexity = (p: Params): number => sum(Object.values(p.family)) + sum(Object.values(p.weights));

/**
 * Deterministic coordinate ascent on the number of correct top-1 picks (IMP and MP items pooled).
 * 1. For each noiseK of the grid: family weights from W_GRID, three passes, family by family.
 * 2. The best noiseK (ties to the smaller one) is kept.
 * 3. Rules firing on at least MIN_FIRE problems get their own weight from W_GRID (two passes); only a strict gain in
 *    (correct - PENALTY * total weight) changes a weight, so a rule that buys nothing falls back to 0 or stays at its family weight.
 * `frozenZero` rules (the dropped ones) and `biasOff` are fixed; a given `noiseK` is fixed too (the per-scoring-form fits share the joint one).
 */
export function fit(items: readonly Item[], families: ReadonlyMap<string, string>, base: { dropped: Set<string>; biasOff: Set<string>; familyNames: string[]; noiseK?: number }): Params {
  const byRule = indexRules(items);
  const fires = fireCounts(items);
  const familyItems = new Map<string, number[]>(base.familyNames.map((f) => [f, [...new Set([...byRule].filter(([id]) => familyOf(families, id) === f).flatMap(([, idx]) => idx))]]));
  const subset = (idx: number[], p: Params): number => {
    const dp = paramsFor(p, families);
    return idx.reduce((n, i) => n + (isCorrect(items[i]!, dp) ? 1 : 0), 0);
  };
  const all = items.map((_, i) => i);
  let best: { p: Params; obj: number } | null = null;
  for (const k of base.noiseK === undefined ? K_GRID : [base.noiseK]) {
    const p: Params = { noiseK: k, family: Object.fromEntries(base.familyNames.map((f) => [f, 0])), weights: {}, dropped: new Set(base.dropped), biasOff: new Set(base.biasOff) };
    for (let pass = 0; pass < 3; pass++) {
      for (const f of base.familyNames) {
        const idx = familyItems.get(f)!;
        let bestW = p.family[f]!;
        let bestObj = subset(idx, p) - PENALTY * bestW;
        for (const w of W_GRID) {
          p.family[f] = w;
          const obj = subset(idx, p) - PENALTY * w;
          if (obj > bestObj + 1e-9) {
            bestObj = obj;
            bestW = w;
          }
        }
        p.family[f] = bestW;
      }
    }
    const obj = subset(all, p) - PENALTY * complexity(p);
    if (best === null || obj > best.obj + 1e-9) best = { p, obj };
  }
  const p = best!.p;
  const individual = [...fires].filter(([id, n]) => n >= MIN_FIRE && !base.dropped.has(id)).map(([id]) => id).sort();
  for (let pass = 0; pass < 2; pass++) {
    for (const id of individual) {
      const idx = byRule.get(id)!;
      const own = p.weights[id];
      let bestW = own ?? p.family[familyOf(families, id)] ?? 0;
      p.weights[id] = bestW;
      let bestObj = subset(idx, p) - PENALTY * bestW;
      for (const w of W_GRID) {
        p.weights[id] = w;
        const obj = subset(idx, p) - PENALTY * w;
        if (obj > bestObj + 1e-9) {
          bestObj = obj;
          bestW = w;
        }
      }
      p.weights[id] = bestW;
    }
  }
  return p;
}

export interface Delta {
  /** Held-out problems (items) the rule fires on. */
  fires: number;
  /** Held-out correct picks with the rule minus without it, summed over the folds. */
  gain: number;
}

export interface CvResult {
  /** Held-out correct picks of the fold-fitted parameters, pooled over the folds. */
  correct: number;
  total: number;
  rules: Map<string, Delta>;
  families: Map<string, Delta>;
  biases: Map<string, Delta>;
}

/** Fold of a problem: its position among the sorted problem ids modulo FOLDS (deterministic). */
export function foldsOf(problems: readonly string[]): Map<string, number> {
  return new Map([...new Set(problems)].sort().map((id, i) => [id, i % FOLDS]));
}

/**
 * K-fold cross-validation inside the fitting set. For every fold the parameters are fitted on the other folds, then the
 * held-out items are scored with and without each rule, rule family and DD bias: the gain is what that component adds to held-out accuracy.
 */
export function crossValidate(items: readonly Item[], families: ReadonlyMap<string, string>, base: { familyNames: string[]; biasIds: string[]; biasOff: Set<string>; noiseK?: number }): CvResult {
  const folds = foldsOf(items.map((i) => i.problem));
  const res: CvResult = { correct: 0, total: items.length, rules: new Map(), families: new Map(), biases: new Map() };
  const bump = (m: Map<string, Delta>, id: string, gain: number, fires: number): void => {
    const d = m.get(id) ?? { fires: 0, gain: 0 };
    d.gain += gain;
    d.fires += fires;
    m.set(id, d);
  };
  for (let f = 0; f < FOLDS; f++) {
    const train = items.filter((it) => folds.get(it.problem) !== f);
    const held = items.filter((it) => folds.get(it.problem) === f);
    const p = fit(train, families, { dropped: new Set(), biasOff: base.biasOff, familyNames: base.familyNames, noiseK: base.noiseK });
    const dp = paramsFor(p, families);
    const ok = held.map((it) => isCorrect(it, dp));
    res.correct += ok.filter(Boolean).length;
    const heldRules = indexRules(held);
    const gainWith = (idx: number[], alt: Params): number => {
      const dpAlt = paramsFor(alt, families);
      return idx.reduce((n, i) => n + (ok[i] ? 1 : 0) - (isCorrect(held[i]!, dpAlt) ? 1 : 0), 0);
    };
    for (const [id, idx] of heldRules) {
      const alt = cloneParams(p);
      alt.dropped.add(id);
      bump(res.rules, id, gainWith(idx, alt), idx.length);
    }
    for (const fam of base.familyNames) {
      const idx = [...new Set([...heldRules].filter(([id]) => familyOf(families, id) === fam).flatMap(([, v]) => v))];
      const alt = cloneParams(p);
      alt.family[fam] = 0;
      for (const id of Object.keys(alt.weights)) if (familyOf(families, id) === fam) alt.weights[id] = 0;
      bump(res.families, fam, gainWith(idx, alt), idx.length);
    }
    for (const b of base.biasIds) {
      const alt = cloneParams(p);
      alt.biasOff.add(b);
      const fires = held.filter((it) => it.input.bias.some((row) => row[it.input.biasIds.indexOf(b)]! !== 0)).length;
      bump(res.biases, b, gainWith(held.map((_, i) => i), alt), fires);
    }
  }
  return res;
}

export interface Fitted {
  params: Params;
  cv: CvResult;
  droppedRules: { id: string; fires: number; gain: number }[];
  droppedFamilies: string[];
  biasOff: string[];
}

/**
 * The full procedure on the fitting set: cross-validated drop decisions (a rule, family or bias that does not improve held-out accuracy
 * is dropped), then the final fit on all fitting items with those decisions fixed.
 */
export function fitWithDrops(items: readonly Item[], families: ReadonlyMap<string, string>, familyNames: string[], biasIds: string[], noiseK?: number): Fitted {
  const cv = crossValidate(items, families, { familyNames, biasIds, biasOff: new Set(), noiseK });
  const biasOff = biasIds.filter((b) => (cv.biases.get(b)?.gain ?? 0) <= 0);
  const droppedFamilies = familyNames.filter((f) => (cv.families.get(f)?.gain ?? 0) <= 0);
  const droppedRules = [...cv.rules]
    .filter(([id, d]) => d.gain <= 0 && !droppedFamilies.includes(familyOf(families, id)))
    .map(([id, d]) => ({ id, fires: d.fires, gain: d.gain }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const dropped = new Set([...droppedRules.map((r) => r.id), ...[...cv.rules.keys()].filter((id) => droppedFamilies.includes(familyOf(families, id)))]);
  const params = fit(items, families, { dropped, biasOff: new Set(biasOff), familyNames, noiseK });
  for (const f of droppedFamilies) params.family[f] = 0;
  return { params, cv, droppedRules, droppedFamilies, biasOff };
}

export interface FormChoice {
  scoring: "IMP" | "MP";
  /** The form's own fit on all its odd items (shared noiseK). */
  separate: Fitted;
  /** Outer cross-validation on the odd ids: correct top-1 picks on this form's held-out items of the joint procedure and of the separate one. */
  cv: { joint: number; separate: number; items: number };
  /** The separate fit is used only when it beats the joint fit in that cross-validation. */
  keep: boolean;
}

/**
 * Per-scoring-form weights without touching the held-out (even) ids. Outer FOLDS-fold cross-validation over the fitting problems: in every fold
 * the whole joint procedure (fitWithDrops on both forms; noiseK from the grid) and the whole separate procedure (fitWithDrops on the form's items only,
 * noiseK fixed to `noiseK`; its own rule, family and DD bias decisions) are run on the other folds and scored on the fold's items of that form.
 */
export function chooseForms(items: readonly Item[], families: ReadonlyMap<string, string>, familyNames: string[], biasIds: string[], noiseK: number): Record<"IMP" | "MP", FormChoice> {
  const folds = foldsOf(items.map((i) => i.problem));
  const forms = ["IMP", "MP"] as const;
  const tally = { IMP: { joint: 0, separate: 0, items: 0 }, MP: { joint: 0, separate: 0, items: 0 } };
  for (let f = 0; f < FOLDS; f++) {
    const train = items.filter((it) => folds.get(it.problem) !== f);
    const held = items.filter((it) => folds.get(it.problem) === f);
    const joint = paramsFor(fitWithDrops(train, families, familyNames, biasIds).params, families);
    for (const s of forms) {
      const sep = paramsFor(fitWithDrops(train.filter((it) => it.scoring === s), families, familyNames, biasIds, noiseK).params, families);
      for (const it of held.filter((x) => x.scoring === s)) {
        tally[s].items++;
        if (isCorrect(it, joint)) tally[s].joint++;
        if (isCorrect(it, sep)) tally[s].separate++;
      }
    }
  }
  const out = {} as Record<"IMP" | "MP", FormChoice>;
  for (const s of forms) {
    const separate = fitWithDrops(items.filter((it) => it.scoring === s), families, familyNames, biasIds, noiseK);
    out[s] = { scoring: s, separate, cv: tally[s], keep: tally[s].separate > tally[s].joint };
  }
  return out;
}
