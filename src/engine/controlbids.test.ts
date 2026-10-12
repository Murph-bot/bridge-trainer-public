import { describe, expect, it } from "vitest";
import { matchCalls } from "./constraints.ts";
import { controlCalls } from "./controlbids.ts";
import { calls, profilesOf } from "./test-data.ts";
import type { Seat, Strain } from "./types.ts";

const kinds = (auction: string, trump: Strain | null = null) => controlCalls({ auction: calls(auction), trump }).map((c) => `${c.index}:${c.kind}`);

describe("control-bid test (rulings 01 section 2)", () => {
  it("a new suit above 3NT after the fit is agreed is a control bid", () => {
    expect(kinds("1S P 3S P 4C P 4H P 4S P P P")).toEqual(["4:cue", "6:cue"]);
    expect(kinds("1S P 2C P 2S P 3S P 4D P 4S P P P")).toEqual(["8:cue"]);
  });
  it("4NT keycard ask, its reply, the 5NT king ask and its reply count", () => {
    expect(kinds("1S P 3S P 4N P 5C P 5D P 5S P P P")).toEqual(["4:keycard-ask", "6:reply", "8:queen-ask", "10:reply"]);
    expect(kinds("1S P 3S P 4N P 5H P 5N P 6C P 7S P P P")).toEqual(["4:keycard-ask", "6:reply", "8:king-ask", "10:reply"]);
    expect(kinds("1H P 3H P 4N P 5D P 6H P P P")).toEqual(["4:keycard-ask", "6:reply"]);
  });
  it("a 5-level suit by the asker after the replies is a queen/king ask (or ask with a void) with a counted reply; other 5-level suits are not", () => {
    expect(kinds("1S P 3S P 4N P 5H P 5N P 6C P 6D P 7S P P P")).toEqual(["4:keycard-ask", "6:reply", "8:king-ask", "10:reply"]);
    expect(kinds("1S P 3S P 4N P 5D P 5S P 6C P P P")).toEqual(["4:keycard-ask", "6:reply"]);
    expect(kinds("1S P 3S P 4N P 5D P 5H P 5S P 6S P P P")).toEqual(["4:keycard-ask", "6:reply", "8:queen-ask", "10:reply"]);
    expect(kinds("1S P 3S P 4N P 5D P 6C P 6S P P P")).toEqual(["4:keycard-ask", "6:reply"]);
  });
  it("a bid of the opponents' suit is not a control bid (Michaels, unassuming cue raise, western cue)", () => {
    expect(kinds("1H 2C 3C P 4H P P P")).toEqual([]);
    expect(kinds("1S 2H 3H P 4S P P P")).toEqual([]);
    expect(kinds("1H 1S 2H 2S 3H P P P")).toEqual([]);
  });
  it("no fit agreed: no control bid, 4NT is not a keycard ask", () => {
    expect(kinds("1S P 4S P P P")).toEqual([]);
    expect(kinds("1N P 2C P 2H P 6N P P P")).toEqual([]);
    expect(kinds("1N P 4N P 6N P P P")).toEqual([]);
    expect(kinds("P P P P")).toEqual([]);
  });
  it("a 4-level jump in a new suit is a splinter agreeing the fit, not a control bid; later cue bids count", () => {
    expect(kinds("1S P 4D P 4S P P P", "S")).toEqual([]);
    expect(kinds("1S P 4D P 4H P 4S P P P", "S")).toEqual(["4:cue"]);
    expect(kinds("1S P 4D P 4N P 5C P 5S P P P", "S")).toEqual(["4:keycard-ask", "6:reply"]);
  });
  it("the first suit bid by responder over a 1NT opening is artificial: a Stayman/transfer fit is only agreed by a raise", () => {
    expect(kinds("1N P 2C P 2S P 4S P P P")).toEqual([]);
    expect(kinds("1N P 2D P 2H P 4H P P P")).toEqual([]);
  });
  it("opponents' calls are ignored when finding the fit and the asks", () => {
    expect(kinds("1S 2D 3S 3H 4N P 5C P 6S P P P")).toEqual(["4:keycard-ask", "6:reply"]);
  });

  describe("below 3NT: a 3-level new suit after a major fit at the 2 or 3 level in a GF auction", () => {
    const profiles = profilesOf({ N: "ss", S: "ss", E: "ss", W: "ss" } as Record<Seat, string>);
    const run = (auction: string) => {
      const a = calls(auction);
      return controlCalls({ auction: a, trump: "S", matched: matchCalls({ auction: a, dealer: "N", leader: "E", profiles }) }).map((c) => `${c.index}:${c.kind}`);
    };
    it("2/1 game force, spade support at the 2 level, then a new suit at the 3 level", () => {
      expect(run("1S P 2C P 2D P 2S P 3H P 4S P P P")).toEqual(["8:cue"]);
    });
    it("the same sequence without a game-forcing bid is not a control bid", () => {
      expect(run("1S P 2S P 3D P 4S P P P")).toEqual([]);
    });
    it("a GF raise (3C = game force with a spade fit) agrees the fit; a later 3-level suit is below 3NT and in a GF auction", () => {
      expect(run("1S P 3C P 3D P 4S P P P")).toEqual(["4:cue"]);
    });
  });
});
