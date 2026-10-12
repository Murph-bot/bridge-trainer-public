import { describe, expect, it } from "vitest";
import { finalContract, isComplete, openingLeader } from "./contract.ts";
import { calls } from "./test-data.ts";

describe("contract", () => {
  it("1N P 3N P P P by N: N declares, E leads", () => {
    expect(finalContract(calls("1N P 3N P P P"), "N")).toEqual({ level: 3, strain: "N", declarer: "N", doubled: "" });
    expect(openingLeader(finalContract(calls("1N P 3N P P P"), "N")!)).toBe("E");
  });
  it("declarer is the first of the side to bid the strain (dealer S: 1S P 2S P 4S: S declares, W leads)", () => {
    const c = finalContract(calls("1S P 2S P 4S P P P"), "S")!;
    expect(c).toEqual({ level: 4, strain: "S", declarer: "S", doubled: "" });
    expect(openingLeader(c)).toBe("W");
  });
  it("transfer: N opens 1N, S bids 2D, N 2H, S 4H -> N declares", () => {
    const c = finalContract(calls("1N P 2D P 2H P 4H P P P"), "N")!;
    expect(c).toEqual({ level: 4, strain: "H", declarer: "N", doubled: "" });
  });
  it("competitive: 1H 2C 2H P 4H: dealer N, N declares 4H", () => {
    expect(finalContract(calls("1H 2C 2H P 4H P P P"), "N")).toEqual({ level: 4, strain: "H", declarer: "N", doubled: "" });
  });
  it("later suit first bid by the partner of the final bidder", () => {
    expect(finalContract(calls("1C P 1H P 1N P 2H P 4H P P P"), "E")).toEqual({ level: 4, strain: "H", declarer: "W", doubled: "" });
  });
  it("opponents' suit: 1C 1S 2C 2S 3C P P P... declarer of 3C is the 1C opener's side first bidder", () => {
    expect(finalContract(calls("1C 1S 2C 2S 3C P P P"), "N")).toEqual({ level: 3, strain: "C", declarer: "N", doubled: "" });
  });
  it("doubles and redoubles", () => {
    expect(finalContract(calls("1S P 4S X P P P"), "W")!.doubled).toBe("X");
    expect(finalContract(calls("1S P 4S X XX P P P"), "W")!.doubled).toBe("XX");
    expect(finalContract(calls("1S X P P P"), "W")!.doubled).toBe("X");
    expect(finalContract(calls("1S X 2S P P P"), "W")!.doubled).toBe("");
  });
  it("pass-out gives null; incomplete auctions throw", () => {
    expect(finalContract(calls("P P P P"), "N")).toBeNull();
    expect(() => finalContract(calls("1N P 3N"), "N")).toThrow();
    expect(isComplete(calls("1N P 3N P P P"))).toBe(true);
    expect(isComplete(calls("P P P"))).toBe(false);
  });
});
