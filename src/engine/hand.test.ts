import { describe, expect, it } from "vitest";
import { analyse, featureHolds, parseDotted, satisfies, shapeClass } from "./hand.ts";

const info = (h: string) => analyse(parseDotted(h));

describe("acceptance: T5 hand predicates", () => {
  it("hcp counts 4-3-2-1", () => {
    expect(info("AKQJ.AKQ.AK.AKQ").hcp).toBe(35);
    expect(info("T98.T98.T98.T982").hcp).toBe(0);
    expect(info("QJ1095.K74.852.63").hcp).toBe(6);
  });
  it("stopper:S true for Kx, false for Qx; Qxx and Jxxx are stoppers, Kx alone is not a singleton K", () => {
    expect(featureHolds("stopper:S", info("K2.AQ3.K54.AJ987"))).toBe(true);
    expect(featureHolds("stopper:S", info("Q2.AK3.K54.AJ987"))).toBe(false);
    expect(featureHolds("stopper:S", info("Q32.AK3.K54.AJ98"))).toBe(true);
    expect(featureHolds("stopper:S", info("J432.AK3.K54.AJ9"))).toBe(true);
    expect(featureHolds("stopper:S", info("J32.AK3.K54.AJ98"))).toBe(false);
    expect(featureHolds("stopper:S", info("K.AK32.K543.AJ98"))).toBe(false);
  });
  it("goodSuit:H true for KQ987", () => {
    expect(featureHolds("goodSuit:H", info("A2.KQ987.K54.J98"))).toBe(true);
    expect(featureHolds("goodSuit:H", info("A2.KJ987.K54.J98"))).toBe(false);
    expect(featureHolds("goodSuit:H", info("A2.AJT87.K54.J98"))).toBe(true);
  });
  it("balanced is false for 5422; semibalanced adds 5422 and 6322", () => {
    expect(shapeClass(info("AKQ52.K4.J432.Q9").len)).toBe("semibalanced");
    expect(shapeClass(info("AKQ52.K4.J432.Q9").len)).not.toBe("balanced");
    expect(shapeClass(info("AKQ52.K43.J32.Q9").len)).toBe("balanced");
    expect(shapeClass(info("AKQ542.K432.J3.9").len)).toBe("unbalanced");
    expect(shapeClass(info("AKQ542.K43.J3.Q9").len)).toBe("semibalanced");
    expect(satisfies({ shape: "balanced" }, info("AKQ52.K4.J432.Q9"))).toBe(false);
    expect(satisfies({ shape: "semibalanced" }, info("AKQ52.K4.J432.Q9"))).toBe(true);
    expect(satisfies({ shape: "unbalanced" }, info("AKQ52.K4.J432.Q9"))).toBe(false);
  });
  it("hcpPlusLen: 15 HCP + 3 hearts passes 18, 14 HCP + 3 hearts does not", () => {
    expect(info("AK32.J32.KQ2.Q32").hcp).toBe(15);
    expect(satisfies({ hcpPlusLen: { suit: "H", min: 18 } }, info("AK32.J32.KQ2.Q32"))).toBe(true);
    expect(info("AK32.J32.KQ2.J32").hcp).toBe(14);
    expect(satisfies({ hcpPlusLen: { suit: "H", min: 18 } }, info("AK32.J32.KQ2.J32"))).toBe(false);
  });
  it("lengths, voids, singletons, shortness", () => {
    const h = info("AKQJ.-.KQJ98.6543");
    expect(h.len).toEqual({ S: 4, H: 0, D: 5, C: 4 });
    expect(featureHolds("void:H", h)).toBe(true);
    expect(featureHolds("void:any", h)).toBe(true);
    expect(featureHolds("short:H", h)).toBe(true);
    expect(featureHolds("single:H", h)).toBe(false);
    expect(featureHolds("noSingleton", h)).toBe(true);
    expect(featureHolds("noSingleton", info("AKQJ.5.KQJ98.6432"))).toBe(false);
    expect(featureHolds("single:any", info("AKQJ.5.KQJ98.6432"))).toBe(true);
  });
  it("topHonor, solidSuit, noTopHonors, aces", () => {
    const h = info("AKQ32.J32.T98.432");
    expect(featureHolds("topHonor:S", h)).toBe(true);
    expect(featureHolds("topHonor:H", h)).toBe(false);
    expect(featureHolds("solidSuit:S", h)).toBe(true);
    expect(featureHolds("noTopHonors:H", h)).toBe(true);
    expect(featureHolds("noTopHonors:S", h)).toBe(false);
    expect(featureHolds("aces:1", h)).toBe(true);
    expect(featureHolds("aces:0|4", h)).toBe(false);
    expect(featureHolds("aces:0|4", info("K2.Q32.T98.J5432"))).toBe(true);
  });
  it("keycards (aces + trump king), trumpQueen", () => {
    const h = info("AK32.Q32.A98.J54");
    expect(satisfies({ keycards: { trump: "S", oneOf: [3] } }, h)).toBe(true);
    expect(satisfies({ keycards: { trump: "H", oneOf: [3] } }, h)).toBe(false);
    expect(satisfies({ keycards: { trump: "H", oneOf: [2] }, trumpQueen: true }, h)).toBe(true);
    expect(satisfies({ keycards: { trump: "H", oneOf: [2] }, trumpQueen: false }, h)).toBe(false);
  });
  it("lenCmp, anyOf, notAny", () => {
    const h = info("AKQ52.K4.J32.Q98");
    expect(satisfies({ lenCmp: [["S", ">", "H"], ["S", ">=", "D"]] }, h)).toBe(true);
    expect(satisfies({ lenCmp: [["D", "=", "C"]] }, h)).toBe(true);
    expect(satisfies({ lenCmp: [["H", ">=", "D"]] }, h)).toBe(false);
    expect(satisfies({ anyOf: [{ hcp: [0, 5] }, { len: { S: [5, 5] } }] }, h)).toBe(true);
    expect(satisfies({ anyOf: [{ hcp: [0, 5] }, { len: { S: [6, 7] } }] }, h)).toBe(false);
    expect(satisfies({ notAny: [{ len: { S: [5, 13] } }] }, h)).toBe(false);
    expect(satisfies({ notAny: [{ len: { S: [6, 13] } }] }, h)).toBe(true);
  });
  it("rejects an unknown feature", () => {
    expect(() => featureHolds("bogus:S", info("AKQ52.K4.J432.Q9"))).toThrow();
  });
});
