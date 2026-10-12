import { beforeAll, describe, expect, it } from "vitest";
import { inferConstraints } from "../engine/constraints.ts";
import { finalContract, openingLeader } from "../engine/contract.ts";
import { makeRng } from "../engine/dealer.ts";
import { RANKS, SEATS, SUITS } from "../engine/types.ts";
import type { Card, Contract, Deal, Seat } from "../engine/types.ts";
import { calls, parseSymbolHand, profilesOf } from "../engine/test-data.ts";
import { CHUNK_SIZE, chunkSeed } from "./job.ts";
import type { LeadJob } from "./job.ts";
import { createNodePool } from "./node-pool.ts";
import { dealToPbn, expandEquals, pbnToDeal } from "./pbn.ts";
import { bindSolver, loadSolver, tricksToSet } from "./solve.ts";
import type { DdSolver } from "./solve.ts";

let solver: DdSolver;
beforeAll(async () => {
  solver = await loadSolver();
});

const SAMPLE = "N:5432.864.KJ.Q872 AQJ9876.K7.62.53 KT.A952.Q9543.96 .QJT3.AT87.AKJT4";
const NT3S: Contract = { level: 3, strain: "N", declarer: "S", doubled: "" };

describe("pbn", () => {
  it("round-trips a deal", () => {
    expect(dealToPbn(pbnToDeal(SAMPLE))).toBe(SAMPLE);
    expect(pbnToDeal(SAMPLE).W).toHaveLength(13);
  });
  it("expands the equals bitmask, bit r = rank r", () => {
    expect(expandEquals(1, 12, 3072).sort()).toEqual(["JH", "QH", "TH"]);
    expect(expandEquals(0, 14, 0)).toEqual(["AS"]);
  });
});

describe("acceptance: T8 DD wiring", () => {
  it("frozen per-card defence tricks for a known deal (West on lead vs 3NT by South)", () => {
    const dd = solver.solveLeads(pbnToDeal(SAMPLE), NT3S, "W");
    expect(dd).toEqual({ AC: 8, KC: 8, JC: 8, TC: 8, "4C": 7, AD: 8, "8D": 8, "7D": 8, TD: 7, QH: 8, JH: 8, TH: 8, "3H": 8 });
    expect(Object.keys(dd)).toHaveLength(13);
  });
  it("agrees with DDS-EVAL.md and the DD table: the score is the leader's side, declarer makes 13 - score", () => {
    const dd = solver.solveLeads(pbnToDeal(SAMPLE), NT3S, "W");
    expect(Math.max(...Object.values(dd))).toBe(8);
    expect(13 - 8).toBe(5);
    expect(13 - dd["4C"]).toBe(6);
  });
  it("defeat-only mode: 3NT needs 5 defence tricks to set, and every lead scores at least that on this deal", () => {
    expect(tricksToSet(NT3S)).toBe(5);
    expect([...solver.solveDefeat(pbnToDeal(SAMPLE), NT3S, "W")].sort()).toEqual(Object.keys(solver.solveLeads(pbnToDeal(SAMPLE), NT3S, "W")).sort());
  });
});

function randomDeal(rng: ReturnType<typeof makeRng>): Deal {
  const cards: Card[] = SUITS.flatMap((s) => RANKS.map((r) => (r + s) as Card));
  for (let i = 51; i > 0; i--) {
    const j = rng.int(i + 1);
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return Object.fromEntries(SEATS.map((s, i) => [s, cards.slice(i * 13, i * 13 + 13)])) as Deal;
}

describe("defeat-only vs exact", () => {
  it("sets the same leads on 30 random deals, NT and suit contracts, levels 2-6", () => {
    const rng = makeRng(77);
    const strains = ["N", "S", "H", "D", "C"] as const;
    const declarers: Seat[] = ["N", "E", "S", "W"];
    for (let i = 0; i < 30; i++) {
      const contract: Contract = { level: ((i % 5) + 2) as Contract["level"], strain: strains[i % 5]!, declarer: declarers[i % 4]!, doubled: "" };
      const d = randomDeal(rng);
      const leader = openingLeader(contract);
      const need = tricksToSet(contract);
      const exact = solver.solveLeads(d, contract, leader);
      const want = Object.keys(exact).filter((c) => exact[c as Card] >= need).sort();
      expect([...solver.solveDefeat(d, contract, leader)].sort()).toEqual(want);
    }
  });
  it("bindSolver wraps any SolveBoardPBN provider", () => {
    const calls: unknown[][] = [];
    const fake = bindSolver({ SolveBoardPBN: (...a) => (calls.push(a), { nodes: 0, cards: 1, suit: [0], rank: [14], equals: [0], score: [3] }) });
    expect(fake.solveLeads(pbnToDeal(SAMPLE), NT3S, "W")).toEqual({ AS: 3 });
    expect(calls[0]![1]).toBe(-1);
    expect(calls[0]![2]).toBe(3);
  });
});

describe("chunk seeds", () => {
  it("depend only on (seed, chunk)", () => {
    expect(chunkSeed(1, 0)).toBe(chunkSeed(1, 0));
    expect(new Set([0, 1, 2, 3, 4].map((k) => chunkSeed(1, k))).size).toBe(5);
    expect(chunkSeed(1, 3)).not.toBe(chunkSeed(2, 3));
  });
});

const AUCTION = calls("1N P 3N P P P");
const profiles = profilesOf({ N: "opps", S: "opps", E: "ss", W: "ss" });
const contract = finalContract(AUCTION, "N")!;
const job = (over: Partial<LeadJob> = {}): LeadJob => ({
  seed: 2026,
  known: { seat: "E", cards: parseSymbolHand("QJ1095 ♠ K74 ♥ 852 ♦ 63 ♣") },
  constraints: inferConstraints({ auction: AUCTION, dealer: "N", leader: "E", profiles }),
  contract,
  leader: "E",
  mode: "exact",
  chunkSize: 5,
  ...over,
});

describe("node worker pool", () => {
  it("gives identical results for 1 and 4 workers, streams progress per chunk", async () => {
    const one = createNodePool(1);
    const four = createNodePool(4);
    try {
      const progress: number[] = [];
      const a = await one.run(job(), { chunks: 4 });
      const b = await four.run(job(), { chunks: 4, onProgress: (p) => progress.push(p.deals) });
      expect(a.deals).toHaveLength(20);
      expect(b.deals).toEqual(a.deals);
      expect(b.dd).toEqual(a.dd);
      expect(b.stage).toBe(0);
      expect(b.timedOut).toBe(false);
      expect(progress).toHaveLength(4);
      expect(progress[3]).toBe(20);
      expect(Object.keys(a.dd[0]!).length).toBeGreaterThanOrEqual(5);
      for (const [i, d] of a.deals.entries()) expect(a.dd[i]).toEqual(solver.solveLeads(d, contract, "E"));
    } finally {
      one.dispose();
      four.dispose();
    }
  }, 60000);

  it("refine continues from the chunks already done with the same seed", async () => {
    const pool = createNodePool(2);
    try {
      const first = await pool.run(job(), { chunks: 2 });
      const more = await pool.run(job({ stage: first.stage }), { fromChunk: 2, chunks: 2 });
      const all = await pool.run(job(), { chunks: 4 });
      expect([...first.deals, ...more.deals]).toEqual(all.deals);
    } finally {
      pool.dispose();
    }
  }, 60000);

  it("defeat mode returns the beating leads per deal", async () => {
    const pool = createNodePool(2);
    try {
      const ex = await pool.run(job(), { chunks: 2 });
      const df = await pool.run(job({ mode: "defeat" }), { chunks: 2 });
      expect(df.dd).toEqual([]);
      const need = tricksToSet(contract);
      df.beats.forEach((b, i) => expect([...b].sort()).toEqual(Object.keys(ex.dd[i]!).filter((c) => ex.dd[i]![c as Card] >= need).sort()));
    } finally {
      pool.dispose();
    }
  }, 60000);

  it("can be cancelled and is reusable afterwards", async () => {
    const pool = createNodePool(2);
    try {
      const ctl = new AbortController();
      const p = pool.run(job({ chunkSize: CHUNK_SIZE }), { chunks: 40, signal: ctl.signal, onProgress: () => ctl.abort() });
      const r = await p;
      expect(r.cancelled).toBe(true);
      expect(r.chunks.length).toBeLessThan(40);
      const again = await pool.run(job(), { chunks: 1 });
      expect(again.deals).toHaveLength(5);
    } finally {
      pool.dispose();
    }
  }, 60000);

  it("reports an infeasible auction as timedOut without hanging", async () => {
    const pool = createNodePool(2);
    try {
      const impossible = calls("1N P 2D P 2H P 4H P P P");
      const t0 = Date.now();
      const r = await pool.run(
        job({
          constraints: inferConstraints({ auction: impossible, dealer: "N", leader: "E", profiles }),
          known: { seat: "E", cards: parseSymbolHand("9876 ♠ AKQJ109 ♥ 54 ♦ 2 ♣") },
          contract: finalContract(impossible, "N")!,
          dealTimeoutMs: 1000,
        }),
        { chunks: 6 },
      );
      expect(r.timedOut).toBe(true);
      expect(r.deals.length).toBeLessThan(30);
      expect(r.relaxations).not.toEqual([]);
      expect(Date.now() - t0).toBeLessThan(15000);
    } finally {
      pool.dispose();
    }
  }, 60000);
});
