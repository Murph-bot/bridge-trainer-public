import { describe, expect, it } from "vitest";
import { controlCalls } from "./controlbids.ts";
import { inferConstraints, matchCalls } from "./constraints.ts";
import { calls, profilesOf } from "./test-data.ts";
import { ruleKind } from "./types.ts";
import type { Seat } from "./types.ts";

const ss = profilesOf({ N: "ss", E: "ss", S: "ss", W: "ss" });
const infer = (auction: string, dealer: Seat = "N") => inferConstraints({ auction: calls(auction), dealer, leader: "E", profiles: ss });
const rulesOf = (auction: string, dealer: Seat = "N") => matchCalls({ auction: calls(auction), dealer, leader: "E", profiles: ss });

describe("phase 5: fourth suit forcing is the artificial rule kind fourth_suit", () => {
  it("1C-1D-1H-1S: forcing one round, the spade bidder shows no spades", () => {
    const rules = rulesOf("1C P 1D P 1H P 1S");
    const r = rules[6]!;
    expect(r.id).toBe("fourth-suit.1C1D1H1S");
    expect([ruleKind(r), r.forcing, r.artificial, r.alertable, r.shows]).toEqual(["fourth_suit", "F1", true, true, {}]);
    const got = infer("1C P 1D P 1H P 1S");
    expect(got.S.rules).toEqual(["resp.1C.1D", "fourth-suit.1C1D1H1S"]);
    expect(got.S.hard.len).toEqual({ S: [0, 13], H: [0, 13], D: [4, 13], C: [0, 13] });
    expect(got.S.unmatched).toEqual([]);
  });
  it("1C-1H-2C-2D: game forcing, the diamond bidder shows no diamonds", () => {
    const r = rulesOf("1C P 1H P 2C P 2D")[6]!;
    expect(r.id).toBe("fourth-suit.1C1H2C2D");
    expect([ruleKind(r), r.forcing]).toEqual(["fourth_suit", "GF"]);
    const got = infer("1C P 1H P 2C P 2D");
    expect(got.S.hard.len).toEqual({ S: [0, 13], H: [4, 13], D: [0, 13], C: [0, 13] });
    expect(got.S.hard.hcp).toEqual([5, 37]);
    expect(got.S.soft.len.D).toEqual([0, 13]);
  });
  it("a later call that repeats the artificial suit is not read as a raise of a promised suit", () => {
    const got = infer("1C P 1D P 1H P 1S P 2S", "N");
    expect(got.N.unmatched).toEqual([]);
    expect(got.N.rules.at(-1)).toBe("override.fourth-suit-raise.1C1D1H1S2S");
    const withoutOverlay = inferConstraints({ auction: calls("1C P 1D P 1H P 1S P 2S"), dealer: "N", leader: "E", profiles: ss, overrides: [] });
    expect(withoutOverlay.N.unmatched).toEqual([{ index: 8, call: "2S", fallback: { len: { S: [5, 13] } } }]);
  });
  it("1C-1D-1H-1S-2S (overlay data/system-overrides.json): opener has 4+ spades and 11-14 HCP", () => {
    const got = infer("1C P 1D P 1H P 1S P 2S", "N");
    expect(got.N.hard.len.S).toEqual([4, 13]);
    expect(got.N.hard.hcp).toEqual([10, 15]);
    expect(got.N.soft.hcp).toEqual([11, 14]);
    expect(got.N.soft.len.S).toEqual([4, 13]);
    const east = infer("P 1C P 1D P 1H P 1S P 2S", "N");
    expect(east.E.hard.len.S).toEqual([4, 13]);
    expect(east.E.soft.hcp).toEqual([11, 14]);
  });
  it("the overlay applies only after that fourth-suit rule", () => {
    const got = infer("1C P 1D P 1H P 2S P 2S", "N");
    expect(got.N.rules.some((r) => r.startsWith("override."))).toBe(false);
  });
  it("every fourth-suit rule is artificial, empty and forcing F1 or GF; other rules are natural", () => {
    const fs = ss.N.rules.filter((r) => ruleKind(r) === "fourth_suit");
    expect(fs).toHaveLength(11);
    expect(fs.filter((r) => r.forcing === "F1")).toHaveLength(7);
    expect(fs.filter((r) => r.forcing === "GF")).toHaveLength(4);
    expect(fs.every((r) => r.artificial && Object.keys(r.shows).length === 0)).toBe(true);
    expect(ruleKind({ id: "open.1S" })).toBe("natural");
  });
  it("is never recorded as a suit bid or a cue: a later 4D after the heart fit is the first cue in diamonds", () => {
    const auction = calls("1C P 1H P 2C P 2D P 3H P 4D");
    const matched = rulesOf("1C P 1H P 2C P 2D P 3H P 4D");
    expect(controlCalls({ auction, trump: "H", matched })).toEqual([{ index: 10, kind: "cue" }]);
    expect(controlCalls({ auction: calls("1C P 1H P 2C P 2D"), trump: null, matched: rulesOf("1C P 1H P 2C P 2D") })).toEqual([]);
  });
});

describe("phase 5: spec 2026-10-04 content through the data-driven engine", () => {
  it("4th-seat weak two: 12-14 HCP (+-1) and exactly six cards", () => {
    const w = infer("P P P 2H").W;
    expect(w.rules).toEqual(["open.2H.seat34"]);
    expect(w.hard.hcp).toEqual([11, 15]);
    expect(w.hard.len.H).toEqual([6, 6]);
    expect(w.soft.hcp).toEqual([12, 14]);
  });
  it("seat 1-3 weak two: 5-11 HCP and 5+ cards, seat 3 included", () => {
    const s3 = infer("P P 2H").S;
    expect(s3.rules).toEqual(["open.2H.seat12"]);
    expect(s3.hard.hcp).toEqual([4, 12]);
    expect(s3.hard.len.H).toEqual([5, 13]);
  });
  it("3rd-seat 1S opening may be light (9+), 1st seat still 11+", () => {
    expect(infer("P P 1S").S.hard.hcp).toEqual([8, 23]);
    expect(infer("1S").N.hard.hcp).toEqual([10, 23]);
    expect(infer("P P 1S").S.rules).toEqual(["open.1S.seat3"]);
  });
  it("1NT-3H: 6+ hearts, 15+ HCP (hard 14+ after hcpSlack), game forcing, slam interest", () => {
    const r = rulesOf("1N P 3H")[2]!;
    expect([r.id, r.forcing]).toEqual(["nt1.3H.slam", "GF"]);
    const got = infer("1N P 3H");
    expect(got.S.hard.len.H).toEqual([6, 13]);
    expect(got.S.rules).toEqual(["nt1.3H.slam"]);
    expect(rulesOf("1N P 3H")[2]!.shows.hcp).toEqual([15, 37]);
    expect(got.S.hard.hcp).toEqual([14, 37]);
  });
  it("over 2NT: 4H shows 6+ hearts, 4S shows 6+ diamonds", () => {
    expect(infer("2N P 4H").S.hard.len.H).toEqual([6, 13]);
    expect(rulesOf("2N P 4S")[2]!.shows.len).toEqual({ D: [6, 13] });
  });
  it("1NT-(X): XX transfers to clubs (5+), 2C to diamonds, pass forces opener's redouble, then lowest 4-card suit", () => {
    expect(infer("1N X XX").S.hard.len.C).toEqual([5, 13]);
    expect(infer("1N X 2C").S.hard.len.D).toEqual([5, 13]);
    const got = infer("1N X P XX P 2D");
    expect(rulesOf("1N X P XX P 2D").map((r) => r?.id)).toEqual(["open.1N", "vs1n.direct.X", "nt1.ovX.P", "nt1.ovX.P.XX", undefined, "nt1.ovX.escape.2D"]);
    expect(got.W.rules).toEqual(["nt1.ovX.P.XX"]);
    expect(got.E.hard.len).toEqual({ S: [0, 13], H: [0, 13], D: [4, 13], C: [0, 3] });
  });
  it("1M-3C shortness replies: 3D = 0-1 diamonds, 3NT = 0-1 clubs, 3M = no shortness", () => {
    expect(infer("1S P 3C P 3D").N.hard.len.D).toEqual([0, 1]);
    expect(infer("1S P 3C P 3N").N.hard.len.C).toEqual([0, 1]);
    expect(infer("1H P 3C P 3S").N.hard.len.S).toEqual([0, 1]);
    expect(infer("1S P 3C P 3S").N.hard.all.at(-1)).toEqual({ notAny: [{ len: { H: [0, 1] } }, { len: { D: [0, 1] } }, { len: { C: [0, 1] } }] });
  });
  it("1S-3H has no system meaning any more: natural fallback (5+ hearts), no matched rule", () => {
    const got = infer("1S P 3H");
    expect(rulesOf("1S P 3H")[2]).toBeUndefined();
    expect(got.S.unmatched).toEqual([{ index: 2, call: "3H", fallback: { len: { H: [5, 13] } } }]);
  });
});
