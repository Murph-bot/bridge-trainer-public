import { describe, expect, it } from "vitest";
import { checkAuction } from "./auction.ts";
import { sameSide, seatAfter } from "../engine/contract.ts";
import { analyse, satisfies } from "../engine/hand.ts";
import { OPPS, SS } from "../engine/test-data.ts";
import { SEATS } from "../engine/types.ts";
import type { Call } from "../engine/types.ts";
import { chooseCall, generateProblem } from "./random.ts";
import { profilesFor } from "./systems.ts";

describe("random problem generator", () => {
  it("is deterministic: the same seed gives the same deal, vulnerability and auction", () => {
    const a = generateProblem(42, SS, OPPS)!;
    const b = generateProblem(42, SS, OPPS)!;
    expect(b).toEqual(a);
    expect(generateProblem(43, SS, OPPS)!.auction).not.toEqual(a.auction);
  });

  it("produces legal, finished, declared auctions that the user defends, with a 13-card leader hand", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = generateProblem(seed, SS, OPPS)!;
      expect(p, `seed ${seed}`).not.toBeNull();
      const c = checkAuction(p.auction, p.dealer);
      expect(c.errors, `seed ${seed}: ${p.auction.join(" ")}`).toEqual([]);
      expect(c.leader).toBe(p.leader);
      expect(sameSide(c.contract!.declarer, p.leader)).toBe(false);
      expect(new Set(p.hand).size).toBe(13);
      expect(p.hand).toEqual(p.deal[p.leader]);
      expect(SEATS.flatMap((s) => p.deal[s])).toHaveLength(52);
      expect(new Set(SEATS.flatMap((s) => p.deal[s])).size).toBe(52);
      expect(p.rules).toHaveLength(p.auction.length);
    }
  });

  it("every call that came from a rule satisfies that rule's constraints for the bidder's hand", () => {
    const byId = new Map([...SS.rules, ...OPPS.rules].map((r) => [r.id, r]));
    let checked = 0;
    for (const seed of [7, 8, 9, 10]) {
      const p = generateProblem(seed, SS, OPPS)!;
      p.rules.forEach((id, i) => {
        if (id === null) return;
        const rule = byId.get(id)!;
        expect(rule.call).toBe(p.auction[i]);
        expect(satisfies(rule.shows, analyse(p.deal[seatAfter(p.dealer, i)])), `${id} in seed ${seed}`).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("picks the highest-priority matching rule, falling back to a natural opening or a pass", () => {
    const strong = ["AS", "KS", "QS", "JS", "2S", "AH", "KH", "3H", "2H", "AD", "5D", "4D", "3D"] as const;
    const first = chooseCall(SS, [...strong], [], "N", "none");
    expect(first.call).toMatch(/^[12][CDHSN]$/);
    expect(first.rule).not.toBeNull();
    const none = chooseCall(SS, ["2S", "3S", "4S", "2H", "3H", "4H", "2D", "3D", "4D", "2C", "3C", "4C", "5C"], [], "N", "none");
    expect(none).toEqual({ call: "P", rule: expect.anything() });
    const lone = chooseCall(SS, ["2S", "3S", "4S", "2H", "3H", "4H", "2D", "3D", "4D", "2C", "3C", "4C", "5C"], ["1N", "X", "XX", "P", "2C", "P", "P", "3C", "P", "P"] as Call[], "N", "none");
    expect(lone.call).toBe("P");
  });

  it("assigns the partnership system to the leader's side and the default 2/1 to the other", () => {
    const prof = profilesFor("E", SS, OPPS);
    expect([prof.E, prof.W, prof.N, prof.S]).toEqual([SS, SS, OPPS, OPPS]);
    expect(profilesFor("N", SS, OPPS).S).toBe(SS);
  });
});
