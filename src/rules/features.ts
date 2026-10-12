import { controlCalls } from "../engine/controlbids.ts";
import { isBid, sameSide, seatAfter, seatOfCall } from "../engine/contract.ts";
import type { HandInfo } from "../engine/hand.ts";
import type { Call, Contract, Rule, Seat, Suit } from "../engine/types.ts";
import { SUITS } from "../engine/types.ts";
import type { LevelClass, Scoring, SuitRoles } from "./types.ts";

export interface FeatureConfig {
  weakMaxHcp: number;
  strongMinHcp: number;
  fewEntriesMax: number;
}

export interface FeatureInput {
  auction: readonly Call[];
  dealer: Seat;
  contract: Contract;
  leader: Seat;
  info: HandInfo;
  scoring: Scoring;
  /** The user marks the slam auction as disciplined (cue-bid style) even when no control bid shows. */
  disciplined: boolean;
  /** System rule matched by each call, when the profiles are known (GF raises and GF context for the control-bid test). */
  matched?: readonly (Rule | undefined)[];
  config: FeatureConfig;
}

export const FEATURE_NAMES = [
  "1NT-3NT", "1NT_overcall", "1NT_passout", "2NT-3NT", "2NT_passout", "6NT", "accepted", "any_NT", "any_suit", "bypassed_blackwood",
  "competitive_partscore", "cue_bid_auction", "declarer_opened_1NT", "declarer_two_suiter", "dummy_bid_side_suit", "dummy_promised_shortness",
  "dummy_showed_ace", "dummy_suit_breaks_well", "few_entries", "grand_slam", "limit_raise_2NT", "mp_scoring", "no_stayman", "no_transfer",
  "one_suit_auction", "opener_suit_known", "opponents_avoided_slam", "opponents_bid_one_suit", "opponents_bid_two_suits", "own_suit_raised",
  "partner_bid_suit", "partner_opened_minor", "partner_opened_weak_two", "partner_overcall_1level", "partner_passed_as_dealer", "partscore",
  "preemptive_raise", "responder_preferred_second_suit", "sacrifice", "small_slam", "splinter", "stayman_denied_major", "stayman_major_shown",
  "stayman_used", "strong_hand", "transfer", "undisciplined_slam", "void_held", "we_doubled", "we_overcalled", "weak_hand",
] as const;

export const gameLevel = (strain: Contract["strain"]): number => (strain === "N" ? 3 : strain === "S" || strain === "H" ? 4 : 5);

export function levelClass(c: Contract): LevelClass {
  if (c.level === 7) return "grand_slam";
  if (c.level === 6) return "small_slam";
  return c.level >= gameLevel(c.strain) ? "game" : "partscore";
}

interface Call1 {
  call: string;
  i: number;
  seat: Seat;
  level: number;
  strain: string;
}

const NATURAL_SUITS: readonly string[] = SUITS;

export interface Derived {
  features: Set<string>;
  roles: SuitRoles;
}

/** Derives the auction/hand feature vocabulary of lead-rules.json and the suit roles from the finished auction. */
export function deriveFeatures(inp: FeatureInput): Derived {
  const { auction, dealer, contract, leader, info, config } = inp;
  const declarer = contract.declarer;
  const dummy = seatAfter(declarer, 2);
  const partner = seatAfter(leader, 2);
  const isDecl = (s: Seat): boolean => sameSide(s, declarer);
  const calls = auction.map((call, i) => ({ call, i, seat: seatOfCall(dealer, i) }));
  const bids: Call1[] = calls.filter((c) => isBid(c.call)).map((c) => ({ ...c, level: Number(c.call[0]), strain: c.call[1]! }));
  const declBids = bids.filter((b) => isDecl(b.seat));
  const defBids = bids.filter((b) => !isDecl(b.seat));
  const trump = contract.strain === "N" ? null : (contract.strain as Suit);
  const lvl = levelClass(contract);
  const F = new Set<string>();
  const on = (name: string, cond: unknown): void => void (cond && F.add(name));

  const open = declBids[0];
  const ntOpen = open !== undefined && open.strain === "N" && (open.level === 1 || open.level === 2) ? open : undefined;
  const responder = ntOpen ? seatAfter(ntOpen.seat, 2) : undefined;
  const resp1 = ntOpen ? declBids.find((b) => b.seat === responder && b.i > ntOpen.i) : undefined;
  const stayman = !!(ntOpen && resp1 && resp1.strain === "C" && resp1.level === ntOpen.level + 1);
  const opener2 = stayman ? declBids.find((b) => b.seat === ntOpen!.seat && b.i > resp1!.i) : undefined;
  const isTransfer = !!(ntOpen && resp1 && (resp1.strain === "D" || resp1.strain === "H") && (resp1.level === ntOpen.level + 1 || resp1.level === 4));
  const transferSuit: Suit | null = isTransfer ? (resp1!.strain === "D" ? "H" : "S") : null;
  const artificial = new Set<number>([...(stayman ? [resp1!.i] : []), ...(isTransfer ? [resp1!.i] : [])]);
  const natural = (b: Call1): boolean => NATURAL_SUITS.includes(b.strain) && !artificial.has(b.i);
  const suitsOf = (list: Call1[]): Suit[] => [...new Set(list.filter(natural).map((b) => b.strain as Suit))];

  on("stayman_used", stayman);
  on("stayman_denied_major", stayman && opener2?.strain === "D");
  on("stayman_major_shown", stayman && (opener2?.strain === "H" || opener2?.strain === "S"));
  on("no_stayman", !stayman);
  on("transfer", isTransfer);
  on("no_transfer", !isTransfer);
  const lr = !!(ntOpen && ntOpen.level === 1 && declBids.some((b) => b.seat === responder && b.strain === "N" && b.level === 2));
  on("limit_raise_2NT", lr);
  on("accepted", lr && contract.strain === "N" && contract.level >= 3);
  on("1NT-3NT", bids.length === 2 && bids[0]!.call === "1N" && bids[1]!.call === "3N" && contract.strain === "N");
  on("2NT-3NT", bids.length === 2 && bids[0]!.call === "2N" && bids[1]!.call === "3N" && contract.strain === "N");
  on("declarer_opened_1NT", bids[0]?.call === "1N" && bids[0].seat === declarer);
  on("1NT_overcall", open?.call === "1N" && defBids.length > 0 && defBids[0]!.i < open.i);
  on("1NT_passout", contract.strain === "N" && contract.level === 1);
  on("2NT_passout", contract.strain === "N" && contract.level === 2);
  on("6NT", contract.strain === "N" && contract.level === 6);
  on("any_NT", contract.strain === "N");
  on("any_suit", contract.strain !== "N");
  on("partscore", lvl === "partscore");
  on("small_slam", lvl === "small_slam");
  on("grand_slam", lvl === "grand_slam");
  on("mp_scoring", inp.scoring === "MP");
  on("weak_hand", info.hcp <= config.weakMaxHcp);
  on("strong_hand", info.hcp >= config.strongMinHcp);
  on("void_held", SUITS.some((s) => info.len[s] === 0));

  const partnerCalls = calls.filter((c) => c.seat === partner);
  on("partner_passed_as_dealer", partnerCalls[0]?.call === "P" && partnerCalls[0].i < 2);
  const declSuits = suitsOf(declBids);
  on("opponents_bid_one_suit", declSuits.length === 1);
  on("opponents_bid_two_suits", declSuits.length === 2);
  on("one_suit_auction", trump !== null && declSuits.length === 1 && declSuits[0] === trump && !declBids.some((b) => b.strain === "N"));
  on("preemptive_raise", declBids.length === 2 && declBids[0]!.strain === declBids[1]!.strain && declBids[0]!.strain !== "N" && declBids[0]!.level === 1 && declBids[1]!.level >= 4 && declBids[0]!.seat !== declBids[1]!.seat);
  on("opener_suit_known", open !== undefined && natural(open) && open.level <= 2);

  const bySeat = (seat: Seat): Call1[] => declBids.filter((b) => b.seat === seat);
  let splinterSuit: Suit | null = null;
  let splinterBy: Seat | null = null;
  if (trump === "S" || trump === "H") {
    for (const b of declBids) {
      if (b.level !== 4 || !natural(b) || b.strain === trump) continue;
      const earlierOwn = declBids.some((x) => x.i < b.i && x.strain === b.strain && natural(x));
      const partnerBidTrump = declBids.some((x) => x.i < b.i && x.seat === seatAfter(b.seat, 2) && x.strain === trump);
      if (!earlierOwn && partnerBidTrump && contract.level === 4) {
        splinterSuit = b.strain as Suit;
        splinterBy = b.seat;
        break;
      }
    }
  }
  on("splinter", splinterSuit !== null);
  on("dummy_promised_shortness", splinterSuit !== null && splinterBy === dummy);

  const twoSuiter = [declarer, dummy].map((s) => ({ s, suits: suitsOf(bySeat(s)) })).find((x) => x.suits.length >= 2);
  on("declarer_two_suiter", twoSuiter !== undefined);
  on("responder_preferred_second_suit", twoSuiter !== undefined && trump !== null && twoSuiter.suits[1] === trump);

  const dummySuits = [...new Set([...suitsOf(bySeat(dummy)), ...(transferSuit ? [transferSuit] : [])])];
  on("dummy_bid_side_suit", dummySuits.some((s) => s !== trump));
  on("dummy_suit_breaks_well", transferSuit !== null && info.len[transferSuit] <= 2);

  const control = controlCalls({ auction, trump: contract.strain, matched: inp.matched });
  const shownAce = [...new Set(control.filter((c) => c.kind === "cue" && isDecl(seatOfCall(dealer, c.index))).map((c) => auction[c.index]![1] as string).filter((s): s is Suit => NATURAL_SUITS.includes(s) && s !== trump))];
  on("dummy_showed_ace", shownAce.length > 0);
  const cueAuction = contract.level >= 6 && (inp.disciplined || control.length > 0);
  on("cue_bid_auction", cueAuction);
  on("undisciplined_slam", contract.level >= 6 && !cueAuction);
  const blackwood = declBids.some((b) => b.strain === "N" && (b.level === 4 || b.level === 5));
  on("bypassed_blackwood", cueAuction && !blackwood);
  on("opponents_avoided_slam", contract.level < 6 && (control.length > 0 || blackwood));

  const ownSuits = suitsOf(bids.filter((b) => b.seat === leader));
  const partnerSuits = suitsOf(bids.filter((b) => b.seat === partner));
  on("partner_bid_suit", partnerSuits.length > 0);
  on("own_suit_raised", ownSuits.some((s) => partnerSuits.includes(s)));
  const pb = bids.find((b) => b.seat === partner);
  on("partner_opened_weak_two", bids[0] !== undefined && bids[0].seat === partner && bids[0].level === 2 && bids[0].strain !== "C" && bids[0].strain !== "N");
  on("partner_opened_minor", bids[0] !== undefined && bids[0].seat === partner && bids[0].level === 1 && (bids[0].strain === "C" || bids[0].strain === "D"));
  on("partner_overcall_1level", pb !== undefined && pb.level === 1 && pb.strain !== "N" && (declBids.some((b) => b.i < pb.i) || pb.i === 2));
  on("we_overcalled", bids[0] !== undefined && isDecl(bids[0].seat) && defBids.length > 0);
  on("we_doubled", calls.some((c) => c.call === "X" && !isDecl(c.seat) && bids.filter((b) => b.i < c.i).at(-1) !== undefined && isDecl(bids.filter((b) => b.i < c.i).at(-1)!.seat)));
  on("competitive_partscore", lvl === "partscore" && defBids.length > 0 && declBids.length > 0);
  const lastDef = defBids.at(-1);
  on("sacrifice", contract.doubled !== "" && lastDef !== undefined && (lastDef.level >= 4 || (lastDef.strain === "N" && lastDef.level >= 3)) && declBids.some((b) => b.i > lastDef.i));

  const named = new Set<string>(FEATURE_NAMES);
  for (const f of F) if (!named.has(f)) throw new Error(`feature ${f} missing from FEATURE_NAMES`);

  const declSecond = suitsOf(bySeat(declarer))[1] ?? null;
  const bidSuits = new Set<Suit>([...suitsOf(bids), ...(transferSuit ? [transferSuit] : [])]);
  const roles: SuitRoles = {
    partner: partnerSuits,
    dummy: dummySuits,
    declarer: suitsOf(bySeat(declarer)),
    declarerFirst: declSuits[0] ?? null,
    declarerSecond: declSecond,
    own: ownSuits,
    opponents: declSuits,
    unbid: SUITS.filter((s) => !bidSuits.has(s)),
    splinter: splinterSuit,
    transfer: transferSuit,
    shownAce,
    staymanMajor: stayman && (opener2?.strain === "H" || opener2?.strain === "S") ? (opener2.strain as Suit) : null,
  };
  return { features: F, roles };
}
