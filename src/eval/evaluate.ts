import { encodeBits, encodeTricks } from "../calib/cache.ts";
import type { CalibEntry } from "../calib/cache.ts";
import { DEFAULT_SETTINGS, decisionSource, defaultRulebook, planFor, prepare, rateInput, solveAdaptive } from "../lead/analyse.ts";
import type { AnalyseSettings } from "../lead/analyse.ts";
import { weightsFor } from "../lead/config.ts";
import { biasesFor, makeRater } from "../scoring/rate.ts";
import { buildDecisionInput, paramsOf, ruleContrib } from "../scoring/rate-new.ts";
import { acceptCards, decisionOrders, legacyOrders, modeResult, MODES } from "./modes.ts";
import type { Mode, ModeResult, Orders } from "./modes.ts";
import { buildProblem, leadCards, leadText } from "./problems.ts";
import type { BookLead, TestProblem } from "./problems.ts";
import type { ChunkRunner } from "../dd/pool.ts";
import type { Card } from "../engine/types.ts";

export type { Mode, ModeResult };
export { MODES };

export interface ProblemRecord {
  id: string;
  kind: TestProblem["kind"];
  book: TestProblem["book"];
  contract: string;
  auctionText: string;
  auction: string | null;
  auctionSource: "text" | "default" | "contract-only";
  auctionParsed: boolean;
  accept: string[];
  acceptMps: string[];
  imp: Record<Mode, ModeResult>;
  mp: Record<Mode, ModeResult>;
  bookBest: string;
  /** Our bias-corrected P(defeat) in % for the book's best lead, for our top-ranked (IMP, new scheme) lead and for the highest of all options. */
  pDefBook: number;
  pDefTop: number;
  pDefMax: number;
  bookBeatBest: number;
  /** The book's beat % of our top lead, when its table lists it. */
  bookBeatTop: number | null;
  /** Percentage points: gapBest = pDefMax - pDefBook (the book's best is not our highest-Pdef lead), gapTop = pDefBook - pDefTop (our top-ranked lead defeats less often than the book's best); gap is the larger. */
  gapBest: number;
  gapTop: number;
  gap: number;
  /** 1-based rank of the book's best lead in our IMP ranking of the new scheme. */
  bookRank: number;
  /** Our IMP ranking of the new scheme, best first (first 3). */
  ranking: string[];
  ms: number;
  msSolve: number;
  /** Deals used (adaptive sampling: 200 plus chunks of 100 while the two best options were within noise, up to the cap). */
  deals: number;
  acceptanceRate: number;
  timedOut: boolean;
}

const pct = (x: number): number => Math.round(x * 1000) / 10;

export interface EvalOptions {
  /** Fixed number of deals (no adaptive sampling). */
  deals?: number;
  seed?: number;
  /** Adaptive sampling overrides (defaults: lead-config.json "adaptive"). */
  start?: number;
  step?: number;
  cap?: number;
}

export interface EvalOutput {
  record: ProblemRecord;
  calib: CalibEntry;
}

/** One deal sample per problem (adaptive: until the two best options of IMP and MP are no longer within noise); every mode and both scorings re-rate the same deals. */
export async function evaluateProblem(t: TestProblem, pool: ChunkRunner, opts: EvalOptions = {}): Promise<EvalOutput> {
  const t0 = performance.now();
  const built = buildProblem(t);
  const book = defaultRulebook();
  const settings: AnalyseSettings = { ...DEFAULT_SETTINGS, seed: opts.seed ?? DEFAULT_SETTINGS.seed, ...built.settings };
  const items = (["IMP", "MP"] as const).map((scoring) => {
    const p = { ...built.problem, scoring };
    return { scoring, p, prep: prepare(p, settings, book) };
  });
  const imp = items[0]!;
  const plan = opts.deals === undefined ? planFor(book, { start: opts.start, step: opts.step, cap: opts.cap }) : null;
  const solved = await solveAdaptive(imp.prep, pool, { deals: opts.deals ?? 0, plan, items, book });
  const msSolve = performance.now() - t0;
  if (solved.deals.length === 0) throw new Error(`${t.id}: no deals could be generated`);

  const hand0 = built.problem.hand[0]!;
  const perScoring = items.map(({ scoring, p, prep }) => {
    const rater = makeRater(rateInput(p, prep, solved, book, book.baseline));
    const w = weightsFor(book.baseline, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring, sacrifice: prep.ctx.features.has("sacrifice") });
    const src = decisionSource(p, prep, solved, book);
    const inp = buildDecisionInput(src);
    const orders: Orders = { ...legacyOrders(rater, hand0, w), ...decisionOrders(inp, paramsOf(book.config, book.rules, scoring), src.options) };
    const accept = acceptCards(scoring === "IMP" ? t.accept_imps : t.accept_mps);
    const results = Object.fromEntries(MODES.map((m) => [m, modeResult(orders[m], accept)])) as Record<Mode, ModeResult>;
    return { scoring, prep, rater, src, orders, results };
  });
  const [impRes, mpRes] = perScoring as [(typeof perScoring)[number], (typeof perScoring)[number]];

  const ranking = impRes.orders.new;
  const rows = new Map<string, number>(impRes.rater.rate(hand0, { dd: 1, rules: 0 }).options.map((o) => [o.cards.join(), o.pDef]));
  const pDefOf = (cards: Card[]): number => rows.get(cards.join()) ?? 0;
  const bookCards = leadCards(t.expected.best_imps.text);
  const bookIdx = ranking.findIndex((g) => g.some((c) => bookCards.includes(c)));
  const top = ranking[0]!;
  const pDefBook = bookIdx < 0 ? 0 : pDefOf(ranking[bookIdx]!);
  const table: BookLead[] = [t.expected.best_imps, t.expected.best_mps, ...(t.expected.second ? [t.expected.second] : []), ...(t.table ?? [])];
  const bookTop = table.find((e) => leadCards(e.text).some((c) => top.includes(c)));
  const pDefMax = Math.max(...ranking.map(pDefOf));
  const gapBest = pct(pDefMax - pDefBook);
  const gapTop = pct(pDefBook - pDefOf(top));
  const ms = Math.round(performance.now() - t0);

  const record: ProblemRecord = {
    id: t.id,
    kind: t.kind,
    book: t.book,
    contract: t.contract,
    auctionText: t.auction_text,
    auction: built.auctionParsed ? built.problem.auction.join(" ") : null,
    auctionSource: built.source,
    auctionParsed: built.auctionParsed,
    accept: t.accept_imps,
    acceptMps: t.accept_mps,
    imp: impRes.results,
    mp: mpRes.results,
    bookBest: t.expected.best_imps.text,
    pDefBook: pct(pDefBook),
    pDefTop: pct(pDefOf(top)),
    pDefMax: pct(pDefMax),
    bookBeatBest: t.expected.best_imps.beat_pct,
    bookBeatTop: bookTop?.beat_pct ?? null,
    gapBest,
    gapTop,
    gap: Math.max(gapBest, gapTop),
    bookRank: bookIdx < 0 ? ranking.length + 1 : bookIdx + 1,
    ranking: ranking.slice(0, 3).map((g) => leadText(g[0]!)),
    ms,
    msSolve: Math.round(msSolve),
    deals: solved.deals.length,
    acceptanceRate: solved.tried === 0 ? 0 : Math.round((solved.deals.length / solved.tried) * 1000) / 1000,
    timedOut: solved.timedOut,
  };

  const src = impRes.src;
  const need = src.need;
  const rulesOf = (s: (typeof perScoring)[number]) => {
    const contrib = ruleContrib(s.src.options, s.src.ctx.hand, s.src.hits);
    const ids = [...new Set(contrib.flatMap((c) => Object.keys(c)))].sort();
    return ids.map((id) => ({ id, contrib: contrib.map((c) => c[id] ?? 0) }));
  };
  const calib: CalibEntry = {
    id: t.id,
    book: t.book,
    hand: built.problem.hand,
    auction: built.problem.auction,
    dealer: built.problem.dealer,
    vul: built.problem.vul,
    disciplined: settings.disciplined,
    leader: impRes.prep.leader,
    contract: impRes.prep.contract,
    contractType: impRes.prep.ctx.contractType,
    levelClass: impRes.prep.ctx.levelClass,
    sacrifice: impRes.prep.ctx.features.has("sacrifice"),
    need,
    accept: { IMP: t.accept_imps, MP: t.accept_mps },
    deals: solved.deals.length,
    options: src.options.map((o) => ({ cards: o.cards, rep: o.rep, tricks: encodeTricks(o.tricks), defeat: encodeBits(Array.from(o.tricks, (x) => (x >= need ? 1 : 0))) })),
    rules: { IMP: rulesOf(impRes), MP: rulesOf(mpRes) },
    biases: book.config.biases.map((b) => ({ id: b.id, pdefPoints: b.pdefPoints, edefTricks: b.edefTricks, applies: src.options.map((o) => (biasesFor(o.rep, src.ctx, book.config).some((x) => x.id === b.id) ? 1 : 0)) })),
    ms,
  };
  return { record, calib };
}

