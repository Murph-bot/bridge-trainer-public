import { readFileSync } from "node:fs";
import { HAS_BOOK_PROBLEMS, PROBLEMS_URL } from "../test-support/book-data.ts";
import { afterAll, describe, expect, it } from "vitest";
import { createNodePool } from "../dd/node-pool.ts";
import { evaluateProblem, MODES } from "./evaluate.ts";
import { parseAuction, parseContract } from "./parse-auction.ts";
import { buildProblem, leadCards, leadText, leaderHand } from "./problems.ts";
import type { TestProblem } from "./problems.ts";
import { markdown, quantile, summarize } from "./summary.ts";

const all = ((HAS_BOOK_PROBLEMS ? JSON.parse(readFileSync(PROBLEMS_URL, "utf8")) : { tests: [] }) as { tests: TestProblem[] }).tests;
const usable = all.filter((t) => t.usable_as_acceptance_test);

const read = (text: string, contract: string): string => {
  const p = parseAuction(text, contract);
  return `${p.source} ${p.dealer} ${p.calls.join(" ")}`;
};

describe("auction text parser", () => {
  it("reads dash sequences", () => {
    expect(read("1NT - 3NT", "3NT")).toBe("text S 1N P 3N P P P");
    expect(read("The bidding is 1♠–2♠–4♠. What would you lead from:", "4S")).toBe("text S 1S P 2S P 4S P P P");
    expect(read("1NT passed out", "1NT")).toBe("text S 1N P P P");
    expect(read("1NT - 6NT (or 1NT - 4NT - 6NT)", "6NT")).toBe("text S 1N P 6N P P P");
    expect(read("(1♠–3♠–4♠)", "4S")).toBe("text S 1S P 3S P 4S P P P");
  });
  it("puts parenthesised calls on the other side, whichever side declares", () => {
    expect(read("1♠–(2♥)–2♠–(3♥)–3♠", "3S")).toBe("text S 1S 2H 2S 3H 3S P P P");
    expect(read("1♥–(dble)–2♥–(3♦)–3♥", "3H")).toBe("text S 1H X 2H 3D 3H P P P");
    expect(read("1♥–(1♠)–pass/bid–(4♠)", "4S")).toBe("text E 1H 1S P 4S P P P");
  });
  it("uses seat labels and seats South as declarer", () => {
    expect(read("1♠ (North) - 1NT (South)", "1NT")).toBe("text N 1S P 1N P P P");
    expect(read("1♥ (East) - 1NT (South) - 3NT (North)", "3NT")).toBe("text E 1H 1N P 3N P P P");
    expect(read("1♥–1♠–4♣–4♠", "4S")).toBe("text N 1H P 1S P 4C P 4S P P P");
  });
  it("reads prose auctions", () => {
    expect(read("Partner opens 1♥ and the next player overcalls 1♠. You pass on the hand below and North raises to 4♠. What would you lead from:", "4S")).toBe("text E 1H 1S P 4S P P P");
    expect(read("Your RHO opens 1♠ and you overcall 2♦. Your LHO responds 2♥ and raises the opener’s 2♠ to game. What would you lead from:", "4S")).toBe("text S 1S 2D 2H P 2S P 4S P P P");
    expect(read("East opens 1♥ and South overcalls 1♠. When you bid constructively to 4♥ the opponents sacrifice in 4♠ doubled. What will you lead from:", "4SX")).toBe("text E 1H 1S 4H 4S X P P P");
    expect(read("South opens 1♦ and North responds 2♣. What do you lead against 6♦ from:", "6D")).toBe("text S 1D P 2C P 6D P P P");
  });
  it("defaults an empty 1NT-3NT chapter auction and falls back to contract-only otherwise", () => {
    expect(parseAuction("", "3NT", "default 1NT-3NT for this chapter")).toMatchObject({ source: "default", calls: ["1N", "P", "3N", "P", "P", "P"] });
    expect(read("(Contract 3NT)", "3NT")).toBe("default S 1N P 3N P P P");
    expect(parseAuction("The opponents bid to 6♥. What would you lead from:", "6H")).toMatchObject({ source: "contract-only", calls: [], disciplined: false });
    expect(parseAuction("South opens 1♠. Over your pass, 2♦ or 3♦, North responds in hearts and raises the opener’s spade rebid to game.", "4S").source).toBe("contract-only");
    expect(read("1♠–2♠", "4S")).toBe("contract-only S ");
  });
  it("reads the disciplined / undisciplined flags", () => {
    expect(parseAuction("Opponents bid 7♦, disciplined auction", "7D")).toMatchObject({ disciplined: true, undisciplined: false });
    expect(read("(Contract 3NT)", "3NT")).toBe("default S 1N P 3N P P P");
    expect(parseAuction("The opponents bid to 6♥ without cue-bidding. What would you lead from:", "6H")).toMatchObject({ disciplined: false, undisciplined: true });
  });
  it("parses contracts", () => {
    expect(parseContract("4SX")).toEqual({ level: 4, strain: "S", doubled: "X" });
    expect(parseContract("6NT")).toEqual({ level: 6, strain: "N", doubled: "" });
  });
  it.skipIf(!HAS_BOOK_PROBLEMS)("reads every usable problem into an auction whose contract is the given one with South declaring, or contract-only", () => {
    const counts: Record<string, number> = { text: 0, default: 0, "contract-only": 0 };
    for (const t of usable) {
      const p = parseAuction(t.auction_text, t.contract, t.contract_note);
      counts[p.source]!++;
      if (p.source !== "contract-only") expect(p.calls.length, t.id).toBeGreaterThanOrEqual(4);
      expect(leaderHand(t), t.id).toHaveLength(13);
    }
    expect(counts["contract-only"]! / usable.length).toBeLessThan(0.15);
  });
});

describe("lead texts", () => {
  it("maps book lead text to cards and back", () => {
    expect(leadCards("♦7/6/2")).toEqual(["7D", "6D", "2D"]);
    expect(leadCards("♥10")).toEqual(["TH"]);
    expect(leadText("TS")).toBe("♠10");
    expect(leadText("AC")).toBe("♣A");
  });
  it.skipIf(!HAS_BOOK_PROBLEMS)("builds a South-declared problem for West from nt-p20-q1", () => {
    const b = buildProblem(usable.find((t) => t.id === "nt-p20-q1")!);
    expect(b.problem.auction).toEqual(["1N", "P", "3N", "P", "P", "P"]);
    expect(b.problem.dealer).toBe("S");
    expect(b.problem.hand).toHaveLength(13);
    expect(b.auctionParsed).toBe(true);
  });
});

describe("summary", () => {
  it("quantiles", () => {
    expect(quantile([5, 1, 3, 2, 4, 10, 9, 8, 7, 6], 0.5)).toBe(5);
    expect(quantile([5, 1, 3, 2, 4, 10, 9, 8, 7, 6], 0.9)).toBe(9);
  });
  it("summarises no records", () => {
    const s = summarize([]);
    expect(s.total).toBe(0);
    expect(markdown(s, { deals: 250, seed: 1 })).toContain("0 problems");
  });
});

describe.skipIf(!HAS_BOOK_PROBLEMS)("acceptance: T10 known lead problems (fast subset; the full 771 run is `npm run eval:leads`)", () => {
  const pool = createNodePool(4);
  afterAll(() => pool.dispose());
  const subset = Array.from({ length: 10 }, (_, i) => usable[Math.floor((i * usable.length) / 10)]!);

  it("runs 10 problems at 100 deals and returns a ranked list for each mode and scoring", async () => {
    for (const t of subset) {
      const { record: r, calib } = await evaluateProblem(t, pool, { deals: 100 });
      const hand = leaderHand(t).map(leadText);
      expect(r.deals, t.id).toBeGreaterThanOrEqual(25);
      expect(r.ranking, t.id).toHaveLength(Math.min(3, r.ranking.length));
      expect(r.ranking.length, t.id).toBeGreaterThanOrEqual(1);
      for (const lead of r.ranking) expect(hand, t.id).toContain(lead);
      for (const sc of [r.imp, r.mp]) for (const m of MODES) {
        expect(hand, `${t.id} ${m}`).toContain(sc[m].top);
        expect(sc[m].rank, `${t.id} ${m}`).toBeGreaterThanOrEqual(0);
        expect(sc[m].pass3 || !sc[m].pass, `${t.id} ${m}`).toBe(true);
      }
      expect(calib.deals, t.id).toBe(r.deals);
      expect(calib.options.length, t.id).toBeGreaterThanOrEqual(r.ranking.length);
      expect(r.bookRank, t.id).toBeGreaterThanOrEqual(1);
    }
  }, 300000);
});
