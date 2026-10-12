export type Seat = "N" | "E" | "S" | "W";
export type Suit = "S" | "H" | "D" | "C";
export type Strain = Suit | "N";
export type Rank = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
/** Rank + suit, "TS" = spade ten. */
export type Card = `${Rank}${Suit}`;
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Call = `${Level}${Strain}` | "P" | "X" | "XX";
export type Hand = Card[];
export type Deal = Record<Seat, Hand>;
export type Vul = "none" | "NS" | "EW" | "both";

export interface Contract {
  level: Level;
  strain: Strain;
  declarer: Seat;
  doubled: "" | "X" | "XX";
}

export type Range = [number, number];
export type LenCmp = [Suit, ">" | ">=" | "=", Suit];

export interface ConstraintSet {
  hcp?: Range;
  len?: Partial<Record<Suit, Range>>;
  shape?: "balanced" | "semibalanced" | "unbalanced" | "any";
  lenCmp?: LenCmp[];
  features?: string[];
  hcpPlusLen?: { suit: Suit; min: number };
  keycards?: { trump: Suit; oneOf: number[] };
  trumpQueen?: boolean;
  kings?: { oneOf?: number[] };
  anyOf?: ConstraintSet[];
  notAny?: ConstraintSet[];
}

export type RuleVul = "any" | "none-vul" | "we-vul" | "they-vul" | "both-vul" | "favourable" | "unfavourable";

export interface Rule {
  id: string;
  category: string;
  context: { auction: string[]; seats?: number[]; actorPassedHand?: boolean; vul?: RuleVul };
  call: Call;
  meaning: { en: string; el?: string };
  shows: ConstraintSet;
  forcing: string;
  alertable: boolean;
  artificial: boolean;
  priority: number;
  inferable: boolean;
  source: { file: string; section: string };
  confidence: "source" | "source-interpreted" | "default-assumed";
  notes?: string;
}

/** Rule kinds that need generic handling. "fourth_suit" is the artificial fourth-suit-forcing bid (ids `fourth-suit.*`). */
export type RuleKind = "natural" | "fourth_suit";

export const ruleKind = (r: Pick<Rule, "id">): RuleKind => (r.id.startsWith("fourth-suit.") ? "fourth_suit" : "natural");

export interface SystemMeta {
  name: string;
  version: string;
  profile: string;
  constraintConventions: { hcpSlack: number; [k: string]: unknown };
  [k: string]: unknown;
}

export interface SystemFile {
  meta: SystemMeta;
  rules: Rule[];
  carding?: Record<string, unknown>;
  conventionsWithoutPatterns?: unknown[];
}

/** Hard constraint of one hidden hand: intervals plus lazily evaluated predicates (conjunction). */
export interface Constraint {
  hcp: Range;
  len: Record<Suit, Range>;
  all: ConstraintSet[];
}

export interface SoftConstraint {
  hcp: Range;
  len: Record<Suit, Range>;
  none: { from: string; shows: ConstraintSet }[];
}

export interface Unmatched {
  index: number;
  call: Call;
  fallback: ConstraintSet;
}

export interface PlayerConstraints {
  hard: Constraint;
  soft: SoftConstraint;
  rules: string[];
  unmatched: Unmatched[];
  conflicts: string[];
}

export const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];
export const RANKS: readonly Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
