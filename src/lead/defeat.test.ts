import { beforeAll, describe, expect, it } from "vitest";
import { InlinePool } from "../dd/inline-pool.ts";
import { loadSolver } from "../dd/solve.ts";
import { calls, parseSymbolHand, profilesOf } from "../engine/test-data.ts";
import { analyse } from "./analyse.ts";
import type { LeadProblem } from "./analyse.ts";

let pool: InlinePool;
beforeAll(async () => {
  pool = new InlinePool(await loadSolver());
});

const problem: LeadProblem = {
  hand: parseSymbolHand("QJ1094 ♠ K82 ♥ 963 ♦ 75 ♣"),
  auction: calls("1N P 3N P P P"),
  dealer: "N",
  vul: "none",
  scoring: "IMP",
  userCard: "QS",
  profiles: profilesOf({ N: "opps", S: "opps", E: "ss", W: "ss" }),
};

describe("defeat-only mode and per-lead options", () => {
  it("gives the same defeat probabilities as exact mode on the same deals", async () => {
    const exact = await analyse(problem, pool, { settings: { deals: 50, seed: 5 } });
    const defeat = await analyse(problem, pool, { settings: { deals: 50, seed: 5, defeatOnly: true } });
    expect(defeat.sample.n).toBe(50);
    for (const o of exact.rate.options) {
      const d = defeat.rate.options.find((x) => x.card === o.card)!;
      expect(d.pDef).toBeCloseTo(o.pDef, 12);
    }
    expect(defeat.rate.pDefUser).toBeCloseTo(exact.rate.pDefUser, 12);
  });

  it("lists every lead option, best first, with the top three as its prefix", async () => {
    const a = await analyse(problem, pool, { settings: { deals: 25, seed: 5 } });
    expect(a.rate.options.map((o) => o.cards.length).reduce((x, y) => x + y)).toBe(13);
    expect(a.rate.top).toEqual(a.rate.options.slice(0, 3));
    expect(a.rate.options.every((o) => o.sR >= 0 && o.sR <= 1)).toBe(true);
  });

  it("lets the caller force the AK-proof filter off for a cue-bid slam", async () => {
    const slam: LeadProblem = { ...problem, auction: calls("1S P 3S P 4C P 4D P 6S P P P") };
    const { prepare } = await import("./analyse.ts");
    const base = { deals: 25, seed: 1, dealTimeoutMs: 1000, disciplined: false };
    expect(prepare(slam, base).job.akProof).toBeDefined();
    expect(prepare(slam, { ...base, akProof: false }).job.akProof).toBeUndefined();
    expect(prepare({ ...slam, auction: calls("1H P 6H P P P") }, { ...base, akProof: true }).job.akProof).toBeDefined();
    expect(prepare(problem, { ...base, akProof: true }).job.akProof).toBeUndefined();
  });
});
