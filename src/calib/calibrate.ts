import { decide, decideDdOnly } from "../scoring/decide.ts";
import { makeRater } from "../scoring/rate.ts";
import { legacyOrders, MODES } from "../eval/modes.ts";
import type { Orders } from "../eval/modes.ts";
import type { Rulebook } from "../lead/analyse.ts";
import { weightsFor } from "../lead/config.ts";
import type { TieBreakConfig } from "../lead/config.ts";
import type { Card } from "../engine/types.ts";
import type { Scoring } from "../rules/types.ts";
import type { CalibCache } from "./cache.ts";
import { chooseForms, countCorrect, fireCounts, fitWithDrops, FOLDS, K_GRID, MIN_FIRE, paramsFor, W_GRID } from "./fit.ts";
import type { FormChoice, Fitted, Item, Params } from "./fit.ts";
import { rebuild } from "./rebuild.ts";
import type { Rebuilt } from "./rebuild.ts";

export type Split = "odd" | "even";

/** Parity of the trailing integer of the problem id: nt-x-q1 -> 1 -> odd (fit); ...-q2 -> even (report only). */
export function splitOf(id: string): Split {
  const m = /(\d+)$/.exec(id);
  if (!m) throw new Error(`problem id ${id} has no trailing integer`);
  return Number(m[1]) % 2 === 1 ? "odd" : "even";
}

export interface Tally {
  n: number;
  top1: number;
  top3: number;
}

type Row = Record<Split, Record<Scoring, Tally>>;
export type ModeRow = Row;
const emptyRow = (): Row => ({ odd: { IMP: { n: 0, top1: 0, top3: 0 }, MP: { n: 0, top1: 0, top3: 0 } }, even: { IMP: { n: 0, top1: 0, top3: 0 }, MP: { n: 0, top1: 0, top3: 0 } } });

export interface CalibrationResult {
  tieBreak: TieBreakConfig;
  report: string;
  fitted: Fitted;
  forms: Record<Scoring, FormChoice>;
  rows: Record<string, Row>;
}

export interface CalibrateOptions {
  /** Reuse the rule firings stored in the cache instead of recomputing them from the problems (default false). */
  cachedRules?: boolean;
  /** Recompute the legacy modes (blend, rules, DD by score) from the cached DD vectors (default true; a few seconds). */
  legacy?: boolean;
  fittedAt?: string;
}

const pct = (a: number, n: number): string => (n === 0 ? "-" : `${(Math.round((1000 * a) / n) / 10).toFixed(1)}% (${a}/${n})`);

/** Legacy orders need the whole per-deal DD table back: option columns are expanded to every card of the option. */
function legacyOf(r: Rebuilt, book: Rulebook, scoring: Scoring): Pick<Orders, "blend" | "rules" | "ddScore"> {
  const e = r.entry;
  const dd = Array.from({ length: e.deals }, (_, i) => Object.fromEntries(r.options.flatMap((o) => o.cards.map((c) => [c, o.tricks[i]!] as const)))) as Record<Card, number>[];
  const ctx = r.byScoring[scoring].ctx;
  const w = weightsFor(book.baseline, { contractType: ctx.contractType, levelClass: ctx.levelClass, scoring, sacrifice: ctx.features.has("sacrifice") });
  const rater = makeRater({ deals: [], dd, contract: e.contract, vul: e.vul, scoring, leaderHand: e.hand, ctx, config: book.baseline, rules: book.rules, cards: { ...book.cards, options: book.baseline.settings.optionalCarding } });
  return legacyOrders(rater, e.hand[0]!, w);
}

/** Option groups in rank order for every mode of one problem and scoring, with the fitted parameters. */
export function ordersFor(r: Rebuilt, scoring: Scoring, book: Rulebook, params: { main: Params; evidenceOnly?: Params; joint?: Params }, families: ReadonlyMap<string, string>, legacy: boolean): Record<string, Card[][]> {
  const s = r.byScoring[scoring];
  const group = (order: number[]): Card[][] => order.map((i) => r.options[i]!.cards);
  const out: Record<string, Card[][]> = {
    dd: group(decideDdOnly(s.input, paramsFor(params.main, families).biasOn).order),
    new: group(decide(s.input, paramsFor(params.main, families)).order),
  };
  if (params.joint) out.newJoint = group(decide(s.input, paramsFor(params.joint, families)).order);
  if (params.evidenceOnly) out.newEvidence = group(decide(s.input, paramsFor(params.evidenceOnly, families)).order);
  if (legacy) Object.assign(out, legacyOf(r, book, scoring));
  return out;
}

function formSection(forms: Record<Scoring, FormChoice>, joint: Params, biasIds: string[], familyNames: string[]): string[] {
  const w = (q: Params): string => [...familyNames.map((f) => `${f} = ${q.family[f] ?? 0}`), ...Object.entries(q.weights).sort(([a], [b]) => a.localeCompare(b)).map(([id, v]) => `${id} = ${v}`)].join(", ");
  const lines = [
    "### Per scoring form (separate fits, shared noiseK)",
    "",
    `Each form is fitted on its own odd items with noiseK fixed at ${joint.noiseK} (its own rule, family and DD bias decisions, each by ${FOLDS}-fold cross-validation inside the odd items of the form). `
      + `Whether the separate fit replaces the joint one is decided by an outer ${FOLDS}-fold cross-validation on the odd ids (the whole joint and the whole separate procedure refitted on 4/5 and scored on the remaining fifth of that form's items); it is kept only if it is strictly better. The even ids play no part.`,
    "",
    "| form | outer CV joint | outer CV separate | kept | weights used | biases on |",
    "|---|---|---|---|---|---|",
  ];
  for (const sc of ["IMP", "MP"] as const) {
    const c = forms[sc];
    const used = c.keep ? c.separate.params : joint;
    lines.push(`| ${sc} | ${pct(c.cv.joint, c.cv.items)} | ${pct(c.cv.separate, c.cv.items)} | ${c.keep ? "separate" : "joint"} | ${w(used)} | ${biasIds.filter((b) => !used.biasOff.has(b)).join(", ") || "none"} |`);
  }
  lines.push("", "Separate fits (whether kept or not): DD bias decisions by inner cross-validation.", "", "| form | weights | " + biasIds.map((b) => `${b} CV gain`).join(" | ") + " | biases on | dropped families |", "|---|---|" + biasIds.map(() => "---|").join("") + "---|---|");
  for (const sc of ["IMP", "MP"] as const) {
    const f = forms[sc].separate;
    lines.push(`| ${sc} | ${w(f.params)} | ${biasIds.map((b) => String(f.cv.biases.get(b)?.gain ?? 0)).join(" | ")} | ${biasIds.filter((b) => !f.biasOff.includes(b)).join(", ") || "none"} | ${f.droppedFamilies.join(", ") || "none"} |`);
  }
  lines.push("");
  return lines;
}

export function runCalibration(cache: CalibCache, book: Rulebook, o: CalibrateOptions = {}): CalibrationResult {
  const t0 = performance.now();
  const families = new Map(book.rules.map((r) => [r.rule.id, r.rule.source.book_key as string]));
  const familyNames = [...new Set(families.values())].sort();
  const biasIds = book.config.biases.map((b) => b.id);
  const rebuilt = cache.entries.map((e) => rebuild(e, book, { cachedRules: o.cachedRules }));
  const itemsOf = (split: Split): Item[] =>
    rebuilt
      .filter((r) => splitOf(r.entry.id) === split)
      .flatMap((r) => (["IMP", "MP"] as const).map((scoring) => ({ problem: r.entry.id, scoring, input: r.byScoring[scoring].input, accepted: r.byScoring[scoring].accepted })));
  const odd = itemsOf("odd");
  const even = itemsOf("even");
  const nOdd = odd.length / 2;
  const nEven = even.length / 2;
  console.log(`split by parity of the trailing id integer: ${nOdd} odd problems (fit), ${nEven} even problems (report only)`);

  const fitted = fitWithDrops(odd, families, familyNames, biasIds);
  const p = fitted.params;
  // With every weight at zero the rules never act and noiseK is not identified; it also drives adaptive sampling, so the previous value stays.
  const identified = Object.values(p.family).some((w) => w > 0) || Object.values(p.weights).some((w) => w > 0);
  if (!identified) p.noiseK = book.config.tieBreak.noiseK;
  const none: Params = { noiseK: 0, family: Object.fromEntries(familyNames.map((f) => [f, 0])), weights: {}, dropped: new Set(), biasOff: new Set() };
  const observed = new Set(fireCounts(odd).keys());
  const unobserved = book.rules.map((r) => r.rule.id).filter((id) => !observed.has(id));
  // Per scoring form: its own fit (shared noiseK), kept only if it beats the joint fit in cross-validation on the odd ids.
  const forms = chooseForms(odd, families, familyNames, biasIds, p.noiseK);
  const formParams = { IMP: forms.IMP.keep ? forms.IMP.separate.params : p, MP: forms.MP.keep ? forms.MP.separate.params : p };
  const evidenceOf = (q: Params): Params => ({ ...q, dropped: new Set([...q.dropped, ...unobserved]) });

  const rows: Record<string, Row> = Object.fromEntries([...MODES, "newJoint", "newEvidence"].map((m) => [m, emptyRow()]));
  const tally = (mode: string, split: Split, scoring: Scoring, order: readonly Card[][], accepted: (g: Card[]) => boolean): void => {
    const t = rows[mode]![split][scoring];
    const first = order.findIndex(accepted);
    t.n++;
    if (first === 0) t.top1++;
    if (first >= 0 && first < 3) t.top3++;
  };
  for (const r of rebuilt) {
    const split = splitOf(r.entry.id);
    for (const scoring of ["IMP", "MP"] as const) {
      const acceptedBy = new Map(r.options.map((x, i) => [x.cards.join(), r.byScoring[scoring].accepted[i]!]));
      const orders = ordersFor(r, scoring, book, { main: formParams[scoring], evidenceOnly: evidenceOf(formParams[scoring]), joint: p }, families, o.legacy !== false);
      for (const [mode, order] of Object.entries(orders)) tally(mode, split, scoring, order, (g) => acceptedBy.get(g.join()) === true);
    }
  }

  const tieBreak: TieBreakConfig = {
    noiseK: p.noiseK,
    familyWeights: p.family,
    weights: Object.fromEntries(Object.entries(p.weights).sort(([a], [b]) => a.localeCompare(b))),
    dropped: [...p.dropped].sort(),
    biasOff: [...fitted.biasOff],
    lossScale: book.config.tieBreak.lossScale,
    byScoring: Object.fromEntries((["IMP", "MP"] as const).map((sc) => {
      const q = formParams[sc];
      return [sc, { fit: forms[sc].keep ? "separate" : "joint", familyWeights: q.family, weights: Object.fromEntries(Object.entries(q.weights).sort(([a], [b]) => a.localeCompare(b))), dropped: [...q.dropped].sort(), biasOff: [...q.biasOff].sort() }];
    })),
    fittedAt: o.fittedAt ?? new Date().toISOString(),
    fitSplit: { rule: "parity of the trailing integer of the problem id", fit: "odd", report: "even", nOdd, nEven, folds: FOLDS, objective: "top-1 accuracy on odd ids, IMP and MP items pooled", minFireForOwnWeight: MIN_FIRE, kGrid: K_GRID, weightGrid: W_GRID },
    metrics: {
      cvOdd: { correct: fitted.cv.correct, items: fitted.cv.total },
      ddOnlyOdd: countCorrect(odd, { ...none, biasOff: p.biasOff }, families),
      formCvOdd: Object.fromEntries((["IMP", "MP"] as const).map((sc) => [sc, { ...forms[sc].cv, kept: forms[sc].keep ? "separate" : "joint" }])),
      fitOdd: countCorrect(odd, p, families),
      even: Object.fromEntries(["dd", "new", "newJoint", "blend", "rules"].map((m) => [m, rows[m]?.even])),
    },
  };

  const ds = cache.entries.map((e) => e.deals);
  const f = (t: Tally, k: "top1" | "top3"): string => pct(t[k], t.n);
  const names: Record<string, string> = { blend: "blend (old)", dd: "DD-only (IMP score at IMPs / tricks at MPs)", rules: "rules-only", new: "new (DD decides, rules tie-break; per-form weights)", newJoint: "new, joint weights (both forms)", newEvidence: "new, evidence-only rules", ddScore: "DD-only by score (phase 5)" };
  const table = (split: Split): string[] => {
    const head = ["| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |", "|---|---|---|---|---|"];
    const body = Object.keys(names)
      .filter((m) => o.legacy !== false || ["dd", "new", "newJoint", "newEvidence"].includes(m))
      .map((m) => `| ${names[m]} | ${f(rows[m]![split].IMP, "top1")} | ${f(rows[m]![split].IMP, "top3")} | ${f(rows[m]![split].MP, "top1")} | ${f(rows[m]![split].MP, "top3")} |`);
    return [...head, ...body];
  };
  const fires = fireCounts(odd);
  const own = Object.entries(p.weights).sort(([a], [b]) => a.localeCompare(b));
  const report = [
    "# Calibration report",
    "",
    `Cache: ${cache.entries.length} problems; deals per problem: mean ${Math.round(ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length))}, min ${Math.min(...ds)}, max ${Math.max(...ds)}; evaluation time ${cache.settings.evalSeconds} s (sampling start ${cache.settings.start}, step ${cache.settings.step}, cap ${cache.settings.cap}${cache.settings.fixedDeals ? `, fixed ${cache.settings.fixedDeals}` : ""}, seed ${cache.settings.seed}).`,
    `Calibration runtime: ${((performance.now() - t0) / 1000).toFixed(1)} s (no DD; rules ${o.cachedRules ? "from the cache" : "recomputed from the problems with data/lead-rules.json"}).`,
    "",
    "## Split",
    "",
    `By the parity of the trailing integer of the problem id (nt-x-q1 -> 1 -> odd): **${nOdd} odd problems** (fitting and cross-validation only), **${nEven} even problems** (held-out report only; never used for any choice).`,
    "",
    "## Fitted values",
    "",
    `- noiseK = **${p.noiseK}** (grid ${K_GRID.join(", ")})${identified ? "" : ": no rule improved held-out accuracy, so noiseK is not identified by the rules and the previous value is kept (it also sets the adaptive-sampling test)"}.`,
    `- Family weights (units of sigma, the median paired SE): ${Object.entries(p.family).map(([k, v]) => `${k} = ${v}`).join(", ")} (grid ${W_GRID.join(", ")}).`,
    `- Objective: top-1 accuracy on the odd problems, IMP and MP items pooled (joint fit: one set of weights for both scorings; the per-form fits are below). Cross-validation: ${FOLDS} folds inside the odd set.`,
    `- Accuracy on odd items (IMP+MP pooled): fitted ${fitted.cv.total ? pct(countCorrect(odd, p, families), fitted.cv.total) : "-"} in-sample, cross-validated ${pct(fitted.cv.correct, fitted.cv.total)}, DD-only ${pct(countCorrect(odd, { ...none, biasOff: p.biasOff }, families), fitted.cv.total)}.`,
    "",
    `### DD bias corrections (kept only if they improve cross-validated accuracy)`,
    "",
    "| bias | fires on held-out items | CV gain (problems) | decision |",
    "|---|---|---|---|",
    ...biasIds.map((b) => `| ${b} | ${fitted.cv.biases.get(b)?.fires ?? 0} | ${fitted.cv.biases.get(b)?.gain ?? 0} | ${fitted.biasOff.includes(b) ? "off" : "kept"} |`),
    "",
    `### Rule families`,
    "",
    "| family | fires on held-out items | CV gain (problems) | decision |",
    "|---|---|---|---|",
    ...familyNames.map((n) => `| ${n} | ${fitted.cv.families.get(n)?.fires ?? 0} | ${fitted.cv.families.get(n)?.gain ?? 0} | ${fitted.droppedFamilies.includes(n) ? "dropped (weight 0)" : `weight ${p.family[n]}`} |`),
    "",
    `### Rules with their own weight (fire on at least ${MIN_FIRE} odd problems)`,
    "",
    own.length === 0 ? "None." : ["| rule | weight | odd problems | CV gain |", "|---|---|---|---", ...own.map(([id, w]) => `| ${id} | ${w} | ${fires.get(id) ?? 0} | ${fitted.cv.rules.get(id)?.gain ?? 0} |`)].join("\n"),
    "",
    `### Dropped rules (no gain in held-out accuracy; ${fitted.droppedRules.length}${fitted.droppedFamilies.length ? `, plus every rule of the dropped families ${fitted.droppedFamilies.join(", ")}` : ""})`,
    "",
    fitted.droppedRules.length === 0 ? "None." : fitted.droppedRules.map((r) => `${r.id} (fires ${r.fires}, gain ${r.gain})`).join(", "),
    "",
    ...formSection(forms, p, biasIds, familyNames),
    `Rules that never fire on an odd problem (${book.rules.length - observed.size} of ${book.rules.length}) were not tested: they inherit their family weight (the "evidence-only" row shows the scheme without them).`,
    "",
    "## Held-out accuracy: even ids (not used for fitting or for any choice)",
    "",
    ...table("even"),
    "",
    "## Odd ids (fitting set; the new scheme and DD-only use the fitted settings, so those rows are in-sample)",
    "",
    ...table("odd"),
    "",
  ].join("\n");
  return { tieBreak, report, fitted, forms, rows };
}
