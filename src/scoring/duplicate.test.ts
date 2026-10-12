import { describe, expect, it } from "vitest";
import type { Contract } from "../engine/types.ts";
import { contractScore, declarerVulnerable, defenderScore } from "./duplicate.ts";

const c = (level: Contract["level"], strain: Contract["strain"], doubled: Contract["doubled"] = ""): Contract => ({ level, strain, declarer: "S", doubled });

describe("duplicate score", () => {
  it.each([
    [c(3, "N"), 9, false, 400],
    [c(3, "N"), 10, true, 630],
    [c(4, "S"), 10, false, 420],
    [c(4, "H"), 9, true, -100],
    [c(1, "C"), 7, false, 70],
    [c(2, "D"), 8, false, 90],
    [c(5, "D"), 11, true, 600],
    [c(6, "S"), 12, false, 980],
    [c(6, "N"), 12, true, 1440],
    [c(7, "N"), 13, false, 1520],
    [c(7, "S"), 13, true, 2210],
    [c(4, "S", "X"), 10, false, 590],
    [c(4, "S", "X"), 11, true, 990],
    [c(2, "S", "X"), 8, false, 470],
    [c(4, "S", "XX"), 10, false, 880],
    [c(4, "S", "X"), 7, false, -500],
    [c(4, "S", "X"), 6, true, -1100],
    [c(3, "N", "X"), 8, true, -200],
    [c(4, "S", "XX"), 8, false, -600],
  ] as const)("%o with %i tricks, vulnerable %s -> %i", (contract, tricks, vul, want) => {
    expect(contractScore(contract, tricks, vul)).toBe(want);
  });
  it("defenders score is the negation at 13 - their tricks", () => {
    expect(defenderScore(c(3, "N"), 5, false)).toBe(50);
    expect(defenderScore(c(3, "N"), 3, false)).toBe(-430);
  });
  it("vulnerability by declarer side", () => {
    expect(declarerVulnerable("NS", "S")).toBe(true);
    expect(declarerVulnerable("NS", "E")).toBe(false);
    expect(declarerVulnerable("EW", "W")).toBe(true);
    expect(declarerVulnerable("both", "N")).toBe(true);
    expect(declarerVulnerable("none", "N")).toBe(false);
  });
});
