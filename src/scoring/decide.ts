/**
 * Phase 6: double dummy decides, rules only break near-ties (docs/phase6-dd-decides.md).
 *
 * Everything here is pure and DD-free: it works on per-option summary statistics (means of the metric series, the paired
 * standard errors of every pairwise difference, bias corrections, rule recommendations), so the live scorer, the
 * evaluation and the offline calibration run the very same code.
 */

export interface DecisionInput {
  n: number;
  /** Mean of the deciding metric (P(defeat) as a fraction, defence tricks, or IMPs against the score-best option) per option, before bias corrections. */
  means: number[];
  /** Mean of the other metric (tricks for P(defeat), P(defeat) for tricks): breaks exact ties only. */
  tieMeans: number[];
  /** se[i][j]: standard error of the paired per-deal difference series_i - series_j. */
  se: number[][];
  biasIds: string[];
  /** bias[i][k]: amount of bias biasIds[k] subtracted from option i, in metric units. */
  bias: number[][];
  /** contrib[i][ruleId]: signed recommendation of the rule for option i (+1 recommends, -1 avoids; summed over its hits). */
  contrib: Record<string, number>[];
  /** Size of one unit of P(defeat) in the metric's units (1 for P(defeat) and tricks; lossScale.IMP / lossScale.Pdef for IMPs): scales the sigma floor. */
  unit?: number;
}

export interface DecisionParams {
  noiseK: number;
  weightOf: (ruleId: string) => number;
  biasOn: (id: string) => boolean;
}

export interface Decision {
  /** Bias-corrected metric per option. */
  value: number[];
  /** Index of the DD-best option. */
  best: number;
  /** value[best] - value[i]. */
  gap: number[];
  /** Standard error of that gap (paired). */
  gapSe: number[];
  /** Within noise of the DD-best option: gap <= noiseK * gapSe (the best itself always). */
  noise: boolean[];
  /** The standard-error scale that converts a rule weight into metric units. */
  sigma: number;
  /** Rule term per option: sigma * sum(weight * sign). Zero outside the noise set. */
  ruleTerm: number[];
  /** Tie-break score: value + ruleTerm. */
  score: number[];
  /** Final ranking, best first: the noise set ordered by score, then every other option by value. */
  order: number[];
}

const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Standard error of the mean of a - b over paired deals (same deals for every option). */
export function pairedSe(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  let s = 0;
  let q = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    s += d;
    q += d * d;
  }
  const v = (q - (s * s) / n) / (n - 1);
  return v > 0 ? Math.sqrt(v / n) : 0;
}

/** Summary statistics of option series (options x deals). `tie` is the other metric, used only to break exact ties. */
export function summarise(series: readonly (readonly number[])[], tie: readonly (readonly number[])[]): Pick<DecisionInput, "n" | "means" | "tieMeans" | "se"> {
  const k = series.length;
  const se = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) se[i]![j] = se[j]![i] = pairedSe(series[i]!, series[j]!);
  }
  return { n: series[0]?.length ?? 0, means: series.map(mean), tieMeans: tie.map(mean), se };
}

/** Floor of sigma: 0.2 / sqrt(n), about the paired SE of two options differing on a few percent of the deals, so that exactly tied options still obey the rules. */
export const sigmaFloor = (n: number): number => 0.2 / Math.sqrt(Math.max(1, n));

const EPS = 1e-12;

/** Options ordered by bias-corrected value, ties by the other metric, then by index. */
function byValue(value: readonly number[], tie: readonly number[]): number[] {
  return value.map((_, i) => i).sort((a, b) => value[b]! - value[a]! || tie[b]! - tie[a]! || a - b);
}

export function valuesOf(inp: DecisionInput, biasOn: (id: string) => boolean): number[] {
  return inp.means.map((m, i) => m - inp.bias[i]!.reduce((a, x, k) => a + (biasOn(inp.biasIds[k]!) ? x : 0), 0));
}

export function decide(inp: DecisionInput, p: DecisionParams): Decision {
  const k = inp.means.length;
  const value = valuesOf(inp, p.biasOn);
  const best = byValue(value, inp.tieMeans)[0]!;
  const gap = value.map((v) => value[best]! - v);
  const gapSe = value.map((_, i) => (i === best ? 0 : inp.se[best]![i]!));
  const noise = value.map((_, i) => i === best || gap[i]! <= EPS + p.noiseK * gapSe[i]!);
  const ses = gapSe.filter((s, i) => i !== best && s > 0).sort((a, b) => a - b);
  const median = ses.length === 0 ? 0 : ses.length % 2 === 1 ? ses[(ses.length - 1) / 2]! : (ses[ses.length / 2 - 1]! + ses[ses.length / 2]!) / 2;
  const sigma = Math.max(median, (inp.unit ?? 1) * sigmaFloor(inp.n));
  const ruleTerm = value.map((_, i) => {
    if (!noise[i]) return 0;
    let t = 0;
    for (const [id, sign] of Object.entries(inp.contrib[i]!)) t += p.weightOf(id) * sign;
    return sigma * t;
  });
  const score = value.map((v, i) => v + ruleTerm[i]!);
  const inside = [...Array(k).keys()].filter((i) => noise[i]).sort((a, b) => score[b]! - score[a]! || value[b]! - value[a]! || inp.tieMeans[b]! - inp.tieMeans[a]! || a - b);
  const outside = byValue(value, inp.tieMeans).filter((i) => !noise[i]);
  return { value, best, gap, gapSe, noise, sigma, ruleTerm, score, order: [...inside, ...outside] };
}

/** The ranking by the metric alone (mode "dd"): the same function with every rule weight at zero. */
export const decideDdOnly = (inp: DecisionInput, biasOn: (id: string) => boolean = () => true): Decision => decide(inp, { noiseK: 0, weightOf: () => 0, biasOn });

/**
 * Adaptive sampling test: the two best options by the metric cannot yet be told apart.
 * An identical pair of series (zero standard error) counts as resolved: more deals would not separate them.
 */
export function topTwoUnresolved(inp: DecisionInput, noiseK: number, biasOn: (id: string) => boolean = () => true): boolean {
  if (inp.means.length < 2) return false;
  const value = valuesOf(inp, biasOn);
  const [a, b] = byValue(value, inp.tieMeans);
  const se = inp.se[a!]![b!]!;
  return se > 0 && value[a!]! - value[b!]! <= noiseK * se;
}

/** Rating (0..100) of every option from the final ranking: loss against the top, in metric units, scaled by `lossScale`; never rises along the ranking. */
export function ratings(d: Decision, lossScale: number): number[] {
  if (!(lossScale > 0)) throw new Error(`rating scale must be a positive number (tieBreak.lossScale in data/lead-config.json), got ${lossScale}`);
  const top = d.order[0]!;
  const topScore = d.score[top]!;
  const out = new Array<number>(d.value.length).fill(0);
  let cap = 100;
  for (const i of d.order) {
    const own = d.noise[i] ? d.score[i]! : d.value[i]!;
    const raw = Math.round(100 * Math.min(1, Math.max(0, 1 - Math.max(0, topScore - own) / lossScale)));
    cap = Math.min(cap, raw);
    out[i] = cap;
  }
  return out;
}
