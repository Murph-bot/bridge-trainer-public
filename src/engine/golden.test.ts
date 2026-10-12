import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inferConstraints, summarize } from "./constraints.ts";
import { calls, profilesOf, readJson } from "./test-data.ts";
import type { Call, Seat } from "./types.ts";

interface Example {
  id: string;
  dealer: Seat;
  auction: string[];
  leader: Seat;
  profiles: Record<Seat, string>;
  constraints: Record<string, unknown>;
}

const examples = readJson("worked-examples.json") as Example[];

describe("acceptance: T3 golden constraints (worked examples)", () => {
  it("has the five examples", () => {
    expect(examples.map((e) => e.id)).toEqual(["ex1-1NT-3NT", "ex2-1S-2S-4S", "ex3-competitive-1H-2C-2H-P-4H", "ex4-1NT-Stayman-4H", "ex5-weak2H-relay-same-system"]);
  });
  for (const ex of examples) {
    it(`${ex.id}: hard, soft, rules, unmatched deep-equal the Python reference`, () => {
      const got = inferConstraints({ auction: calls(ex.auction.join(" ")), dealer: ex.dealer, leader: ex.leader, profiles: profilesOf(ex.profiles) });
      const seats = (["N", "E", "S", "W"] as Seat[]).filter((s) => s !== ex.leader);
      expect(Object.keys(ex.constraints).sort()).toEqual([...seats].sort());
      for (const s of seats) expect(summarize(got[s])).toStrictEqual(ex.constraints[s]);
    });
  }
});

interface DiffCase {
  auction: Call[];
  dealer: Seat;
  profiles: Record<Seat, string>;
  result: Record<Seat, unknown>;
}

describe("golden: differential against tools/ref_constraints.py", () => {
  const cases = JSON.parse(readFileSync(new URL("./fixtures/ref-differential.json", import.meta.url), "utf8")) as DiffCase[];
  it("400 random auctions from rule contexts give identical summaries for all four seats", () => {
    expect(cases).toHaveLength(400);
    let conflicts = 0;
    for (const c of cases) {
      const got = inferConstraints({ auction: c.auction, dealer: c.dealer, leader: "N", profiles: profilesOf(c.profiles) });
      for (const s of ["N", "E", "S", "W"] as Seat[]) {
        expect(summarize(got[s]), `${c.auction.join(" ")} / ${c.dealer} / ${s}`).toStrictEqual(c.result[s]);
        if (got[s].conflicts.length) conflicts++;
      }
    }
    expect(conflicts).toBeGreaterThan(0);
  });
});
