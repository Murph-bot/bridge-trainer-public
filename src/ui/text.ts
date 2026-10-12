import type { Call, Card, Suit } from "../engine/types.ts";
import { RANKS } from "../engine/types.ts";
import type { MsgRef } from "../lead/explain.ts";

export interface Parsed<T> {
  value: T;
  errors: MsgRef[];
}

const SUIT_LETTER: Record<string, Suit> = { S: "S", H: "H", D: "D", C: "C", "♠": "S", "♥": "H", "♦": "D", "♣": "C" };
const RANK_SET = new Set<string>(RANKS);

function addRanks(cards: Card[], suit: Suit, ranks: string, errors: MsgRef[]): void {
  for (const r of ranks.replace(/-/g, "")) {
    if (RANK_SET.has(r)) cards.push((r + suit) as Card);
    else errors.push({ key: "val.hand.badToken", params: { token: r } });
  }
}

/**
 * Hand text: "S:K9 H:Q8642 D:AJ73 C:85", the same without colons or with suit symbols ("♠K9 ♥Q8642"),
 * or dotted "K9.Q8642.AJ73.85" (spades first). "10" means T and "-" is a void.
 */
export function parseHandText(text: string): Parsed<Card[]> {
  const cards: Card[] = [];
  const errors: MsgRef[] = [];
  const src = text.toUpperCase().replace(/10/g, "T").trim();
  if (src === "") return { value: cards, errors };
  if (src.includes(".")) {
    const parts = src.replace(/\s+/g, "").split(".");
    if (parts.length !== 4) return { value: cards, errors: [{ key: "val.hand.badToken", params: { token: text.trim() } }] };
    (["S", "H", "D", "C"] as Suit[]).forEach((s, i) => addRanks(cards, s, parts[i]!, errors));
    return { value: cards, errors };
  }
  const re = /([SHDC♠♥♦♣])\s*:?\s*([^SHDC♠♥♦♣\s,;/]*)/g;
  const rest = src.replace(re, (_m, s: string, ranks: string) => {
    addRanks(cards, SUIT_LETTER[s]!, ranks, errors);
    return " ";
  });
  for (const token of rest.split(/[\s,;/]+/).filter(Boolean)) errors.push({ key: "val.hand.badToken", params: { token } });
  return { value: cards, errors };
}

const PASS = new Set(["P", "PASS", "Π", "ΠΑΣΟ", "PAS"]);
const DOUBLE = new Set(["X", "DBL", "DOUBLE", "KONTRA", "ΚΟΝΤΡ"]);
const REDOUBLE = new Set(["XX", "RDBL", "REDOUBLE", "ΣΙΡΚΟΝΤΡ"]);
const STRAIN: Record<string, string> = { C: "C", D: "D", H: "H", S: "S", N: "N", NT: "N", ΧΑ: "N", XA: "N", "♣": "C", "♦": "D", "♥": "H", "♠": "S" };

/** Auction text: "1N P 3N P P P". Accepts P/Pass, X/Dbl, XX/Rdbl, N/NT/ΧΑ and suit symbols. */
export function parseAuctionText(text: string): Parsed<Call[]> {
  const calls: Call[] = [];
  const errors: MsgRef[] = [];
  for (const raw of text.trim().split(/[\s,;-]+/).filter(Boolean)) {
    const tok = raw.toUpperCase();
    const bid = /^([1-7])([A-ZΑ-Ω♣♦♥♠]+)$/.exec(tok);
    if (PASS.has(tok)) calls.push("P");
    else if (REDOUBLE.has(tok)) calls.push("XX");
    else if (DOUBLE.has(tok)) calls.push("X");
    else if (bid && STRAIN[bid[2]!]) calls.push(`${bid[1]}${STRAIN[bid[2]!]}` as Call);
    else errors.push({ key: "val.auction.badToken", params: { token: raw } });
  }
  return { value: calls, errors };
}
