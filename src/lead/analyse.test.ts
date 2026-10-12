import { beforeAll, describe, expect, it } from "vitest";
import { HAS_FULL_RULES } from "../test-support/book-data.ts";
import { InlinePool } from "../dd/inline-pool.ts";
import { loadSolver } from "../dd/solve.ts";
import { cashableSideAKSuits } from "../engine/dealer.ts";
import { calls, parseSymbolHand, profilesOf } from "../engine/test-data.ts";
import { analyse, prepare } from "./analyse.ts";
import type { LeadProblem } from "./analyse.ts";
import { EXPLAIN_KEYS } from "./explain.ts";
import { EXPLAIN_EN, formatMsg } from "./messages.ts";

let pool: InlinePool;
beforeAll(async () => {
  pool = new InlinePool(await loadSolver());
});

const profiles = profilesOf({ N: "opps", S: "opps", E: "ss", W: "ss" });
const nt: LeadProblem = {
  hand: parseSymbolHand("QJ1094 ♠ K82 ♥ 963 ♦ 75 ♣"),
  auction: calls("1N P 3N P P P"),
  dealer: "N",
  vul: "none",
  scoring: "IMP",
  userCard: "QS",
  profiles,
};

describe("prepare", () => {
  it("builds the job: leader, known hand, mode, seed", () => {
    const p = prepare(nt, { deals: 50, seed: 7, dealTimeoutMs: 5000, disciplined: false });
    expect(p.contract).toEqual({ level: 3, strain: "N", declarer: "N", doubled: "" });
    expect(p.leader).toBe("E");
    expect(p.job).toMatchObject({ seed: 7, mode: "exact", softPenalty: 0.3, leader: "E", known: { seat: "E" } });
    expect(p.job.akProof).toBeUndefined();
    expect(p.unmatchedCalls).toBe(0);
  });
  it("turns the AK-proof filter on for slam auctions with a control bid or keycard ask, or when the user marks the slam disciplined", () => {
    const cue: LeadProblem = { ...nt, auction: calls("1S P 3S P 4C P 4D P 6S P P P") };
    expect(prepare(cue, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false }).job.akProof).toEqual({ declarer: "N", trump: "S" });
    const keycard: LeadProblem = { ...nt, auction: calls("1S P 3S P 4N P 5H P 6S P P P") };
    expect(prepare(keycard, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false }).job.akProof).toEqual({ declarer: "N", trump: "S" });
    const michaels: LeadProblem = { ...nt, auction: calls("1H 2C 3C P 6H P P P") };
    expect(prepare(michaels, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false }).job.akProof).toBeUndefined();
    const grand: LeadProblem = { ...nt, auction: calls("1S P 3S P 4N P 5H P 5N P 6C P 7S P P P") };
    expect(prepare(grand, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false }).job.akProof).toEqual({ declarer: "N", trump: "S" });
    const blast: LeadProblem = { ...nt, auction: calls("1H P 6H P P P") };
    expect(prepare(blast, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false }).job.akProof).toBeUndefined();
    expect(prepare(blast, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: true }).job.akProof).toEqual({ declarer: "N", trump: "H" });
    expect(prepare({ ...nt, auction: calls("1S P 4S P P P") }, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: true }).job.akProof).toBeUndefined();
  });
  it("rejects bad input", () => {
    expect(() => prepare({ ...nt, userCard: "AC" }, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false })).toThrow("not in the leader's hand");
    expect(() => prepare({ ...nt, auction: calls("P P P P") }, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false })).toThrow("passed out");
    expect(() => prepare({ ...nt, hand: nt.hand.slice(1) }, { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false })).toThrow("13 distinct cards");
  });
});

describe("analyse", () => {
  it("legacy blend mode is deterministic given the seed and fills rating, numbers and explanation", async () => {
    const a = await analyse(nt, pool, { settings: { deals: 50, seed: 7, mode: "blend" } });
    const b = await analyse(nt, pool, { settings: { deals: 50, seed: 7, mode: "blend" } });
    const c = await analyse(nt, pool, { settings: { deals: 50, seed: 8, mode: "blend" } });
    expect(a.rate).toEqual(b.rate);
    expect(a.rate).not.toEqual(c.rate);
    expect(a.sample).toMatchObject({ n: 50, chunks: 2, timedOut: false, relaxations: [], akProof: false, seed: 7 });
    expect(a.rate.n).toBe(50);
    expect(a.rate.ratingPct).toBeGreaterThanOrEqual(0);
    expect(a.rate.ratingPct).toBeLessThanOrEqual(100);
    expect(a.rate.top).toHaveLength(3);
    expect(a.explanation.weights).toEqual({ dd: 0.7, rules: 0.3, context: "NT_IMP", metric: "Pdef" });
    expect(a.explanation.notes.map((n) => n.key)).toEqual(["explain.note.fewDeals", "explain.note.sample"]);
    for (const m of [a.explanation.verdict, a.explanation.defeat, a.explanation.best, ...a.explanation.biases, ...a.explanation.notes]) {
      expect(EXPLAIN_KEYS as readonly string[]).toContain(m.key);
      expect(formatMsg(EXPLAIN_EN[m.key as keyof typeof EXPLAIN_EN], m.params)).not.toMatch(/[{}]/);
    }
  });
  it("new mode (default): deterministic, rating from the DD-decides ranking, explanation names the decision", async () => {
    const a = await analyse(nt, pool, { settings: { deals: 50, seed: 7 } });
    const b = await analyse(nt, pool, { settings: { deals: 50, seed: 7 } });
    expect(a.rate).toEqual(b.rate);
    expect(a.explanation.weights).toEqual({ dd: 1, rules: 0, context: "tie-break", metric: "IMP" });
    expect(a.rate.decision).toMatchObject({ metric: "IMP", noiseK: 1.5, userStatus: "top", ddBest: "QS", top: "QS", ruleIds: [] });
    expect(a.rate.ratingPct).toBe(100);
    expect(a.explanation.verdict.key).toBe("explain.verdict.ddBest");
    const other = await analyse({ ...nt, userCard: "7C" }, pool, { settings: { deals: 50, seed: 7 } });
    expect(other.rate.decision!.userStatus).not.toBe("top");
    expect(other.rate.ratingPct).toBeLessThan(100);
    expect(other.rate.options.map((o) => o.card)[0]).toBe("QS");
  });
  it("adaptive sampling adds chunks of 100 only while the two best leads are within noise, up to the cap", async () => {
    const a = await analyse(nt, pool, { settings: { deals: 50, seed: 7, adaptive: { start: 50, step: 25, cap: 100 } } });
    expect(a.sample.adaptive).toMatchObject({ start: 50, cap: 100 });
    expect([50, 75, 100]).toContain(a.solved.deals.length);
    expect(a.sample.adaptive!.extended).toBe(a.solved.deals.length > 50);
    const fixed = await analyse(nt, pool, { settings: { deals: 50, seed: 7 } });
    expect(fixed.solved.deals.length).toBe(50);
    expect(fixed.sample.adaptive).toBeNull();
  });
  it.skipIf(!HAS_FULL_RULES)("matches the golden numbers (legacy blend) for seed 7, 50 deals, lead ♠Q", async () => {
    const a = await analyse(nt, pool, { settings: { deals: 50, seed: 7, mode: "blend" } });
    expect({ pct: a.rate.ratingPct, p: Number(a.rate.pDefUser.toFixed(4)), e: Number(a.rate.eDefUser.toFixed(4)), best: a.rate.bestCard, top: a.rate.top.map((t) => t.card) }).toMatchInlineSnapshot(`
      {
        "best": "QS",
        "e": 3.16,
        "p": 0.225,
        "pct": 70,
        "top": [
          "QS",
          "4S",
          "7C",
        ],
      }
    `);
  });
  it("streams one update per chunk of 25 deals", async () => {
    const seen: number[] = [];
    await analyse(nt, pool, { settings: { deals: 75, seed: 3 }, onProgress: (x) => seen.push(x.rate.n) });
    expect(seen).toEqual([25, 50, 75]);
  });
  it("refine solves only the missing chunks and equals a fresh run", async () => {
    const first = await analyse(nt, pool, { settings: { deals: 50, seed: 5 } });
    const refined = await analyse(nt, pool, { settings: { deals: 100, seed: 5 }, previous: first.solved });
    const fresh = await analyse(nt, pool, { settings: { deals: 100, seed: 5 } });
    expect(refined.solved.chunks.map((c) => c.chunk)).toEqual([0, 1, 2, 3]);
    expect(refined.rate).toEqual(fresh.rate);
  });
  it("slam cue-bid auction: dealt deals have no cashable side A-K for the defence", async () => {
    const slam: LeadProblem = { ...nt, hand: parseSymbolHand("94 ♠ KJ73 ♥ Q982 ♦ J64 ♣"), auction: calls("1S P 3S P 4C P 4D P 6S P P P"), userCard: "KH" };
    const a = await analyse(slam, pool, { settings: { deals: 25, seed: 11, dealTimeoutMs: 8000, mode: "blend" } });
    expect(a.sample.akProof).toBe(true);
    expect(a.explanation.weights).toMatchObject({ dd: 0.55, rules: 0.45, context: "small_slam" });
    expect(a.solved.deals.length).toBeGreaterThan(0);
    for (const d of a.solved.deals) expect(cashableSideAKSuits(d, "N", "S")).toEqual([]);
    expect(a.ctx.features.has("cue_bid_auction")).toBe(true);
  }, 30000);
  it("infeasible auctions fail with a clear message instead of hanging", async () => {
    const bad: LeadProblem = { ...nt, hand: parseSymbolHand("9876 ♠ AKQJ109 ♥ 54 ♦ 2 ♣"), auction: calls("1N P 2D P 2H P 4H P P P"), userCard: "AH" };
    await expect(analyse(bad, pool, { settings: { deals: 25, dealTimeoutMs: 600 } })).rejects.toThrow("infeasible");
  }, 30000);
});
