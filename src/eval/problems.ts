import { emptyPlayer } from "../engine/constraints.ts";
import type { Call, Card, PlayerConstraints, Seat, Suit } from "../engine/types.ts";
import { SEATS, SUITS } from "../engine/types.ts";
import type { AnalyseSettings, LeadProblem } from "../lead/analyse.ts";
import { PARTNERSHIP_SYSTEM, profilesFor } from "../ui/systems.ts";
import { parseAuction, parseContract } from "./parse-auction.ts";
import type { AuctionSource, ContractSpec } from "./parse-auction.ts";

export interface BookLead {
  text: string;
  suit: Suit;
  cards: string[];
  beat_pct: number;
  avg_tricks: number;
}

/** One item of data/lead-test-problems.json (the fields the harness reads). */
export interface TestProblem {
  id: string;
  kind: "quiz" | "worked_example";
  book: "nt" | "suit";
  contract: string;
  contract_note?: string;
  auction_text: string;
  hand: Record<Suit, string>;
  expected: { best_imps: BookLead; best_mps: BookLead; second?: BookLead };
  table?: BookLead[];
  accept_imps: string[];
  accept_mps: string[];
  usable_as_acceptance_test: boolean;
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_OF_SYMBOL: Record<string, Suit> = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };

export function leaderHand(t: TestProblem): Card[] {
  return SUITS.flatMap((s) => [...(t.hand[s] ?? "")].map((r) => `${r}${s}` as Card));
}

/** "♠K" -> ["KS"]; "♦7/6/2" -> ["7D", "6D", "2D"]; "♥10" -> ["TH"]. */
export function leadCards(text: string): Card[] {
  const suit = SUIT_OF_SYMBOL[text[0]!];
  if (!suit) throw new Error(`unreadable lead ${text}`);
  return text
    .slice(1)
    .split("/")
    .map((r) => `${r === "10" ? "T" : r}${suit}` as Card);
}

export const leadText = (card: Card): string => `${SUIT_SYMBOL[card[1] as Suit]}${card[0] === "T" ? "10" : card[0]}`;

const NEED_HCP = (level: number, strain: string): number => (level >= 7 ? 36 : level === 6 ? 32 : level >= 5 ? 27 : level === 4 || (level === 3 && strain === "N") ? 25 : level === 3 ? 23 : level === 2 ? 22 : 20);

/** No auction to read: the declaring side only needs enough strength for the contract. */
export function contractOnlyConstraints(c: ContractSpec): Record<Seat, PlayerConstraints> {
  const min = Math.max(0, Math.floor(NEED_HCP(c.level, c.strain) / 2) - 4);
  return Object.fromEntries(
    SEATS.map((s) => {
      const p = emptyPlayer();
      if (s === "N" || s === "S") p.hard.hcp = [min, 37];
      return [s, p];
    }),
  ) as Record<Seat, PlayerConstraints>;
}

export interface BuiltProblem {
  problem: LeadProblem;
  source: AuctionSource;
  auctionParsed: boolean;
  settings: Pick<AnalyseSettings, "disciplined" | "akProof">;
}

/** West leads; N-S declare with the default 2/1 system, the leader's side plays the partnership system. */
export function buildProblem(t: TestProblem): BuiltProblem {
  const contract = parseContract(t.contract);
  const parsed = parseAuction(t.auction_text, t.contract, t.contract_note);
  const hand = leaderHand(t);
  const contractOnly = parsed.source === "contract-only";
  const bid = `${contract.level}${contract.strain}` as Call;
  const auction: Call[] = !contractOnly ? parsed.calls : contract.doubled ? [bid, "X", "P", "P", "P"] : [bid, "P", "P", "P"];
  const problem: LeadProblem = {
    hand,
    auction,
    dealer: parsed.dealer,
    vul: "none",
    scoring: "IMP",
    userCard: hand[0]!,
    profiles: profilesFor("W", PARTNERSHIP_SYSTEM),
    constraintsOverride: contractOnly ? contractOnlyConstraints(contract) : undefined,
  };
  return {
    problem,
    source: parsed.source,
    auctionParsed: !contractOnly,
    settings: { disciplined: parsed.disciplined, akProof: parsed.undisciplined ? false : undefined },
  };
}
