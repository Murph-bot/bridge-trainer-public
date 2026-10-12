import { describe, expect, it } from "vitest";
import { HAS_FULL_RULES } from "../test-support/book-data.ts";
import { calls, parseSymbolHand } from "../engine/test-data.ts";
import type { Rank } from "../engine/types.ts";
import { LEAD_CONFIG, LEAD_RULES, CARD_CHOICE_RAW, PARTNERSHIP_CARDING_RAW, RULE_OVERLAYS } from "../lead/data.ts";
import { agreedCard, parseBookTable, parsePartnershipTable } from "./carding.ts";
import { deriveContext } from "./context.ts";
import { compileRule, compileRules, coverage, evaluateRules } from "./engine.ts";
import { FEATURE_NAMES } from "./features.ts";
import { parseCardSelector, parseDescriptor, parseHolding } from "./patterns.ts";
import type { LeadContext, Scoring } from "./types.ts";

const HAND = parseSymbolHand("QJ1094 ♠ K82 ♥ 963 ♦ 75 ♣");
const ctx = (auction: string, dealer: "N" | "E" | "S" | "W" = "N", scoring: Scoring = "IMP", hand = HAND, disciplined = false): LeadContext =>
  deriveContext({ hand, auction: calls(auction), dealer, vul: "none", scoring, disciplined }, LEAD_CONFIG);
const on = (c: LeadContext): string[] => [...c.features].sort();

describe("auction features", () => {
  it("1NT-3NT", () => {
    const c = ctx("1N P 3N P P P");
    expect(c.contractCode).toBe("3NT");
    expect(c.levelClass).toBe("game");
    expect(on(c)).toEqual(["1NT-3NT", "any_NT", "declarer_opened_1NT", "no_stayman", "no_transfer", "weak_hand"]);
    expect(c.handStrength).toBe("weak");
  });
  it("Stayman, denied major", () => {
    const c = ctx("1N P 2C P 2D P 3N P P P");
    expect(c.features.has("stayman_used")).toBe(true);
    expect(c.features.has("stayman_denied_major")).toBe(true);
    expect(c.features.has("stayman_major_shown")).toBe(false);
    expect(c.features.has("1NT-3NT")).toBe(false);
    expect(c.features.has("no_stayman")).toBe(false);
  });
  it("Stayman, major shown", () => {
    expect(ctx("1N P 2C P 2S P 3N P P P").features.has("stayman_major_shown")).toBe(true);
  });
  it("Jacoby transfer: dummy's suit is the transfer major", () => {
    const c = ctx("1N P 2D P 2H P 3N P P P");
    expect(c.features.has("transfer")).toBe(true);
    expect(c.roles.transfer).toBe("H");
    expect(c.roles.dummy).toEqual(["H"]);
    expect(c.features.has("dummy_bid_side_suit")).toBe(true);
    expect(c.features.has("dummy_suit_breaks_well")).toBe(false);
    expect(ctx("1N P 2D P 2H P 3N P P P", "N", "IMP", parseSymbolHand("QJ1094 ♠ K8 ♥ 9632 ♦ 75 ♣")).features.has("dummy_suit_breaks_well")).toBe(true);
    expect(c.roles.unbid).toEqual(["S", "D", "C"]);
  });
  it("1NT-2NT-3NT: limit raise, accepted", () => {
    const c = ctx("1N P 2N P 3N P P P");
    expect(c.features.has("limit_raise_2NT")).toBe(true);
    expect(c.features.has("accepted")).toBe(true);
    expect(ctx("1N P 2N P P P").features.has("accepted")).toBe(false);
    expect(ctx("1N P 2N P P P").levelClass).toBe("partscore");
  });
  it("passed-out notrump partscores", () => {
    expect(ctx("1N P P P").features.has("1NT_passout")).toBe(true);
    expect(ctx("2N P P P").features.has("2NT_passout")).toBe(true);
    expect(ctx("1N P 6N P P P").features.has("6NT")).toBe(true);
  });
  it("splinter and pre-emptive raise", () => {
    const sp = ctx("1S P 4C P 4S P P P");
    expect(sp.features.has("splinter")).toBe(true);
    expect(sp.features.has("dummy_promised_shortness")).toBe(true);
    expect(sp.roles.splinter).toBe("C");
    const pre = ctx("1S P 4S P P P");
    expect(pre.features.has("preemptive_raise")).toBe(true);
    expect(pre.features.has("one_suit_auction")).toBe(true);
    expect(pre.features.has("splinter")).toBe(false);
  });
  it("slams: cue-bid vs undisciplined; the user can mark an auction disciplined", () => {
    expect(ctx("1S P 3S P 4C P 4D P 6S P P P").features.has("cue_bid_auction")).toBe(true);
    const blast = ctx("1H P 6H P P P");
    expect(blast.features.has("undisciplined_slam")).toBe(true);
    expect(blast.features.has("cue_bid_auction")).toBe(false);
    expect(blast.features.has("small_slam")).toBe(true);
    const marked = ctx("1H P 6H P P P", "N", "IMP", HAND, true);
    expect(marked.features.has("cue_bid_auction")).toBe(true);
    expect(marked.features.has("undisciplined_slam")).toBe(false);
    expect(ctx("1H P 7H P P P").features.has("grand_slam")).toBe(true);
  });
  it("competitive partscore: leader's side bid and raised a suit", () => {
    const c = ctx("P 1H 1S 2H 2S P P P", "N");
    expect(c.leader).toBe("W");
    expect(c.contractCode).toBe("2S");
    expect(c.features.has("competitive_partscore")).toBe(true);
    expect(c.features.has("own_suit_raised")).toBe(true);
    expect(c.features.has("partner_bid_suit")).toBe(true);
    expect(c.roles.partner).toEqual(["H"]);
  });
  it("hand strength, MP scoring and void features", () => {
    expect(ctx("1N P 3N P P P", "N", "IMP", parseSymbolHand("QJ1094 ♠ K82 ♥ J63 ♦ 75 ♣")).handStrength).toBe("normal");
    const weak = parseSymbolHand("J5432 ♠ 7632 ♥ 984 ♦ 5 ♣");
    const c = ctx("1N P 3N P P P", "N", "MP", weak);
    expect(c.handStrength).toBe("weak");
    expect(["weak_hand", "mp_scoring"].every((f) => c.features.has(f))).toBe(true);
    expect(c.fewEntries).toEqual({ S: true, H: true, D: true, C: true });
    expect(ctx("1S P 4S P P P", "N", "IMP", parseSymbolHand("AKQJ109 ♠ KQJ ♥ KQ ♦ 87 ♣")).handStrength).toBe("strong");
    expect(ctx("1S P 4S P P P", "N", "IMP", parseSymbolHand("QJ109 ♠ KQJ9 ♥ - ♦ 87654 ♣")).features.has("void_held")).toBe(true);
  });
  it("every feature string of lead-rules.json is in the vocabulary", () => {
    const used = new Set(LEAD_RULES.flatMap((r) => r.conditions.auction.features));
    expect([...used].filter((f) => !(FEATURE_NAMES as readonly string[]).includes(f))).toEqual([]);
    expect(FEATURE_NAMES).toHaveLength(51);
  });
});

describe("holding patterns", () => {
  const m = (pat: string, holding: string, c: LeadContext = ctx("1N P 3N P P P")) => parseHolding(pat)!.matches({ suit: "H", ranks: [...holding.replace("10", "T")] as Rank[] }, c);
  it("matches exact holdings with x = spot card and H = honour", () => {
    expect(m("Axx", "A73")).toBe(true);
    expect(m("Axx", "AQ3")).toBe(false);
    expect(m("Axx", "A732")).toBe(false);
    expect(m("Hxxx", "Q732")).toBe(true);
    expect(m("HHxx", "KJ32")).toBe(true);
    expect(m("KQ9xx", "KQ973")).toBe(true);
    expect(m("QJTx", "QJ104")).toBe(true);
    expect(m("xx", "93")).toBe(true);
    expect(m("xx", "T3")).toBe(false);
    expect(m("singleton", "K")).toBe(true);
    expect(m("singleton J/Q/K", "Q")).toBe(true);
    expect(m("singleton J/Q/K", "A")).toBe(false);
    expect(m("xx/xxx/Kxx", "K42")).toBe(true);
  });
  it("applies role qualifiers", () => {
    const c = ctx("1N P 3N P P P");
    expect(parseHolding("xx (major)")!.matches({ suit: "H", ranks: ["7", "2"] }, c)).toBe(true);
    expect(parseHolding("xx (major)")!.matches({ suit: "C", ranks: ["7", "2"] }, c)).toBe(false);
    expect(parseHolding("trump: xx")!.matches({ suit: "H", ranks: ["7", "2"] }, c)).toBe(false);
    const comp = ctx("P 1H 1S 2H 2S P P P");
    expect(parseHolding("Kx in partner suit")!.matches({ suit: "H", ranks: ["K", "2"] }, comp)).toBe(true);
    expect(parseHolding("Kx in partner suit")!.matches({ suit: "C", ranks: ["K", "2"] }, comp)).toBe(false);
  });
  it("returns null, not an exception, for notation it does not know", () => {
    expect(parseHolding("similar holdings in a major and a minor")).toBeNull();
    expect(parseHolding("Axx (not AQ/AJ)")).toBeNull();
    expect(parseDescriptor("shorter stronger suit")).toBeNull();
  });
  it("reads card selectors by scoring", () => {
    expect(parseCardSelector("low (IMPs) / top (MPs)", "IMP").kinds).toEqual(["low"]);
    expect(parseCardSelector("low (IMPs) / top (MPs)", "MP").kinds).toEqual(["top"]);
    expect(parseCardSelector("ace", "IMP")).toEqual({ kinds: ["ace"], resolved: true });
    expect(parseCardSelector("gibberish", "IMP")).toEqual({ kinds: ["any"], resolved: false });
  });
});

describe("rule engine on lead-rules.json", () => {
  const compiled = compileRules(LEAD_RULES, RULE_OVERLAYS);
  const ef = LEAD_CONFIG.settings.evidenceFactor;
  const hitsOf = (c: LeadContext) => evaluateRules(c, compiled, ef);

  it.skipIf(!HAS_FULL_RULES)("1NT-3NT: NT-003 (passive short major) fires for a doubleton major, with its weight", () => {
    const h = parseSymbolHand("93 ♠ KQ932 ♥ J63 ♦ 75 ♣");
    const c = ctx("1N P 3N P P P", "N", "IMP", h);
    const nt3 = hitsOf(c).hits.find((x) => x.ruleId === "NT-003")!;
    expect(nt3).toMatchObject({ kind: "recommend", cards: ["9S", "3S"] });
    expect(nt3.weight).toBe(LEAD_RULES.find((r) => r.id === "NT-003")!.weight);
  });
  it("applies the evidence factor 0.6 to author-advice rules", () => {
    const mp = LEAD_RULES.find((r) => r.evidence.type === "author_advice")!;
    const c = compileRule(mp);
    expect(c.status).not.toBe("skipped");
    const w = { simulation: 1, author_advice: 0.6 };
    const probe = [{ ...c }];
    expect(evaluateRules(ctx("1N P 3N P P P"), probe, w).hits.every((h) => Math.abs(h.weight) <= mp.weight * 0.6 + 1e-12)).toBe(true);
  });
  it.skipIf(!HAS_FULL_RULES)("scoring filter: MPs rules do not fire at IMPs", () => {
    const h = parseSymbolHand("QJ ♠ K9532 ♥ 963 ♦ 75 ♣");
    const imp = hitsOf(ctx("1N P 3N P P P", "N", "IMP", h)).hits.map((x) => x.ruleId);
    const mpHits = hitsOf(ctx("1N P 3N P P P", "N", "MP", h)).hits.map((x) => x.ruleId);
    expect(imp).not.toContain("MP-001");
    expect(mpHits).toContain("MP-001");
  });
  it("never throws on rules it cannot read: they are skipped and reported", () => {
    const unknown = { ...LEAD_RULES[0]!, conditions: { ...LEAD_RULES[0]!.conditions, auction: { features: ["no_such_feature"], sequences: [] } } };
    const cr = compileRule(unknown);
    expect(cr.status).toBe("skipped");
    expect(cr.reasons[0]).toBe('unknown feature "no_such_feature"');
    const bad = { ...LEAD_RULES[0]!, conditions: { ...LEAD_RULES[0]!.conditions, holding: { patterns: ["???"], suit_role: "any" } } };
    expect(compileRule(bad).status).toBe("skipped");
    expect(compileRule(bad).reasons).toContain('unparsed pattern "???"');
    expect(evaluateRules(ctx("1N P 3N P P P"), [cr, compileRule(bad)], ef).hits).toEqual([]);
  });
  it.skipIf(!HAS_FULL_RULES)("coverage report: counts of machine-matchable rules", () => {
    const cov = coverage(compiled);
    expect(cov.total).toBe(214);
    expect(cov.full + cov.partial + cov.skipped + cov.tip).toBe(214);
    expect(cov.full).toBe(164);
    expect(cov.partial).toBe(49);
    expect(cov.skipped).toBe(0);
    expect(cov.tip).toBe(1);
    expect(cov.rules.find((r) => r.status === "tip")!.id).toBe("MP-007");
  });
  it.skipIf(!HAS_FULL_RULES)("without the rulings overlay the nine holdings are skipped, as before", () => {
    const plain = coverage(compileRules(LEAD_RULES));
    expect(plain.skipped).toBe(9);
    expect(plain.full).toBe(156);
  });
});

describe("acceptance: T11 card choice", () => {
  const tables = { partnership: parsePartnershipTable(PARTNERSHIP_CARDING_RAW), book: parseBookTable(CARD_CHOICE_RAW) };
  const card = (holding: string, type: "NT" | "suit"): string => agreedCard(tables, [...holding.replace("10", "T")] as Rank[], type, "IMP", "side")!.ranks.join("");
  it.each([
    ["KQJ4", "K"],
    ["J109", "J"],
    ["K1094", "T"],
    ["8642", "6"],
    ["K852", "2"],
    ["Q73", "3"],
    ["T983", "9"],
    ["9852", "8"],
    ["K8532", "3"],
    ["T852", "8"],
  ])("%s -> %s against NT and against a suit (partnership table, rows %#)", (holding, want) => {
    expect(card(holding, "NT")).toBe(want);
    expect(card(holding, "suit")).toBe(want);
  });
  it("optional agreements are off unless a setting turns them on", () => {
    const row = (holding: string, type: "NT" | "suit", options?: { reverseAK: boolean; rusinow: boolean }) => agreedCard({ ...tables, options }, [...holding.replace("10", "T")] as Rank[], type, "IMP", "side")!.ranks.join("");
    expect(row("AKx", "suit")).toBe("A");
    expect(row("AKx", "suit", { reverseAK: true, rusinow: false })).toBe("K");
    expect(row("AK", "suit", { reverseAK: true, rusinow: false })).toBe("A");
    expect(row("AKxxxx", "NT", { reverseAK: true, rusinow: false })).toBe("K");
    expect(row("KQx", "suit")).toBe("K");
    expect(row("KQx", "suit", { reverseAK: false, rusinow: true })).toBe("Q");
    expect(row("QJx", "NT", { reverseAK: false, rusinow: true })).toBe("J");
    expect(row("AKx", "NT", { reverseAK: false, rusinow: true })).toBe("K");
    expect(LEAD_CONFIG.settings.optionalCarding).toEqual({ reverseAK: false, rusinow: false });
  });
  it.each([
    ["AK", "suit", "K"],
    ["AK", "NT", "A"],
    ["AK2", "suit", "A"],
    ["AK72", "suit", "A"],
    ["AK752", "suit", "A"],
    ["AK7542", "suit", "A"],
    ["AK2", "NT", "K"],
    ["AK72", "NT", "K"],
    ["AK752", "NT", "A"],
    ["A2", "suit", "A"],
    ["KQ", "suit", "K"],
  ])("G-LEAD-1: %s against %s -> %s", (holding, type, want) => {
    expect(card(holding, type as "NT" | "suit")).toBe(want);
  });
  it("bare AK: K only against a suit; the generic doubleton row (top card) applies against NT because 'AK, AKx, AKxx' is not length-qualified", () => {
    expect(card("AK", "suit")).toBe("K");
    expect(card("AK", "NT")).toBe("A");
    expect(card("KQ", "NT")).toBe("K");
  });
  it.each(["AKx", "AKxx", "AKxxx", "AKxxxx"])("AKx(x) means AK plus one or more small cards: %s leads the A against a suit", (holding) => {
    expect(agreedCard(tables, [...holding] as Rank[], "suit", "IMP", "side")).toMatchObject({ ranks: ["A"], source: "partnership", ref: "order 4" });
  });
  it("partnership rows beat the book where they disagree", () => {
    expect(card("AK2", "NT")).toBe("K");
    expect(card("KJ104", "NT")).toBe("T");
  });
  it("falls back to lead-card-choice.json when the partnership table has no row", () => {
    expect(agreedCard(tables, ["A", "J", "9"], "suit", "IMP", "side")).toMatchObject({ ranks: ["A"], source: "partnership" });
    expect(agreedCard({ partnership: [], book: tables.book }, ["K", "Q", "J", "4"], "NT", "IMP", "side")).toMatchObject({ ranks: ["K"], source: "book" });
  });
});
