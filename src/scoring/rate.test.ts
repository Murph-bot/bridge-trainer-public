import { describe, expect, it } from "vitest";
import { HAS_FULL_RULES } from "../test-support/book-data.ts";
import { calls, parseSymbolHand } from "../engine/test-data.ts";
import type { Card, Contract, Deal } from "../engine/types.ts";
import { LEAD_CONFIG, LEAD_RULES, CARD_CHOICE_RAW, PARTNERSHIP_CARDING_RAW, RULE_OVERLAYS } from "../lead/data.ts";
import { parseBookTable, parsePartnershipTable } from "../rules/carding.ts";
import { deriveContext } from "../rules/context.ts";
import { compileRules } from "../rules/engine.ts";
import type { LeadRule } from "../rules/types.ts";
import { groupOptions } from "./options.ts";
import { rateLead } from "./rate.ts";
import type { RateInput } from "./rate.ts";

const hand = parseSymbolHand("QJ1094 ♠ K82 ♥ 963 ♦ 75 ♣");
const contract: Contract = { level: 3, strain: "N", declarer: "N", doubled: "" };
const tables = { partnership: parsePartnershipTable(PARTNERSHIP_CARDING_RAW), book: parseBookTable(CARD_CHOICE_RAW) };
const ctxOf = (scoring: "IMP" | "MP") => deriveContext({ hand, auction: calls("1N P 3N P P P"), dealer: "N", vul: "none", scoring }, LEAD_CONFIG);

/** Defence tricks on three deals, per lead (hand-built). */
const COLS: Record<string, [number, number, number]> = {
  QS: [5, 5, 5], JS: [5, 5, 5], TS: [5, 5, 5], "9S": [5, 5, 5],
  "4S": [4, 4, 4],
  KH: [3, 3, 4], "8H": [4, 4, 4], "2H": [4, 4, 4],
  "9D": [4, 5, 5], "6D": [4, 4, 3], "3D": [4, 4, 3],
  "7C": [5, 3, 4], "5C": [5, 3, 4],
};
const dd = [0, 1, 2].map((i) => Object.fromEntries(Object.entries(COLS).map(([c, v]) => [c, v[i]!]))) as Record<Card, number>[];

const input = (userCard: Card, scoring: "IMP" | "MP", rules: LeadRule[] = []): RateInput => ({
  deals: [{}, {}, {}] as Deal[],
  dd,
  contract,
  vul: "none",
  scoring,
  userCard,
  leaderHand: hand,
  ctx: ctxOf(scoring),
  weights: { dd: 0.7, rules: 0.3 },
  config: LEAD_CONFIG,
  rules: compileRules(rules),
  cards: tables,
});

describe("lead options (B8)", () => {
  it("groups touching cards and equal-DD spot cards", () => {
    const col = (c: Card) => COLS[c]!;
    const opts = groupOptions(hand, col).map((o) => o.cards.join(""));
    expect(opts).toEqual(["QSJSTS9S", "4S", "KH", "8H2H", "9D", "6D3D", "7C5C"]);
  });
});

describe("acceptance: T9 scoring on a hand-built 3-deal fixture", () => {
  it("IMPs: best option Q♠ after the B1 correction (Pdef 100% -> 98.5%, Edef 5 -> 4.98)", () => {
    const r = rateLead(input("QS", "IMP"));
    expect(r.pDefUserRaw).toBe(1);
    expect(r.pDefUser).toBeCloseTo(0.985, 10);
    expect(r.eDefUserRaw).toBe(5);
    expect(r.eDefUser).toBeCloseTo(4.98, 10);
    expect(r.biases.map((b) => b.id)).toEqual(["B1"]);
    expect(r.bestCard).toBe("QS");
    expect(r.lossUser).toBe(0);
    expect(r.sDD).toBe(1);
    expect(r.sR).toBe(1);
    expect(r.ratingPct).toBe(100);
    expect(r.equalBest).toBe(true);
    expect(r.n).toBe(3);
  });
  it("IMPs: ♠4 loses 10 IMPs per deal against the best option, sDD 0", () => {
    const r = rateLead(input("4S", "IMP"));
    expect(r.pDefUser).toBe(0);
    expect(r.eDefUser).toBe(4);
    expect(r.pDefBest).toBeCloseTo(0.985, 10);
    expect(r.eDefBest).toBeCloseTo(4.98, 10);
    expect(r.lossUser).toBe(10);
    expect(r.seLossUser).toBe(0);
    expect(r.sDD).toBe(0);
    expect(r.equalBest).toBe(false);
    expect(r.ratingPct).toBe(30);
    expect(r.top.map((t) => t.card)).toEqual(["QS", "9D", "7C"]);
    expect(r.top[0]).toMatchObject({ pDef: expect.closeTo(0.985, 10), eDef: expect.closeTo(4.98, 10), loss: 0 });
    expect(r.top[1]!.loss).toBeCloseTo(10 / 3, 10);
  });
  it("IMPs: ♦9 trails by 3.33 IMPs but inside 2 SE (SE 3.33), so equal best within sampling noise", () => {
    const r = rateLead(input("9D", "IMP"));
    expect(r.pDefUser).toBeCloseTo(2 / 3, 10);
    expect(r.eDefUser).toBeCloseTo(14 / 3, 10);
    expect(r.lossUser).toBeCloseTo(10 / 3, 10);
    expect(r.seLossUser).toBeCloseTo(10 / 3, 10);
    expect(r.sDD).toBe(1);
    expect(r.equalBest).toBe(true);
    expect(r.cardPenalty).toMatchObject({ applied: true, agreedCard: "6D" });
    expect(r.ratingPct).toBe(94);
  });
  it("a card of the same touching group has the same DD result; J from QJT94 differs only from the lead-card-choice book (Q), so it is never penalised", () => {
    const r = rateLead(input("JS", "IMP"));
    expect(r.sDD).toBe(1);
    expect(r.pDefUser).toBeCloseTo(0.985, 10);
    expect(r.cardPenalty).toEqual({ applied: false, agreed: null, agreedCard: null });
    expect(r.ratingPct).toBe(100);
  });
  it("MPs: match-point fraction 5/6 for Q♠ against 4/9 for ♠4, loss 0.3889 > L_MP, sDD 0", () => {
    const best = rateLead(input("QS", "MP"));
    expect(best.sDD).toBe(1);
    const r = rateLead(input("4S", "MP"));
    expect(r.lossUser).toBeCloseTo(5 / 6 - 4 / 9, 10);
    expect(r.seLossUser).toBeCloseTo(0.027778, 5);
    expect(r.sDD).toBe(0);
    expect(r.ratingPct).toBe(30);
    expect(r.top[0]!.card).toBe("QS");
  });
});

describe("card choice when the user leads (rulings 01 section 4)", () => {
  const h2 = parseSymbolHand("92 ♠ 74 ♥ AK7542 ♦ 964 ♣");
  const flat = Object.fromEntries(h2.map((c) => [c, 4])) as Record<Card, number>;
  const withRules = (rules: ReturnType<typeof compileRules>): RateInput => ({
    deals: [{}, {}, {}] as Deal[],
    dd: [flat, flat, flat],
    contract,
    vul: "none",
    scoring: "IMP",
    userCard: "2D",
    leaderHand: h2,
    ctx: deriveContext({ hand: h2, auction: calls("1N P 3N P P P"), dealer: "N", vul: "none", scoring: "IMP" }, LEAD_CONFIG),
    weights: { dd: 0.7, rules: 0.3 },
    config: LEAD_CONFIG,
    rules,
    cards: tables,
  });
  it("the partnership table is the card agreement: AKxxxx in NT says A, so a different card with the same DD value is penalised", () => {
    const r = rateLead(withRules([]));
    expect(r.cardPenalty).toMatchObject({ applied: true, agreedCard: "AD" });
    expect(r.cardPenalty.agreed).toMatchObject({ source: "partnership" });
  });
  it.skipIf(!HAS_FULL_RULES)("NT-023 (technical top vs low) overrides the table: low from AKxxxx at IMPs is not penalised", () => {
    const r = rateLead(withRules(compileRules(LEAD_RULES, RULE_OVERLAYS)));
    expect(r.cardPenalty).toEqual({ applied: false, agreed: null, agreedCard: null });
    expect(r.allHits.filter((h) => h.ruleId === "NT-023").map((h) => h.kind)).toEqual(["recommend", "avoid"]);
  });
  it("a non-technical book rule credits the whole suit, so the card within it is the carding table's business", () => {
    const rule: LeadRule = { ...KXX_RULE, id: "TEST-002", conditions: { ...KXX_RULE.conditions, holding: { patterns: ["AKxxxx"], suit_role: "any" } }, recommendation: { ...KXX_RULE.recommendation, card: "ace" }, preference_over: [] };
    const hit = rateLead(withRules(compileRules([rule]))).allHits[0]!;
    expect(hit).toMatchObject({ kind: "recommend", cards: ["AD"], suitWide: true });
    expect(rateLead(withRules(compileRules([rule]))).sR).toBe(1);
    expect(rateLead(withRules(compileRules([rule]))).ruleHits).toEqual([{ ruleId: "TEST-002", source: "Test book p.7" }]);
  });
});

const KXX_RULE: LeadRule = {
  id: "TEST-001",
  contract_type: "NT",
  conditions: { level: "game", auction: { features: ["any_NT"], sequences: [] }, holding: { patterns: ["Kxx"], suit_role: "any" }, hand_strength: "any", scoring: "both" },
  recommendation: { lead_suit: "side suit", card: "low", text: "Lead low from Kxx against notrump." },
  preference_over: ["minor"],
  weight: 0.8,
  evidence: { type: "simulation", stat: null },
  source: { book: "Test book", book_key: "nt", chapter: 1, page: 7 },
};

describe("sR from rule hits", () => {
  it("normalises R over the options: +0.8 for the low heart, -0.8 for the minors", () => {
    const r = rateLead(input("4S", "IMP", [KXX_RULE]));
    expect(r.sR).toBeCloseTo(0.5, 10);
    expect(r.ruleHits).toEqual([]);
    expect(r.ratingPct).toBe(Math.round(100 * (0.7 * 0 + 0.3 * 0.5)));
    const m = rateLead(input("9D", "IMP", [KXX_RULE]));
    expect(m.sR).toBe(0);
    expect(m.ruleHits).toEqual([{ ruleId: "TEST-001", source: "Test book p.7" }]);
    expect(m.ratingPct).toBe(70);
  });
  it("cards of the best group score 1 with the right card and 0.8x with the wrong spot", () => {
    const right = rateLead(input("2H", "IMP", [KXX_RULE]));
    expect(right.sR).toBe(1);
    expect(right.cardPenalty.applied).toBe(false);
    expect(right.ratingPct).toBe(30);
    const wrong = rateLead(input("8H", "IMP", [KXX_RULE]));
    expect(wrong.cardPenalty).toMatchObject({ applied: true, agreedCard: "2H" });
    expect(wrong.sREffective).toBeCloseTo(0.8, 10);
    expect(wrong.ratingPct).toBe(24);
  });
  it("evidence factor: author advice counts 0.6", () => {
    const adv: LeadRule = { ...KXX_RULE, evidence: { type: "author_advice", stat: null } };
    const r = rateLead(input("2H", "IMP", [adv]));
    expect(r.allHits.map((h) => h.weight)).toEqual([expect.closeTo(0.48, 10), expect.closeTo(-0.48, 10)]);
  });
});
