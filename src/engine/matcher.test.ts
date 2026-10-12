import { describe, expect, it } from "vitest";
import { inferConstraints } from "./constraints.ts";
import { analyse, parseDotted, satisfies } from "./hand.ts";
import { candidates, patternMatches, specificity, vulMatches } from "./matcher.ts";
import { OPPS, SS } from "./test-data.ts";
import type { Call, Rule, SystemFile } from "./types.ts";

const rule = (id: string, auction: string[], call: string, extra: Partial<Rule["context"]> = {}, priority = 50): Rule => ({
  id,
  category: "opening",
  context: { auction, ...extra },
  call: call as Call,
  meaning: { en: id },
  shows: {},
  forcing: "NF",
  alertable: false,
  artificial: false,
  priority,
  inferable: true,
  source: { file: "t", section: "t" },
  confidence: "source",
});

const sys = (rules: Rule[]): SystemFile => ({ meta: { name: "t", version: "0", profile: "t", constraintConventions: { hcpSlack: 1 } }, rules });

describe("acceptance: T2 matcher", () => {
  it("P* 1N P ? matches 1N P and P P 1N P but not 1N X", () => {
    const pat = ["P*", "1N", "P", "?"];
    expect(patternMatches(pat, ["1N", "P"])).toBe(true);
    expect(patternMatches(pat, ["P", "P", "1N", "P"])).toBe(true);
    expect(patternMatches(pat, ["1N", "X"])).toBe(false);
    expect(patternMatches(pat, ["P", "X", "1N", "P"])).toBe(false);
  });
  it("without P* the prefix must match exactly", () => {
    expect(patternMatches(["1N", "P", "?"], ["1N", "P"])).toBe(true);
    expect(patternMatches(["1N", "P", "?"], ["P", "1N", "P"])).toBe(false);
    expect(patternMatches(["?"], [])).toBe(true);
    expect(patternMatches(["P*", "?"], ["P", "P", "P"])).toBe(true);
    expect(patternMatches(["P*", "?"], ["P", "1C"])).toBe(false);
  });
  it("specificity counts concrete tokens, absence of P*, seats and actorPassedHand", () => {
    expect(specificity(rule("a", ["P*", "1N", "P", "?"], "2C"))).toBe(2);
    expect(specificity(rule("a", ["1N", "P", "?"], "2C"))).toBe(3);
    expect(specificity(rule("a", ["1N", "P", "?"], "2C", { seats: [1] }))).toBe(4);
    expect(specificity(rule("a", ["P*", "1N", "P", "?"], "2C", { actorPassedHand: true }))).toBe(3);
  });
  it("a rule with actorPassedHand: true beats a P* rule for the same call", () => {
    const s = sys([rule("plain", ["P*", "1H", "?"], "2H"), rule("passed", ["P*", "1H", "?"], "2H", { actorPassedHand: true })]);
    expect(candidates(s, { prefix: ["P", "P", "1H"], seatNo: 4, passed: true }).get("2H")!.id).toBe("passed");
    expect(candidates(s, { prefix: ["1H"], seatNo: 2, passed: false }).get("2H")!.id).toBe("plain");
  });
  it("seats restrict, a more specific rule beats a general one, priority breaks ties", () => {
    const s = sys([rule("gen", ["P*", "?"], "1C", {}, 10), rule("seat1", ["?"], "1C", { seats: [1] }, 10), rule("hi", ["P*", "?"], "1D", {}, 60), rule("lo", ["P*", "?"], "1D", {}, 20)]);
    expect(candidates(s, { prefix: [], seatNo: 1, passed: false }).get("1C")!.id).toBe("seat1");
    expect(candidates(s, { prefix: ["P"], seatNo: 2, passed: false }).get("1C")!.id).toBe("gen");
    expect(candidates(s, { prefix: [], seatNo: 1, passed: false }).get("1D")!.id).toBe("hi");
  });
  it("vul filter is optional and side-relative", () => {
    const s = sys([rule("v", ["?"], "1C", { vul: "we-vul" })]);
    expect(candidates(s, { prefix: [], seatNo: 1, passed: false }).has("1C")).toBe(true);
    expect(candidates(s, { prefix: [], seatNo: 1, passed: false, vul: [true, false] }).has("1C")).toBe(true);
    expect(candidates(s, { prefix: [], seatNo: 1, passed: false, vul: [false, true] }).has("1C")).toBe(false);
    expect(vulMatches("any", false, false)).toBe(true);
    expect(vulMatches("none-vul", false, false)).toBe(true);
    expect(vulMatches("both-vul", true, false)).toBe(false);
  });
  it("real system: 1N P ? has the Stayman rule for the actual calls", () => {
    const c = candidates(SS, { prefix: ["1N", "P"], seatNo: 3, passed: false });
    expect(c.get("2C")!.id).toBe("nt1.2C");
    expect(candidates(OPPS, { prefix: [], seatNo: 1, passed: false }).get("1N")!.id).toBe("open.1N");
  });
});

describe("acceptance: T4 sibling negation", () => {
  const violations = (hand: string): number => {
    const got = inferConstraints({ auction: ["1C"], dealer: "N", leader: "E", profiles: { N: SS, E: SS, S: SS, W: SS } });
    const info = analyse(parseDotted(hand));
    expect(satisfies({ len: { C: [4, 13] }, hcp: got.N.hard.hcp }, info)).toBe(true);
    return got.N.soft.none.filter((n) => satisfies(n.shows, info)).length;
  };
  it("1C denies the 1NT hand: 16-count 4-3-3-3 with 4 clubs is one soft violation", () => {
    expect(violations("AKQ.KJ2.Q32.J432")).toBe(1);
    const got = inferConstraints({ auction: ["1C"], dealer: "N", leader: "E", profiles: { N: SS, E: SS, S: SS, W: SS } });
    expect(got.N.rules).toEqual(["open.1C"]);
    const info = analyse(parseDotted("AKQ.KJ2.Q32.J432"));
    expect(got.N.soft.none.filter((n) => satisfies(n.shows, info)).map((n) => n.from)).toEqual(["open.1N"]);
  });
  it("a 12-count 4-3-3-3 with 4 clubs is zero violations", () => {
    expect(violations("QJ2.K32.Q32.KJ43")).toBe(0);
  });
});
