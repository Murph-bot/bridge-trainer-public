import { describe, expect, it } from "vitest";
import { checkAuction, checkProblem, legalCalls } from "./auction.ts";
import { formatHand } from "./format.ts";
import { parseAuctionText, parseHandText } from "./text.ts";

const SAMPLE = ["KS", "9S", "QH", "8H", "6H", "4H", "2H", "AD", "JD", "7D", "3D", "8C", "5C"].sort();

describe("parseHandText", () => {
  it("reads the suit:ranks form", () => {
    const p = parseHandText("S:K9 H:Q8642 D:AJ73 C:85");
    expect(p.errors).toEqual([]);
    expect([...p.value].sort()).toEqual(SAMPLE);
  });
  it("reads symbols, dotted form, 10 and voids", () => {
    expect([...parseHandText("♠K9 ♥Q8642 ♦AJ73 ♣85").value].sort()).toEqual(SAMPLE);
    expect([...parseHandText("K9.Q8642.AJ73.85").value].sort()).toEqual(SAMPLE);
    expect(parseHandText("S:K10 H:- D:AQ C:J").value.sort()).toEqual(["AD", "JC", "KS", "QD", "TS"]);
    expect(parseHandText("SK9 HQ8642 DAJ73 C85").value.length).toBe(13);
  });
  it("reports unreadable text", () => {
    expect(parseHandText("S:K9 X:12").errors).toEqual([
      { key: "val.hand.badToken", params: { token: "X:12" } },
    ]);
    expect(parseHandText("S:A1").errors).toEqual([{ key: "val.hand.badToken", params: { token: "1" } }]);
  });
  it("formats back in a canonical order", () => {
    expect(formatHand(parseHandText("C:85 D:AJ73 H:Q8642 S:9K").value)).toBe("S:K9 H:Q8642 D:AJ73 C:85");
    expect(formatHand([])).toBe("S:- H:- D:- C:-");
  });
});

describe("parseAuctionText", () => {
  it("reads calls in several spellings", () => {
    expect(parseAuctionText("1N P 3N P P P").value).toEqual(["1N", "P", "3N", "P", "P", "P"]);
    expect(parseAuctionText("1NT pass 2♥ dbl rdbl 1ΧΑ").value).toEqual(["1N", "P", "2H", "X", "XX", "1N"]);
    expect(parseAuctionText("").value).toEqual([]);
  });
  it("reports bad tokens", () => {
    expect(parseAuctionText("1N Z 8C").errors).toEqual([
      { key: "val.auction.badToken", params: { token: "Z" } },
      { key: "val.auction.badToken", params: { token: "8C" } },
    ]);
  });
});

describe("auction legality", () => {
  it("offers only higher bids, X after an opposing bid, XX after an opposing X", () => {
    expect(legalCalls([])).toHaveLength(36);
    expect(legalCalls([])).not.toContain("X");
    expect(legalCalls(["1N"])).toContain("X");
    expect(legalCalls(["1N"])).not.toContain("1N");
    expect(legalCalls(["1N"])).toContain("2C");
    expect(legalCalls(["1N", "P"])).not.toContain("X");
    expect(legalCalls(["1N", "P", "P"])).toContain("X");
    expect(legalCalls(["1N", "X"])).toContain("XX");
    expect(legalCalls(["1N", "X"])).not.toContain("X");
    expect(legalCalls(["1N", "X", "XX"])).not.toContain("XX");
    expect(legalCalls(["1N", "P", "3N", "P", "P", "P"])).toEqual([]);
  });
  it("validates a finished auction and finds the contract and leader", () => {
    const c = checkAuction(["1N", "P", "3N", "P", "P", "P"], "N");
    expect(c.errors).toEqual([]);
    expect(c.contract).toEqual({ level: 3, strain: "N", declarer: "N", doubled: "" });
    expect(c.leader).toBe("E");
  });
  it("gives one message per problem", () => {
    expect(checkAuction([], "N").errors).toEqual([{ key: "val.auction.empty" }]);
    expect(checkAuction(["1N", "P", "3N"], "N").errors).toEqual([{ key: "val.auction.incomplete" }]);
    expect(checkAuction(["P", "P", "P", "P"], "N").errors).toEqual([{ key: "val.auction.passedOut" }]);
    expect(checkAuction(["1N", "1S"], "N").errors).toEqual([{ key: "val.auction.illegal", params: { call: "1S", pos: 2 } }]);
    expect(checkAuction(["1N", "X", "XX", "X"], "N").errors).toEqual([{ key: "val.auction.illegal", params: { call: "X", pos: 4 } }]);
    expect(checkAuction(["1N", "P", "P", "P", "P"], "N").errors).toEqual([{ key: "val.auction.afterEnd", params: { pos: 5 } }]);
  });
  it("checks the hand: 13 distinct cards", () => {
    const hand = parseHandText("S:K9 H:Q8642 D:AJ73 C:85").value;
    expect(checkProblem(hand, ["1N", "P", "3N", "P", "P", "P"], "N").handErrors).toEqual([]);
    expect(checkProblem(hand.slice(1), ["1N", "P", "3N", "P", "P", "P"], "N").handErrors).toEqual([{ key: "val.hand.count", params: { n: 12 } }]);
    expect(checkProblem([...hand.slice(1), "9S"], ["1N", "P", "3N", "P", "P", "P"], "N").handErrors).toEqual([
      { key: "val.hand.duplicate", params: { card: "♠9" } },
      { key: "val.hand.count", params: { n: 12 } },
    ]);
  });
});
