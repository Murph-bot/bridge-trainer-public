import { seatAfter, sameSide } from "../engine/contract.ts";
import { analyse as handInfo, satisfies } from "../engine/hand.ts";
import { makeRng } from "../engine/dealer.ts";
import type { Rng } from "../engine/dealer.ts";
import { candidates, sideVulnerable } from "../engine/matcher.ts";
import type { Call, Card, Deal, Rule, Seat, Suit, SystemFile, Vul } from "../engine/types.ts";
import { RANKS, SEATS, SUITS } from "../engine/types.ts";
import { checkAuction, legalCalls } from "./auction.ts";
import { sortCards } from "./format.ts";

export interface RandomProblem {
  seed: number;
  deal: Deal;
  dealer: Seat;
  vul: Vul;
  auction: Call[];
  /** The leader's seat and hand (the user's side is the defence). */
  leader: Seat;
  hand: Card[];
  /** Rule id chosen for each call; null where no rule fitted and the call was made naturally. */
  rules: (string | null)[];
}

const MAX_CALLS = 48;
const MAX_ATTEMPTS = 600;

function shuffledDeal(rng: Rng): Deal {
  const deck: Card[] = SUITS.flatMap((s) => RANKS.map((r) => (r + s) as Card));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return Object.fromEntries(SEATS.map((s, i) => [s, sortCards(deck.slice(i * 13, i * 13 + 13))])) as Deal;
}

/** Opening bid of last resort: the longest suit (a major from five), 1N for 15-17 balanced, else pass. */
function naturalOpening(hand: Card[], legal: ReadonlySet<Call>): Call {
  const info = handInfo(hand);
  const len = (s: Suit): number => info.len[s];
  const longest = [...SUITS].sort((a, b) => len(b) - len(a) || SUITS.indexOf(a) - SUITS.indexOf(b))[0]!;
  const balanced = SUITS.every((s) => len(s) >= 2) && SUITS.filter((s) => len(s) === 2).length <= 1 && len(longest) <= 5;
  if (info.hcp >= 15 && info.hcp <= 17 && balanced && legal.has("1N")) return "1N";
  if (info.hcp < 12 && !(info.hcp >= 10 && len(longest) >= 6)) return "P";
  const major = (["S", "H"] as Suit[]).find((s) => len(s) >= 5);
  const suit = major ?? (len("D") > len("C") ? "D" : "C");
  const call = `1${suit}` as Call;
  return legal.has(call) ? call : "P";
}

/**
 * The call a player makes: the highest-priority rule that matches the auction so far, is legal and whose `shows` the
 * hand satisfies (exactly, no hcp slack). With no such rule: a natural opening if nobody has bid, otherwise pass.
 */
export function chooseCall(system: SystemFile, hand: Card[], auction: readonly Call[], dealer: Seat, vul: Vul): { call: Call; rule: Rule | null } {
  const i = auction.length;
  const seat = seatAfter(dealer, i);
  const passed = auction.some((c, j) => j < i && (i - j) % 4 === 0 && c === "P");
  const legal = new Set(legalCalls(auction));
  const info = handInfo(hand);
  let best: Rule | null = null;
  for (const r of candidates(system, { prefix: auction, seatNo: (i % 4) + 1, passed, vul: sideVulnerable(vul, seat) }).values()) {
    if (!legal.has(r.call) || !satisfies(r.shows, info)) continue;
    if (!best || r.priority > best.priority) best = r;
  }
  if (best) return { call: best.call, rule: best };
  const opening = auction.every((c) => c === "P");
  return { call: opening ? naturalOpening(hand, legal) : "P", rule: null };
}

/** Every seat bids in turn from its own hand until the auction is complete; the call cap ends a runaway competition with passes. */
export function runAuction(deal: Deal, dealer: Seat, vul: Vul, systems: Record<Seat, SystemFile>): { auction: Call[]; rules: (string | null)[] } {
  const auction: Call[] = [];
  const rules: (string | null)[] = [];
  while (legalCalls(auction).length > 0) {
    const seat = seatAfter(dealer, auction.length);
    const { call, rule } = auction.length >= MAX_CALLS ? { call: "P" as Call, rule: null } : chooseCall(systems[seat], deal[seat], auction, dealer, vul);
    auction.push(call);
    rules.push(rule?.id ?? null);
  }
  return { auction, rules };
}

/**
 * Seeded random problem: deal, dealer and vulnerability from the seed, each seat bids by its system (the user's side by
 * `own`, the other by `opps`). Deals whose auction is passed out or is declared by the user's side are discarded, so
 * the user always defends. Same seed, same problem.
 */
export function generateProblem(seed: number, own: SystemFile, opps: SystemFile): RandomProblem | null {
  const rng = makeRng(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const deal = shuffledDeal(rng);
    const dealer = SEATS[rng.int(4)]!;
    const vul = (["none", "NS", "EW", "both"] as Vul[])[rng.int(4)]!;
    const mine: Seat = rng.int(2) === 0 ? "N" : "E";
    const systems = Object.fromEntries(SEATS.map((s) => [s, sameSide(s, mine) ? own : opps])) as Record<Seat, SystemFile>;
    const { auction, rules } = runAuction(deal, dealer, vul, systems);
    const { contract, leader } = checkAuction(auction, dealer);
    if (!contract || !leader || sameSide(contract.declarer, mine)) continue;
    return { seed, deal, dealer, vul, auction, leader, hand: deal[leader], rules };
  }
  return null;
}
