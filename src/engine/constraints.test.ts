import { describe, expect, it } from "vitest";
import { applyShows, emptyPlayer, inferConstraints, matchCalls } from "./constraints.ts";
import { calls, profilesOf } from "./test-data.ts";

describe("conflicting ranges become soft constraints (rulings 01 section 3)", () => {
  it("an hcp range that no longer intersects keeps the earlier hard range and becomes the soft range", () => {
    const P = emptyPlayer();
    applyShows(P, { hcp: [10, 12] }, 1, "a");
    applyShows(P, { hcp: [20, 22] }, 1, "b");
    expect(P.hard.hcp).toEqual([9, 13]);
    expect(P.soft.hcp).toEqual([20, 22]);
    expect(P.conflicts).toEqual(["b: hcp [20, 22] conflicts with [9, 13]; kept as soft only"]);
  });
  it("a length range that no longer intersects keeps the earlier hard range and becomes the soft range", () => {
    const P = emptyPlayer();
    applyShows(P, { len: { H: [5, 13] } }, 0, "a");
    applyShows(P, { len: { H: [0, 2] } }, 0, "b");
    expect(P.hard.len.H).toEqual([5, 13]);
    expect(P.soft.len.H).toEqual([0, 2]);
    expect(P.conflicts).toHaveLength(1);
  });
  it("ranges that still intersect narrow both hard and soft as before", () => {
    const P = emptyPlayer();
    applyShows(P, { hcp: [10, 14] }, 1, "a");
    applyShows(P, { hcp: [12, 16] }, 1, "b");
    expect(P.hard.hcp).toEqual([11, 15]);
    expect(P.soft.hcp).toEqual([12, 14]);
    expect(P.conflicts).toEqual([]);
  });
  it("East's 1NT overcall after three passes is hard 14-16 +-1, its double conflicts: soft 15+", () => {
    const profiles = profilesOf({ N: "ss", E: "opps", S: "ss", W: "ss" });
    const got = inferConstraints({ auction: calls("P P P 1N X P"), dealer: "E", leader: "N", profiles });
    expect(got.E.conflicts).toEqual(["vs1n.direct.X: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]);
    expect(got.E.soft.hcp).toEqual([15, 37]);
    expect(got.E.hard.hcp).toEqual([0, 13]);
  });
  it("matchCalls gives the rule each call matched", () => {
    const profiles = profilesOf({ N: "ss", E: "ss", S: "ss", W: "ss" });
    expect(matchCalls({ auction: calls("1S P 3C"), dealer: "N", leader: "E", profiles }).map((r) => r?.id)).toEqual(["open.1S", "ov.1S.P", "resp.1S.3C"]);
  });
});
