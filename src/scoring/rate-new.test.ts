import { describe, expect, it } from "vitest";
import type { Card } from "../engine/types.ts";
import type { RuleHit } from "../rules/types.ts";
import { ruleContrib } from "./rate-new.ts";

const hit = (ruleId: string, kind: RuleHit["kind"], weight: number, cards: Card[]): RuleHit => ({ ruleId, kind, weight, cards, suitWide: false, text: "", book: "", bookKey: "nt", page: 1, evidence: "simulation", technical: false });

describe("ruleContrib", () => {
  const hand: Card[] = ["AS", "7S", "6H", "3H"];
  const options = [{ cards: [hand[0]!] }, { cards: [hand[2]!] }];
  it("counts recommending and avoiding hits with their sign", () => {
    expect(ruleContrib(options, hand, [hit("R1", "recommend", 0.5, [hand[0]!]), hit("R2", "avoid", -0.4, [hand[2]!])])).toEqual([{ R1: 1 }, { R2: -1 }]);
  });
  it("ignores tips and weight-0 (advice-only) rules", () => {
    expect(ruleContrib(options, hand, [hit("T", "tip", 0, []), hit("Z", "recommend", 0, [hand[0]!]), hit("Y", "avoid", 0, [hand[2]!])])).toEqual([{}, {}]);
  });
});

import { buildDecisionInput } from "./rate-new.ts";
import { pairedSe, ratings, decide, topTwoUnresolved } from "./decide.ts";
import { LEAD_CONFIG } from "../lead/data.ts";
import { decidingMetric, parseLeadConfig } from "../lead/config.ts";
import configRaw from "../../data/lead-config.json";
import type { LeadContext } from "../rules/types.ts";

describe("IMP metric (expected duplicate score in IMPs)", () => {
  // 3NT by South, nobody vulnerable, 5 defence tricks set it: one down +50, made -400, made +1 -430.
  const contract = { level: 3, strain: "N", declarer: "S", doubled: "" } as const;
  const ctx = { hand: ["AS", "KH"], contractType: "NT", trump: null, features: new Set<string>(), roles: { declarer: [], shownAce: [] } } as unknown as LeadContext;
  const config = { ...LEAD_CONFIG, biases: [] };
  const src = (a: number[], b: number[]) => ({ options: [{ cards: ["AS"] as Card[], rep: "AS" as Card, tricks: a }, { cards: ["KH"] as Card[], rep: "KH" as Card, tricks: b }], need: 5, metric: "IMP" as const, ctx, hits: [], config, contract, vul: "none" as const });
  it("series are IMPs against the option with the best mean score; SEs are in IMPs", () => {
    // A scores 50, -400, -400, -430 (mean -295); B -400, 50, -400, -400 (mean -287.5): B is the reference. A - B: 450, -450, 0, -30 -> 10, -10, 0, -1 IMPs.
    const inp = buildDecisionInput(src([5, 4, 4, 3], [4, 5, 4, 4]));
    expect(inp.means).toEqual([-0.25, 0]);
    expect(inp.tieMeans).toEqual([0.25, 0.25]);
    expect(inp.se[0]![1]).toBeCloseTo(pairedSe([10, -10, 0, -1], [0, 0, 0, 0]), 12);
    expect(inp.unit).toBe(12);
    const d = decide(inp, { noiseK: 1.5, weightOf: () => 0, biasOn: () => true });
    expect(d.order).toEqual([1, 0]);
    expect(d.gap[0]).toBeCloseTo(0.25, 12);
    // Rating scale 3 IMPs: a 0.25 IMP loss is 92%.
    expect(ratings(d, LEAD_CONFIG.tieBreak.lossScale.IMP)).toEqual([92, 100]);
  });
  it("the adaptive test uses the same IMP series and the same noiseK (no separate margin)", () => {
    const inp = buildDecisionInput(src([5, 4, 4, 3], [4, 5, 4, 4]));
    const se = inp.se[0]![1]!;
    expect(0.25 <= 1.5 * se).toBe(true);
    expect(topTwoUnresolved(inp, LEAD_CONFIG.tieBreak.noiseK)).toBe(true);
    expect(topTwoUnresolved(inp, 0.25 / se - 1e-6)).toBe(false);
  });
  it("same P(defeat) but more undertricks wins at IMPs", () => {
    const inp = buildDecisionInput(src([6, 4], [5, 4]));
    expect(decide(inp, { noiseK: 0, weightOf: () => 0, biasOn: () => true }).best).toBe(0);
  });
});

describe("deciding metric and rating scale", () => {
  const c = { contractType: "NT" as const, levelClass: "game", sacrifice: false };
  it("IMPs at IMP scoring, the weights table at MPs, P(defeat) in defeat-only mode", () => {
    expect(decidingMetric(LEAD_CONFIG, { ...c, scoring: "IMP" })).toBe("IMP");
    expect(decidingMetric(LEAD_CONFIG, { ...c, scoring: "MP" })).toBe("Edef");
    expect(decidingMetric(LEAD_CONFIG, { ...c, levelClass: "grand_slam", scoring: "MP" })).toBe("Pdef");
    expect(decidingMetric(LEAD_CONFIG, { ...c, scoring: "IMP" }, true)).toBe("Pdef");
  });
  it("the rating scale comes from lead-config.json and has no hard-coded default", () => {
    expect({ Pdef: LEAD_CONFIG.tieBreak.lossScale.Pdef, Edef: LEAD_CONFIG.tieBreak.lossScale.Edef, IMP: LEAD_CONFIG.tieBreak.lossScale.IMP }).toEqual({ Pdef: 0.25, Edef: 0.5, IMP: 3 });
    const raw = structuredClone(configRaw) as { tieBreak: { lossScale: Record<string, unknown> } };
    delete raw.tieBreak.lossScale.IMP;
    expect(() => parseLeadConfig(raw)).toThrow("tieBreak.lossScale.IMP");
    expect(() => ratings({ order: [0], score: [0], value: [0], noise: [true] } as never, Number.NaN)).toThrow("rating scale");
  });
});

import { paramsOf } from "./rate-new.ts";
import { tieBreakSet, tieBreakWeight } from "../lead/config.ts";

describe("per-scoring-form tie-break weights", () => {
  const raw = structuredClone(configRaw) as { tieBreak: Record<string, unknown> };
  raw.tieBreak.familyWeights = { nt: 1, suit: 0, mpd: 0 };
  raw.tieBreak.weights = { "NT-050": 1 };
  raw.tieBreak.dropped = [];
  raw.tieBreak.biasOff = ["B1"];
  raw.tieBreak.byScoring = {
    IMP: { fit: "separate", familyWeights: { nt: 2, suit: 0.5, mpd: 0 }, weights: { "NT-050": 4 }, dropped: ["NT-012"], biasOff: ["B1", "B4"] },
    MP: { fit: "joint", familyWeights: { nt: 1, suit: 0, mpd: 0 }, weights: { "NT-050": 1 }, dropped: [], biasOff: ["B1"] },
  };
  const cfg = parseLeadConfig(raw);
  const rules = [{ rule: { id: "NT-050", source: { book_key: "nt" } } }, { rule: { id: "NT-012", source: { book_key: "nt" } } }, { rule: { id: "SU-001", source: { book_key: "suit" } } }] as never;
  it("the app takes the weights and the DD bias switches of the scoring form", () => {
    const imp = paramsOf(cfg, rules, "IMP");
    const mp = paramsOf(cfg, rules, "MP");
    expect([imp.weightOf("NT-050"), imp.weightOf("NT-012"), imp.weightOf("SU-001"), imp.weightOf("NT-099")]).toEqual([4, 0, 0.5, 0]);
    expect([mp.weightOf("NT-050"), mp.weightOf("NT-012"), mp.weightOf("SU-001")]).toEqual([1, 1, 0]);
    expect([imp.biasOn("B4"), mp.biasOn("B4"), imp.biasOn("B1"), mp.biasOn("B1")]).toEqual([false, true, false, false]);
    expect(imp.noiseK).toBe(mp.noiseK);
    expect(tieBreakWeight(cfg.tieBreak, "NT-001", "nt", "IMP")).toBe(2);
  });
  it("a form without its own entry uses the joint values", () => {
    const joint = parseLeadConfig({ ...raw, tieBreak: { ...raw.tieBreak, byScoring: { IMP: raw.tieBreak.byScoring && (raw.tieBreak.byScoring as Record<string, unknown>).IMP } } });
    expect(tieBreakSet(joint.tieBreak, "MP")).toEqual({ familyWeights: { nt: 1, suit: 0, mpd: 0 }, weights: { "NT-050": 1 }, dropped: [], biasOff: ["B1"] });
    expect(() => parseLeadConfig({ ...raw, tieBreak: { ...raw.tieBreak, byScoring: { XIMP: {} } } })).toThrow("not a scoring form");
  });
});
