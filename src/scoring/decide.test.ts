import { describe, expect, it } from "vitest";
import { decide, decideDdOnly, pairedSe, ratings, sigmaFloor, summarise, topTwoUnresolved } from "./decide.ts";
import type { DecisionInput, DecisionParams } from "./decide.ts";

const ones = (n: number, from = 0, len = 0): number[] => Array.from({ length: n }, (_, i) => (i >= from && i < from + len ? 1 : 0));

/** 100 deals. A defeats on deals 0-59 (60%); B on 0-29 (30%); C on 0-57 (58%): C trails A by exactly deals 58 and 59. */
const A = ones(100, 0, 60);
const B = ones(100, 0, 30);
const C = ones(100, 0, 58);

const input = (series: number[][], contrib: Record<string, number>[]): DecisionInput => ({
  ...summarise(series, series.map(() => new Array<number>(100).fill(0))),
  biasIds: [],
  bias: series.map(() => []),
  contrib,
});
const params = (weights: Record<string, number>, noiseK = 1.5): DecisionParams => ({ noiseK, weightOf: (id) => weights[id] ?? 0, biasOn: () => true });

describe("paired standard error", () => {
  it("is the standard error of the per-deal difference, not of the two proportions", () => {
    expect(pairedSe(A, B)).toBeCloseTo(0.046057, 5);
    expect(pairedSe(A, C)).toBeCloseTo(0.014071, 5);
    expect(pairedSe(A, A)).toBe(0);
    expect(pairedSe([1], [0])).toBe(0);
  });
  it("summarise gives means and a symmetric matrix", () => {
    const s = summarise([A, B, C], [A, B, C]);
    expect(s.means).toEqual([0.6, 0.3, 0.58]);
    expect(s.se[0]![2]).toBe(s.se[2]![0]);
    expect(s.se[1]![1]).toBe(0);
  });
});

describe("noise set", () => {
  it("an option is within noise iff gap <= k * paired SE", () => {
    const d = decide(input([A, B, C], [{}, {}, {}]), params({}, 1.5));
    expect(d.best).toBe(0);
    expect(d.gap[2]).toBeCloseTo(0.02, 12);
    expect(d.noise).toEqual([true, false, true]);
    expect(decide(input([A, B, C], [{}, {}, {}]), params({}, 1)).noise).toEqual([true, false, false]);
    expect(decide(input([A, B, C], [{}, {}, {}]), params({}, 0)).noise).toEqual([true, false, false]);
  });
});

describe("rules only break near-ties", () => {
  it("a rule with a huge weight cannot overrule a clear DD winner", () => {
    const inp = input([A, B], [{}, { "SU-999": 1 }]);
    const d = decide(inp, params({ "SU-999": 1e9 }));
    expect(d.noise).toEqual([true, false]);
    expect(d.order).toEqual([0, 1]);
    expect(d.ruleTerm).toEqual([0, 0]);
    expect(ratings(d, 0.25)[0]).toBe(100);
    expect(ratings(d, 0.25)[1]).toBeLessThan(100);
    const avoid = decide(input([A, B], [{ "NT-999": -1 }, {}]), params({ "NT-999": 1e9 }));
    expect(avoid.order).toEqual([0, 1]);
  });
  it("reorders a near-tie: the weight times sigma must beat the DD gap", () => {
    const inp = input([A, B, C], [{}, {}, { "NT-010": 1 }]);
    const d = decide(inp, params({ "NT-010": 1 }));
    expect(d.sigma).toBeCloseTo(0.030064, 5);
    expect(d.order).toEqual([2, 0, 1]);
    expect(d.score[2]).toBeCloseTo(0.610064, 5);
    expect(decide(inp, params({ "NT-010": 0.5 })).order).toEqual([0, 2, 1]);
    expect(decide(inp, params({ "NT-010": 1 }, 1)).order).toEqual([0, 2, 1]);
  });
  it("mode dd is the same ranking with every weight at zero", () => {
    expect(decideDdOnly(input([A, B, C], [{}, {}, { "NT-010": 1 }])).order).toEqual([0, 2, 1]);
  });
  it("exactly tied options (zero SE) still obey a rule, through the sigma floor", () => {
    const d = decide(input([A, A.slice()], [{}, { "SU-001": 1 }]), params({ "SU-001": 1 }));
    expect(d.sigma).toBe(sigmaFloor(100));
    expect(d.order).toEqual([1, 0]);
  });
  it("an option outside the noise set never ranks above one inside it, whatever the weights", () => {
    const d = decide(input([A, B, C], [{}, { X: 1 }, {}]), params({ X: 1e9 }));
    expect(d.order).toEqual([0, 2, 1]);
  });
});

describe("ratings", () => {
  it("never rise along the ranking and are 100 for the top", () => {
    const d = decide(input([A, B, C], [{}, {}, { "NT-010": 1 }]), params({ "NT-010": 1 }));
    expect(ratings(d, 0.25)).toEqual([96, 0, 100]);
    expect(ratings(d, 0.25)[d.order[0]!]).toBe(100);
  });
});

describe("adaptive test", () => {
  it("the top two within noise and not identical need more deals", () => {
    expect(topTwoUnresolved(input([A, B, C], [{}, {}, {}]), 1.5)).toBe(true);
    expect(topTwoUnresolved(input([A, B, C], [{}, {}, {}]), 1)).toBe(false);
    expect(topTwoUnresolved(input([A, B], [{}, {}]), 1.5)).toBe(false);
    expect(topTwoUnresolved(input([A, A.slice()], [{}, {}]), 1.5)).toBe(false);
  });
});

describe("bias corrections are values like any other", () => {
  it("a bias subtracted from the leading option can make the runner-up the DD-best", () => {
    const inp: DecisionInput = { ...input([A, C], [{}, {}]), biasIds: ["B1"], bias: [[0.03], [0]] };
    expect(decide(inp, params({})).best).toBe(1);
    expect(decide(inp, { ...params({}), biasOn: () => false }).best).toBe(0);
  });
});
