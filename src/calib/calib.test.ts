import { afterAll, describe, expect, it } from "vitest";
import { HAS_BOOK_PROBLEMS, PROBLEMS_URL } from "../test-support/book-data.ts";
import { createNodePool } from "../dd/node-pool.ts";
import { defaultRulebook } from "../lead/analyse.ts";
import { acceptCards, modeResult } from "../eval/modes.ts";
import { evaluateProblem, MODES } from "../eval/evaluate.ts";
import type { TestProblem } from "../eval/problems.ts";
import { readFileSync } from "node:fs";
import type { DecisionInput } from "../scoring/decide.ts";
import { decodeBits, decodeTricks, encodeBits, encodeTricks } from "./cache.ts";
import type { CalibCache } from "./cache.ts";
import { ordersFor, runCalibration, splitOf } from "./calibrate.ts";
import { chooseForms, fit, fitWithDrops, foldsOf, FOLDS } from "./fit.ts";
import type { Item } from "./fit.ts";
import { compactJson } from "./json.ts";
import { rebuild } from "./rebuild.ts";
import { tieBreakSet } from "../lead/config.ts";

describe("split by the parity of the trailing integer of the id", () => {
  it.each([
    ["nt-x20-q1", "odd"],
    ["nt-x20-q2", "even"],
    ["suit-x37-h23", "odd"],
    ["suit-x120-h10", "even"],
    ["nt-x41-q12", "even"],
  ])("%s -> %s", (id, want) => expect(splitOf(id)).toBe(want));
  it("rejects ids without a trailing integer", () => expect(() => splitOf("nt-x")).toThrow("trailing integer"));
});

describe("cache encoding", () => {
  it("round-trips defence tricks and defeat bits", () => {
    const tricks = [0, 3, 4, 13, 7, 5, 6, 2, 8];
    expect(Array.from(decodeTricks(encodeTricks(tricks)))).toEqual(tricks);
    const bits = [1, 0, 0, 1, 1, 1, 0, 1, 1, 0];
    expect(Array.from(decodeBits(encodeBits(bits), bits.length))).toEqual(bits);
    expect(encodeBits([1, 0, 0, 0, 0, 0, 0, 0])).toBe("AQ==");
  });
  it("compactJson keeps short values on one line", () => {
    expect(compactJson({ a: [1, 2], b: { c: 1 } })).toBe('{"a":[1,2],"b":{"c":1}}');
    expect(compactJson({ k: "x".repeat(30) }, 20)).toBe(`{\n  "k": "${"x".repeat(30)}"\n}`);
  });
});

/** Two near-tied options (means .50 and .49, paired SE .02); `rec` says which option the rule recommends, `accepted` which one is right. */
const near = (id: string, rule: string, rec: 0 | 1, accepted: 0 | 1): Item[] => {
  const input: DecisionInput = {
    n: 100,
    means: [0.5, 0.49],
    tieMeans: [0, 0],
    se: [[0, 0.02], [0.02, 0]],
    biasIds: [],
    bias: [[], []],
    contrib: rec === 0 ? [{ [rule]: 1 }, {}] : [{}, { [rule]: 1 }],
  };
  return (["IMP", "MP"] as const).map((scoring) => ({ problem: id, scoring, input, accepted: accepted === 0 ? [true, false] : [false, true] }));
};

describe("fitting on synthetic problems", () => {
  const families = new Map([["NT-001", "nt"], ["SU-001", "suit"]]);
  const items = [
    ...Array.from({ length: 30 }, (_, i) => near(`nt-x1-q${2 * i + 1}`, "NT-001", 1, 1)).flat(),
    ...Array.from({ length: 30 }, (_, i) => near(`suit-x1-q${2 * i + 1}`, "SU-001", 1, 0)).flat(),
  ];
  it("a helpful rule family gets a positive weight, a harmful one is dropped", () => {
    const f = fitWithDrops(items, families, ["nt", "suit"], []);
    expect(f.params.family.nt).toBeGreaterThan(0);
    expect(f.params.family.suit).toBe(0);
    expect(f.droppedFamilies).toEqual(["suit"]);
    expect(f.params.noiseK).toBeGreaterThanOrEqual(0.5);
    expect(f.cv.families.get("nt")!.gain).toBe(60);
    expect(f.cv.families.get("suit")!.gain).toBeLessThanOrEqual(0);
    expect(f.cv.correct).toBeGreaterThanOrEqual(120);
  });
  it("is deterministic", () => {
    expect(fit(items, families, { dropped: new Set(), biasOff: new Set(), familyNames: ["nt", "suit"] })).toEqual(fit(items, families, { dropped: new Set(), biasOff: new Set(), familyNames: ["nt", "suit"] }));
  });
  it("a separate per-form fit is kept only when it beats the joint fit in the outer cross-validation", () => {
    // NT-001 is right at IMPs and wrong at MPs: jointly it nets out and is dropped; IMPs alone want it, MPs alone do not.
    const mixed = Array.from({ length: 40 }, (_, i) => {
      const [imp] = near(`nt-x2-q${2 * i + 1}`, "NT-001", 1, 1);
      const [, mp] = near(`nt-x2-q${2 * i + 1}`, "NT-001", 1, 0);
      return [imp!, mp!];
    }).flat();
    const c = chooseForms(mixed, families, ["nt", "suit"], [], 1.5);
    expect(c.IMP.keep).toBe(true);
    expect(c.IMP.cv.separate).toBeGreaterThan(c.IMP.cv.joint);
    expect(c.IMP.separate.params.family.nt).toBeGreaterThan(0);
    expect(c.IMP.separate.params.noiseK).toBe(1.5);
    expect(c.MP.separate.params.family.nt).toBe(0);
    expect(c.MP.keep).toBe(c.MP.cv.separate > c.MP.cv.joint);
    expect(c.IMP.cv.items).toBe(40);
  });
  it("folds are balanced by sorted problem id", () => {
    const folds = foldsOf(items.map((i) => i.problem));
    const counts = Array.from({ length: FOLDS }, (_, f) => [...folds.values()].filter((x) => x === f).length);
    expect(counts).toEqual([12, 12, 12, 12, 12]);
  });
});

describe.skipIf(!HAS_BOOK_PROBLEMS)("calibration from a cache produced by the evaluation (no DD)", () => {
  const pool = createNodePool(4);
  afterAll(() => pool.dispose());
  const tests = ((HAS_BOOK_PROBLEMS ? JSON.parse(readFileSync(PROBLEMS_URL, "utf8")) : { tests: [] }) as { tests: TestProblem[] }).tests.filter((t) => t.usable_as_acceptance_test);
  const pick = (prefix: string) => tests.filter((t) => t.id.startsWith(prefix)).slice(0, 2);
  const subset = [...pick("nt-"), ...pick("suit-")];
  it("reproduces every evaluated mode from the cached DD vectors, recomputing the rules", async () => {
    const book = defaultRulebook();
    const entries = [];
    for (const t of subset) {
      const { record, calib } = await evaluateProblem(t, pool, { deals: 50 });
      entries.push(calib);
      expect(calib.deals).toBe(50);
      expect(calib.options.every((o) => decodeTricks(o.tricks).length === 50)).toBe(true);
      const r = rebuild(calib, book);
      const cached = rebuild(calib, book, { cachedRules: true });
      expect(cached.byScoring.IMP.input.contrib).toEqual(r.byScoring.IMP.input.contrib);
      expect(cached.byScoring.MP.input.contrib).toEqual(r.byScoring.MP.input.contrib);
      const families = new Map(book.rules.map((x) => [x.rule.id, x.rule.source.book_key as string]));
      const fittedFor = (sc: "IMP" | "MP") => { const set = tieBreakSet(book.config.tieBreak, sc); return { noiseK: book.config.tieBreak.noiseK, family: set.familyWeights, weights: set.weights, dropped: new Set(set.dropped), biasOff: new Set(set.biasOff) }; };
      for (const [scoring, res, accept] of [["IMP", record.imp, t.accept_imps], ["MP", record.mp, t.accept_mps]] as const) {
        const orders = ordersFor(r, scoring, book, { main: fittedFor(scoring) }, families, true);
        for (const m of MODES) {
          const got = modeResult(orders[m]!, acceptCards(accept));
          expect({ id: t.id, scoring, m, pass: got.pass, pass3: got.pass3, top: got.top }).toEqual({ id: t.id, scoring, m, pass: res[m].pass, pass3: res[m].pass3, top: res[m].top });
        }
      }
    }
    const cache: CalibCache = { version: 1, settings: { start: 50, step: 0, cap: 50, seed: 1, fixedDeals: 50, evalSeconds: 1 }, entries };
    const a = runCalibration(cache, book, { fittedAt: "t" });
    const b = runCalibration(cache, book, { fittedAt: "t" });
    expect(a.tieBreak).toEqual(b.tieBreak);
    expect(a.report).toContain("**2 odd problems**");
    expect(a.report).toContain("**2 even problems**");
    expect(a.tieBreak.fitSplit).toMatchObject({ nOdd: 2, nEven: 2, fit: "odd", report: "even" });
  }, 120000);
});
