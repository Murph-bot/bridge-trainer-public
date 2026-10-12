import { describe, expect, it } from "vitest";
import { inferConstraints } from "./constraints.ts";
import { akProofApplies, cashableSideAKSuits, deal, defenceHasCashableSideAK, makeRng } from "./dealer.ts";
import { analyse, parseDotted, satisfies } from "./hand.ts";
import { OPPS, SS, calls, parseSymbolHand, profilesOf } from "./test-data.ts";
import { RANKS, SEATS, SUITS } from "./types.ts";
import type { Deal, PlayerConstraints, Seat } from "./types.ts";

const ex1 = () =>
  inferConstraints({ auction: calls("1N P 3N P P P"), dealer: "N", leader: "E", profiles: profilesOf({ N: "opps", S: "opps", E: "ss", W: "ss" }) });
const ex1Known = { seat: "E" as Seat, cards: parseSymbolHand("QJ1095 ♠ K74 ♥ 852 ♦ 63 ♣") };

const hardOk = (P: PlayerConstraints, hand: Deal[Seat]): boolean => {
  const h = analyse(hand);
  return h.hcp >= P.hard.hcp[0] && h.hcp <= P.hard.hcp[1] && SUITS.every((s) => h.len[s] >= P.hard.len[s][0] && h.len[s] <= P.hard.len[s][1]) && P.hard.all.every((cs) => satisfies(cs, h));
};

describe("prng", () => {
  it("is deterministic per seed and uniform enough", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(xs);
    const r = makeRng(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += r.next();
    expect(sum / 20000).toBeGreaterThan(0.49);
    expect(sum / 20000).toBeLessThan(0.51);
    expect(makeRng(1).int(1)).toBe(0);
  });
});

describe("acceptance: T6 dealer", () => {
  const base = { known: ex1Known, constraints: ex1(), target: 100, max: 100000, timeoutMs: 10000 };
  it("same seed gives identical deals, a different seed does not", () => {
    const a = deal({ ...base, seed: 12345 });
    const b = deal({ ...base, seed: 12345 });
    const c = deal({ ...base, seed: 12346 });
    expect(a.deals).toEqual(b.deals);
    expect(a.tried).toBe(b.tried);
    expect(a.deals).not.toEqual(c.deals);
    expect(a.deals).toHaveLength(100);
    expect(a.timedOut).toBe(false);
    expect(a.relaxations).toEqual([]);
  });
  it("every deal is a partition of the 52 cards and keeps the known hand", () => {
    const r = deal({ ...base, seed: 9, target: 50 });
    const known = [...ex1Known.cards].sort();
    for (const d of r.deals) {
      expect(SEATS.map((s) => d[s].length)).toEqual([13, 13, 13, 13]);
      expect(new Set(SEATS.flatMap((s) => d[s])).size).toBe(52);
      expect([...d.E].sort()).toEqual(known);
      expect(SEATS.flatMap((s) => d[s]).every((c) => RANKS.includes(c[0] as never) && SUITS.includes(c[1] as never))).toBe(true);
    }
  });
  it("property: every accepted deal satisfies the hard constraints (1000 deals)", () => {
    const cons = ex1();
    const r = deal({ ...base, constraints: cons, seed: 2024, target: 1000 });
    expect(r.deals).toHaveLength(1000);
    for (const d of r.deals) {
      for (const s of ["N", "S", "W"] as Seat[]) expect(hardOk(cons[s], d[s])).toBe(true);
      const n = analyse(d.N);
      expect(n.hcp).toBeGreaterThanOrEqual(14);
      expect(n.hcp).toBeLessThanOrEqual(18);
      expect(["4333", "4432", "5332"]).toContain(SUITS.map((s) => n.len[s]).sort((x, y) => y - x).join(""));
      const s = analyse(d.S);
      expect(s.len.S).toBeLessThanOrEqual(3);
      expect(s.len.H).toBeLessThanOrEqual(3);
    }
  });
  it("1NT-3NT with a fixed leader hand reaches 500 deals in under 3 s", () => {
    const t = performance.now();
    const r = deal({ ...base, seed: 1, target: 500 });
    const ms = performance.now() - t;
    expect(r.deals).toHaveLength(500);
    expect(r.timedOut).toBe(false);
    expect(r.acceptanceRate).toBeGreaterThan(0.01);
    expect(ms).toBeLessThan(3000);
  });
  it("unconstrained hidden hands: the length distribution is unbiased (hypergeometric mean)", () => {
    const free = inferConstraints({ auction: ["P"], dealer: "N", leader: "E", profiles: profilesOf({ N: "ss", S: "ss", E: "ss", W: "ss" }) });
    const open = { ...free, N: { ...free.N, rules: [] } };
    for (const s of ["N", "S", "W"] as Seat[]) {
      open[s].hard = { hcp: [0, 37], len: { S: [0, 13], H: [0, 13], D: [0, 13], C: [0, 13] }, all: [] };
      open[s].soft = { hcp: [0, 37], len: { S: [0, 13], H: [0, 13], D: [0, 13], C: [0, 13] }, none: [] };
    }
    const r = deal({ ...base, constraints: open, seed: 5, target: 3000 });
    const mean = r.deals.reduce((a, d) => a + analyse(d.N).len.S, 0) / r.deals.length;
    expect(mean).toBeGreaterThan(8 / 3 - 0.08);
    expect(mean).toBeLessThan(8 / 3 + 0.08);
    expect(r.acceptanceRate).toBe(1);
  });
  it("soft constraints bend the sample: penalty 0 yields deals with no violations", () => {
    const cons = inferConstraints({ auction: calls("1C P 1N P"), dealer: "N", leader: "W", profiles: { N: SS, E: SS, S: SS, W: SS } });
    const known = { seat: "W" as Seat, cards: parseDotted("KQ32.AJ4.T98.Q76") };
    const strict = deal({ known, constraints: cons, target: 150, max: 200000, timeoutMs: 10000, seed: 3, softPenalty: 0 });
    for (const d of strict.deals) {
      const h = analyse(d.N);
      expect(cons.N.soft.none.filter((n) => satisfies(n.shows, h))).toEqual([]);
      expect(h.hcp).toBeGreaterThanOrEqual(cons.N.soft.hcp[0]);
      expect(h.hcp).toBeLessThanOrEqual(cons.N.soft.hcp[1]);
    }
    const loose = deal({ known, constraints: cons, target: 150, max: 200000, timeoutMs: 10000, seed: 3, softPenalty: 1 });
    expect(loose.deals.some((d) => cons.N.soft.none.some((n) => satisfies(n.shows, analyse(d.N))))).toBe(true);
  });
});

describe("acceptance: T7 impossible constraints", () => {
  const known = { seat: "E" as Seat, cards: parseDotted("AK2.QJ9876.32.54") };
  const auction = calls("1N P 2D P 2H P 4H P P P");
  const cons = inferConstraints({ auction, dealer: "N", leader: "E", profiles: { N: SS, E: SS, S: SS, W: SS } });

  it("6 hearts on lead vs a 6+ heart transfer: timedOut, relaxations, no deals, immediately", () => {
    const t = performance.now();
    const r = deal({ known, constraints: cons, target: 250, max: 100000, timeoutMs: 10000, seed: 1 });
    expect(r.timedOut).toBe(true);
    expect(r.deals).toEqual([]);
    expect(r.relaxations).toEqual(["drop-soft", "widen-hcp-slack-2"]);
    expect(r.tried).toBe(0);
    expect(performance.now() - t).toBeLessThan(2000);
  });
  it("never hangs: a feasible but hopeless hcp window stops at the tries budget", () => {
    const hopeless = inferConstraints({ auction: ["1N"], dealer: "N", leader: "E", profiles: { N: OPPS, E: OPPS, S: OPPS, W: OPPS } });
    hopeless.N.hard.hcp = [36, 37];
    const t = performance.now();
    const r = deal({ known: { seat: "E", cards: parseDotted("T98.T98.T98.T982") }, constraints: hopeless, target: 250, max: 3000, timeoutMs: 10000, seed: 1 });
    expect(r.timedOut).toBe(true);
    expect(r.tried).toBe(3000);
    expect(r.relaxations).toEqual(["drop-soft", "widen-hcp-slack-2"]);
    expect(performance.now() - t).toBeLessThan(3000);
  });
  it("never hangs: the timeout stops a hopeless search", () => {
    const hopeless = inferConstraints({ auction: ["1N"], dealer: "N", leader: "E", profiles: { N: OPPS, E: OPPS, S: OPPS, W: OPPS } });
    hopeless.N.hard.hcp = [37, 37];
    const t = performance.now();
    const r = deal({ known: { seat: "E", cards: parseDotted("T98.T98.T98.T982") }, constraints: hopeless, target: 250, max: 1e12, timeoutMs: 400, seed: 1 });
    const ms = performance.now() - t;
    expect(r.timedOut).toBe(true);
    expect(r.deals).toEqual([]);
    expect(ms).toBeLessThan(1000);
    expect(ms).toBeGreaterThan(300);
  });
  it("dropping soft constraints rescues an otherwise empty sample", () => {
    const c = ex1();
    c.N.soft.hcp = [37, 37];
    const r = deal({ known: ex1Known, constraints: c, target: 60, max: 5000, timeoutMs: 10000, seed: 2, softPenalty: 0 });
    expect(r.relaxations).toEqual(["drop-soft"]);
    expect(r.deals).toHaveLength(60);
    expect(r.timedOut).toBe(false);
  });
  it("widening the hcp range by one on each side rescues a window that is too tight", () => {
    const c = ex1();
    c.N.hard = { hcp: [20, 20], len: { S: [0, 13], H: [0, 13], D: [0, 13], C: [0, 13] }, all: [] };
    const r = deal({ known: ex1Known, constraints: c, target: 40, max: 3000, timeoutMs: 10000, seed: 4 });
    expect(r.relaxations).toEqual(["drop-soft", "widen-hcp-slack-2"]);
    expect(r.deals).toHaveLength(40);
    for (const d of r.deals) expect(analyse(d.N).hcp).toBeGreaterThanOrEqual(19);
    for (const d of r.deals) expect(analyse(d.N).hcp).toBeLessThanOrEqual(21);
    expect(r.deals.some((d) => analyse(d.N).hcp !== 20)).toBe(true);
  });
  it("rejects a known hand that is not 13 cards", () => {
    expect(() => deal({ known: { seat: "E", cards: parseDotted("AK2.QJ987.32.54") }, constraints: cons, target: 1, max: 1, timeoutMs: 1, seed: 1 })).toThrow(/13 cards/);
  });
});

const D = (n: string, e: string, s: string, w: string): Deal => {
  const d: Deal = { N: parseDotted(n), E: parseDotted(e), S: parseDotted(s), W: parseDotted(w) };
  expect(new Set(SEATS.flatMap((x) => d[x])).size).toBe(52);
  return d;
};

describe("AK-proof predicate (rulings 01 section 1)", () => {
  const base = D("Q54.765.A54.A432", "AT9.T43.JT87.JT9", "J76.J982.KQ9.KQ5", "K832.AKQ.632.876");
  const shortDummy = D("Q.765.A549.A5432", "AT9.T43.JT87.JT9", "J7654.J982.KQ.KQ", "K832.AKQ.632.876");

  it("declarer S, partner E holds the spade ace and leader W the king: cashable against hearts and notrump; W's own AK of hearts is skipped", () => {
    expect(cashableSideAKSuits(base, "S", "H")).toEqual(["S"]);
    expect(cashableSideAKSuits(base, "S", "N")).toEqual(["S"]);
    expect(cashableSideAKSuits(base, "S", "D")).toEqual(["S"]);
    expect(defenceHasCashableSideAK(base, "S", "H")).toBe(true);
  });
  it("the trump suit never counts", () => {
    expect(cashableSideAKSuits(base, "S", "S")).toEqual([]);
    expect(defenceHasCashableSideAK(base, "S", "S")).toBe(false);
  });
  it("the leader holding both honours alone is skipped, the partner holding both is cashable", () => {
    expect(cashableSideAKSuits(base, "N", "C")).toEqual(["S", "H"]);
    expect(cashableSideAKSuits(base, "N", "S")).toEqual(["H"]);
  });
  it("A and K split between leader and partner are cashable (declarer W: N holds the ace, S the king)", () => {
    expect(cashableSideAKSuits(base, "W", "H")).toEqual(["D", "C"]);
    expect(cashableSideAKSuits(base, "W", "N")).toEqual(["D", "C"]);
  });
  it("a suit where declarer's side holds the ace or the king is not cashable (declarer S: N has the diamond and club aces, S the kings)", () => {
    expect(cashableSideAKSuits(base, "S", "N")).not.toContain("D");
    expect(cashableSideAKSuits(base, "S", "N")).not.toContain("C");
  });
  it("suit contract: dummy or declarer with 0-1 cards in the suit means the second round is ruffed; notrump ignores lengths", () => {
    expect(cashableSideAKSuits(shortDummy, "S", "H")).toEqual([]);
    expect(cashableSideAKSuits(shortDummy, "S", "N")).toEqual(["S"]);
    const twoCards = D("Q5.765.A549.A5432", "AT9.T43.JT87.JT9", "J764.J982.KQ.KQ4", "K832.AKQ.632.876");
    expect(cashableSideAKSuits(twoCards, "S", "H")).toEqual(["S"]);
  });
  it("dealer filter: no accepted deal has a cashable side AK; the leader's own AK is skipped, not a reason to reject", () => {
    const cons = inferConstraints({ auction: calls("1S P 3S P 4N P 5H P 6S P P P"), dealer: "N", leader: "E", profiles: profilesOf({ N: "ss", S: "ss", E: "ss", W: "ss" }) });
    const known = { seat: "E" as Seat, cards: parseDotted("T98.K865.QT7.J54") };
    const plain = deal({ known, constraints: cons, target: 400, max: 200000, timeoutMs: 10000, seed: 11 });
    const filtered = deal({ known, constraints: cons, target: 400, max: 200000, timeoutMs: 10000, seed: 11, akProof: { declarer: "N", trump: "S" } });
    expect(plain.deals.some((d) => defenceHasCashableSideAK(d, "N", "S"))).toBe(true);
    expect(filtered.deals).toHaveLength(400);
    expect(filtered.deals.every((d) => !defenceHasCashableSideAK(d, "N", "S"))).toBe(true);
    const own = { seat: "E" as Seat, cards: parseDotted("T98.AK65.QT7.J54") };
    const exempt = deal({ known: own, constraints: cons, target: 100, max: 200000, timeoutMs: 10000, seed: 11, akProof: { declarer: "N", trump: "S" } });
    expect(exempt.deals).toHaveLength(100);
    expect(exempt.deals.every((d) => cashableSideAKSuits(d, "N", "S").length === 0)).toBe(true);
  });
});

describe("akProofApplies", () => {
  const six = { level: 6 as const, strain: "S" as const, declarer: "N" as const, doubled: "" as const };
  const four = { ...six, level: 4 as const };
  it("slam contracts only: a control bid, a keycard ask, or the disciplined flag", () => {
    expect(akProofApplies(calls("1S P 3S P 4C P 4H P 6S P P P"), six)).toBe(true);
    expect(akProofApplies(calls("1S P 3S P 4N P 5H P 6S P P P"), six)).toBe(true);
    expect(akProofApplies(calls("1S P 6S P P P"), six)).toBe(false);
    expect(akProofApplies(calls("1S P 6S P P P"), six, true)).toBe(true);
    expect(akProofApplies(calls("1S P 3S P 4C P 4S P P P"), four)).toBe(false);
    expect(akProofApplies(calls("1S P 4S P P P"), four, true)).toBe(false);
  });
  it("other slams do not apply the filter (the book's all-slams rules stand)", () => {
    expect(akProofApplies(calls("1S P 4S P P P"), { ...six, level: 7 as const })).toBe(false);
    expect(akProofApplies(calls("1H 1S 2H 2S 3H P 6H P P P"), { ...six, strain: "H" })).toBe(false);
  });
});
