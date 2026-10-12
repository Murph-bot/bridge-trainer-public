import type { HandInfo } from "../engine/hand.ts";
import type { Card, Contract, Seat, Suit, Vul } from "../engine/types.ts";

export type Scoring = "IMP" | "MP";
export type ContractType = "NT" | "suit";
export type LevelClass = "partscore" | "game" | "small_slam" | "grand_slam";
export type HandStrength = "weak" | "normal" | "strong";
/** A value that may differ by scoring: plain, or {IMP, MP}. */
export type PerScoring<T> = T | { IMP: T; MP: T };

/** Suits playing a role in the auction, from the leader's point of view. */
export interface SuitRoles {
  partner: Suit[];
  dummy: Suit[];
  declarer: Suit[];
  declarerFirst: Suit | null;
  declarerSecond: Suit | null;
  own: Suit[];
  opponents: Suit[];
  unbid: Suit[];
  splinter: Suit | null;
  transfer: Suit | null;
  shownAce: Suit[];
  /** The major declarer's side showed in the Stayman reply. */
  staymanMajor: Suit | null;
}

export interface LeadContext {
  contract: Contract;
  contractType: ContractType;
  trump: Suit | null;
  levelClass: LevelClass;
  /** "3NT", "4SX", "6H". */
  contractCode: string;
  scoring: Scoring;
  vul: Vul;
  leader: Seat;
  hand: Card[];
  info: HandInfo;
  handStrength: HandStrength;
  /** Auction features that hold (vocabulary of lead-rules.schema.json). */
  features: ReadonlySet<string>;
  roles: SuitRoles;
  /** Leader's aces plus kings of Kx or longer outside each suit. */
  entriesOutside: Record<Suit, number>;
  /** Suits whose lead leaves the hand with few entries (entriesOutside <= fewEntriesMax). */
  fewEntries: Record<Suit, boolean>;
}

export interface LeadRule {
  id: string;
  contract_type: ContractType;
  conditions: {
    level: LevelClass | "any";
    contracts?: string[];
    auction: { features: string[]; sequences: string[] };
    holding: { patterns: string[]; suit_role: string };
    hand_strength: "any" | "weak" | "strong";
    scoring: "IMPs" | "MPs" | "both";
  };
  recommendation: { lead_suit: string; card: string; text: string };
  preference_over: string[];
  weight: number;
  evidence: { type: "simulation" | "author_advice"; stat: string | null };
  source: { book: string; book_key: "nt" | "suit" | "mpd"; chapter: number; page: number };
}

/** A rule that fired for the current hand. `weight` is signed and already multiplied by the evidence factor. */
export interface RuleHit {
  ruleId: string;
  kind: "recommend" | "avoid" | "tip";
  weight: number;
  cards: Card[];
  /** The recommendation covers every card of the cards' suits (the card within the suit is the carding agreement's business). */
  suitWide: boolean;
  text: string;
  book: string;
  bookKey: "nt" | "suit" | "mpd";
  page: number;
  evidence: "simulation" | "author_advice";
  /** Decided top-vs-low as a technical choice: overrides the carding agreement. */
  technical: boolean;
}
