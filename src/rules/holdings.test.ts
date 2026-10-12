import { describe, expect, it } from "vitest";
import { HAS_FULL_RULES } from "../test-support/book-data.ts";
import { calls, parseSymbolHand } from "../engine/test-data.ts";
import type { Seat } from "../engine/types.ts";
import { LEAD_CONFIG, LEAD_RULES, RULE_OVERLAYS } from "../lead/data.ts";
import { entriesOutside } from "./context.ts";
import { deriveContext } from "./context.ts";
import { analyse } from "../engine/hand.ts";
import { compileRules, evaluateRules } from "./engine.ts";
import type { Scoring } from "./types.ts";

const compiled = compileRules(LEAD_RULES, RULE_OVERLAYS);
const ef = LEAD_CONFIG.settings.evidenceFactor;

/** Hits of one rule for a hand: [recommended cards, avoided cards] and the weight of the first hit. */
function hits(id: string, auction: string, hand: string, scoring: Scoring = "IMP", dealer: Seat = "N") {
  const ctx = deriveContext({ hand: parseSymbolHand(hand), auction: calls(auction), dealer, vul: "none", scoring }, LEAD_CONFIG);
  const hs = evaluateRules(ctx, compiled, ef).hits.filter((h) => h.ruleId === id);
  return {
    rec: hs.filter((h) => h.kind === "recommend").flatMap((h) => h.cards),
    avoid: hs.filter((h) => h.kind === "avoid").flatMap((h) => h.cards),
    weights: hs.map((h) => h.weight),
    all: hs,
  };
}

const NT = "1N P 3N P P P";

describe.skipIf(!HAS_FULL_RULES)("machine-readable holdings of rulings 01 section 5", () => {
  it("NT-001: equal-length major and minor with the same honours: lead the major, the minor is avoided", () => {
    const h = hits("NT-001", NT, "QJ97 ♠ K72 ♥ QJ93 ♦ 65 ♣");
    expect(h.rec).toEqual(["QS", "JS", "9S", "7S"]);
    expect(h.avoid).toEqual(["QD", "JD", "9D", "3D"]);
  });
  it("NT-001: HCP within 1 is enough (K972 = 3, Q1093 = 2), a difference of 2 or unequal lengths is not", () => {
    expect(hits("NT-001", NT, "K972 ♠ 72 ♥ Q1093 ♦ 654 ♣").rec).toEqual(["KS", "9S", "7S", "2S"]);
    expect(hits("NT-001", NT, "AK72 ♠ 72 ♥ Q1093 ♦ 654 ♣").rec).toEqual([]);
    expect(hits("NT-001", NT, "QJ97 ♠ K72 ♥ QJ ♦ 6543 ♣").rec).toEqual([]);
  });
  it("NT-008: KJxxx minor, no A or Q, two side aces: 4th best", () => {
    const h = hits("NT-008", NT, "A7 ♠ 85 ♥ KJ963 ♦ AT72 ♣");
    expect(h.rec).toEqual(["6D"]);
    expect(hits("NT-008", NT, "A7 ♠ 85 ♥ KJ963 ♦ T742 ♣").rec).toEqual([]);
    expect(hits("NT-008", NT, "A7 ♠ 85 ♥ KQJ63 ♦ AT72 ♣").rec).toEqual([]);
    expect(hits("NT-008", NT, "A7 ♠ KJ963 ♥ 85 ♦ AT72 ♣").rec).toEqual([]);
  });
  it("NT-019: 5+ suit headed by the queen with an ace outside: 4th best", () => {
    expect(hits("NT-019", NT, "Q4 ♠ J976 ♥ A8 ♦ Q8743 ♣").rec).toEqual(["4C"]);
    expect(hits("NT-019", NT, "Q4 ♠ J976 ♥ Q8 ♦ Q8743 ♣").rec).toEqual([]);
    expect(hits("NT-019", NT, "Q4 ♠ J976 ♥ A8 ♦ K8743 ♣").rec).toEqual([]);
    expect(hits("NT-019", NT, "Q4 ♠ J976 ♥ A8 ♦ Q874 ♣ 3").rec).toEqual([]);
  });
  it("NT-023: AKxxxx with no A/K outside: low at IMPs, top at MPs, the other card avoided", () => {
    const imp = hits("NT-023", NT, "92 ♠ 74 ♥ AK7542 ♦ 964 ♣", "IMP");
    expect(imp.rec).toEqual(["2D"]);
    expect(imp.avoid).toEqual(["AD", "KD"]);
    const mp = hits("NT-023", NT, "92 ♠ 74 ♥ AK7542 ♦ 964 ♣", "MP");
    expect(mp.rec).toEqual(["AD"]);
    expect(mp.avoid).toEqual(["2D"]);
    expect(mp.all.every((x) => x.technical)).toBe(true);
    expect(hits("NT-023", NT, "A2 ♠ 74 ♥ AK7542 ♦ 964 ♣").rec).toEqual([]);
    expect(hits("NT-023", NT, "92 ♠ 74 ♥ AKQ542 ♦ 964 ♣").rec).toEqual([]);
    expect(hits("NT-023", NT, "92 ♠ 74 ♥ AK542 ♦ 9643 ♣").rec).toEqual([]);
  });
  it("NT-034: exactly AQxx in both majors: cash an ace", () => {
    const h = hits("NT-034", NT, "AQ82 ♠ AQ96 ♥ 973 ♦ JT ♣");
    expect(h.rec).toEqual(["AS", "AH"]);
    expect(hits("NT-034", NT, "AQ82 ♠ AQ9 ♥ 9753 ♦ JT ♣").rec).toEqual([]);
    expect(hits("NT-034", NT, "AQ82 ♠ AQ96 ♥ 973 ♦ JT ♣".replace("AQ96", "AK96")).rec).toEqual([]);
    expect(hits("NT-034", NT, "AQ82 ♠ AQ962 ♥ 97 ♦ JT ♣").rec).toEqual([]);
  });
  it("NT-045: AQJxx in the major shown in the Stayman reply: lead low, avoid the queen and the ace", () => {
    const h = hits("NT-045", "1N P 2C P 2S P 3N P P P", "AQJ42 ♠ 872 ♥ 763 ♦ 82 ♣");
    expect(h.rec).toEqual(["2S"]);
    expect(h.avoid).toEqual(["QS", "AS"]);
    expect(hits("NT-045", "1N P 2C P 2S P 3N P P P", "872 ♠ AQJ42 ♥ 763 ♦ 82 ♣").rec).toEqual([]);
    expect(hits("NT-045", "1N P 2C P 2H P 3N P P P", "AQJ42 ♠ 872 ♥ 763 ♦ 82 ♣").rec).toEqual([]);
    expect(hits("NT-045", "1N P 2C P 2S P 3N P P P", "AQ842 ♠ 872 ♥ 763 ♦ 82 ♣").rec).toEqual([]);
  });
  it("NT-067: KQJTxx in dummy's opened suit with no A/K outside is avoided (negative rule)", () => {
    const h = hits("NT-067", "1S P 1N P P P", "KQJT42 ♠ J876 ♥ 5 ♦ T8 ♣");
    expect(h.rec).toEqual([]);
    expect(h.avoid).toEqual(["KS", "QS", "JS", "TS", "4S", "2S"]);
    expect(h.weights).toEqual([-0.7]);
    expect(hits("NT-067", "1S P 1N P P P", "KQJT42 ♠ AJ76 ♥ 5 ♦ T8 ♣").avoid).toEqual([]);
    expect(hits("NT-067", "1H P 1N P P P", "KQJT42 ♠ J876 ♥ 5 ♦ T8 ♣").avoid).toEqual([]);
    expect(hits("NT-067", "1S P 1N P P P", "KQJ42 ♠ J8765 ♥ 5 ♦ T8 ♣").avoid).toEqual([]);
  });
  it("NT-101: among suits with no honour above the jack the longer is led low; equal length falls back to the normal rules", () => {
    const six = "1N P 6N P P P";
    const h = hits("NT-101", six, "J975 ♠ J8762 ♥ JT65 ♦ - ♣");
    expect(h.rec).toEqual(["2H"]);
    expect(h.avoid).toEqual(["JS", "9S", "7S", "5S", "JD", "TD", "6D", "5D"]);
    expect(hits("NT-101", six, "J975 ♠ J876 ♥ J6 ♦ 432 ♣").rec).toEqual([]);
    expect(hits("NT-101", six, "AJ75 ♠ J8762 ♥ JT6 ♦ - ♣").rec).toEqual(["2H"]);
    expect(hits("NT-101", six, "AK75 ♠ AK762 ♥ JT6 ♦ - ♣").rec).toEqual([]);
  });
  it("MP-007: a tip only, weight 0, never scores", () => {
    const h = hits("MP-007", "1S P 4S P P P", "QJ109 ♠ KQJ9 ♥ - ♦ 87654 ♣", "MP");
    expect(h.all).toHaveLength(1);
    expect(h.all[0]).toMatchObject({ kind: "tip", weight: 0, cards: [] });
    expect(hits("MP-007", "1S P 4S P P P", "QJ109 ♠ KQJ9 ♥ - ♦ 87654 ♣", "IMP").all).toEqual([]);
    expect(hits("MP-007", "1S P 4S P P P", "QJ109 ♠ KQJ ♥ 9 ♦ 87654 ♣", "MP").all).toEqual([]);
  });
  it("none of the nine is skipped; MP-007 is the one tip", () => {
    for (const id of ["NT-001", "NT-008", "NT-019", "NT-023", "NT-034", "NT-045", "NT-067", "NT-101"]) expect(compiled.find((c) => c.rule.id === id)!.status, id).toBe("full");
    expect(compiled.find((c) => c.rule.id === "MP-007")!.status).toBe("tip");
  });
});

describe.skipIf(!HAS_FULL_RULES)("per-scoring card and weight fields of rulings 01 section 6", () => {
  it("NT-005: the weight is 0 at IMPs (a tie) and 0.55 at MPs", () => {
    const hand = "43 ♠ 54 ♥ 9642 ♦ KQ832 ♣";
    expect(hits("NT-005", NT, hand, "IMP").weights).toEqual([0]);
    expect(hits("NT-005", NT, hand, "MP").weights[0]).toBe(0.55);
    expect(hits("NT-005", NT, hand, "MP").rec).toEqual(["4S", "5H"]);
  });
  it("NT-025: queen and 4th best both accepted at IMPs, the queen alone at MPs", () => {
    const hand = "QJ943 ♠ J74 ♥ A9 ♦ 874 ♣";
    expect(hits("NT-025", NT, hand, "IMP").rec).toEqual(["QS", "4S"]);
    expect(hits("NT-025", NT, hand, "MP").rec).toEqual(["QS"]);
  });
  it("NT-029: AQJxx low at IMPs, the queen at MPs, as a technical choice", () => {
    const hand = "872 ♠ AQJ42 ♥ 763 ♦ 82 ♣";
    expect(hits("NT-029", NT, hand, "IMP").rec).toEqual(["2H"]);
    expect(hits("NT-029", NT, hand, "MP").rec).toEqual(["QH"]);
    expect(hits("NT-029", NT, hand, "IMP").all.every((x) => x.technical)).toBe(true);
  });
  it("NT-077: half weight at IMPs, full weight at MPs", () => {
    const auction = "1H 1N P 3N P P P";
    const hand = "JT983 ♠ K3 ♥ T753 ♦ 97 ♣";
    const recWeight = (sc: Scoring) => hits("NT-077", auction, hand, sc).all.find((x) => x.kind === "recommend")!.weight;
    expect(recWeight("IMP")).toBe(0.2);
    expect(recWeight("MP")).toBe(0.4);
    expect(hits("NT-077", auction, hand, "MP").rec).toEqual(["JS"]);
  });
});

describe("few entries (rulings 01 section 7): aces + kings of Kx or longer outside the led suit, few = 0 or 1", () => {
  const entries = (hand: string) => entriesOutside(analyse(parseSymbolHand(hand)));
  it("counts aces and Kx, not a singleton king, and never the led suit", () => {
    expect(entries("AQ2 ♠ K82 ♥ K3 ♦ 7654 ♣")).toEqual({ S: 2, H: 2, D: 2, C: 3 });
    expect(entries("A52 ♠ K ♥ KJ3 ♦ 7654 ♣")).toEqual({ S: 1, H: 2, D: 1, C: 2 });
  });
  it.skipIf(!HAS_FULL_RULES)("MP-008 (Kxxxx, few entries) fires only for a suit led with at most one entry outside", () => {
    const few = hits("MP-008", "1H P 4H P P P", "K9872 ♠ A5 ♥ 7654 ♦ 32 ♣", "MP");
    expect(few.rec).toEqual(["KS"]);
    expect(hits("MP-008", "1H P 4H P P P", "K9872 ♠ A5 ♥ K654 ♦ A2 ♣", "MP").rec).toEqual([]);
  });
});
