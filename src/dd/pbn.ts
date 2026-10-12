import type { Card, Deal, Rank, Seat, Strain, Suit } from "../engine/types.ts";
import { RANKS, SEATS, SUITS } from "../engine/types.ts";

/** DDS numbering: suits S H D C = 0..3, trump N = 4, seats N E S W = 0..3, ranks 2..14 (A = 14). */
export const suitNum = (s: Suit): number => SUITS.indexOf(s);
export const trumpNum = (t: Strain): number => (t === "N" ? 4 : SUITS.indexOf(t));
export const seatNum = (s: Seat): number => SEATS.indexOf(s);

const RANK_CHARS = "23456789TJQKA";
export const rankNum = (r: Rank): number => RANK_CHARS.indexOf(r) + 2;
export const rankChar = (n: number): Rank => RANK_CHARS[n - 2] as Rank;

/** "N:S.H.D.C S.H.D.C ..." with the hands in N, E, S, W order. */
export function dealToPbn(deal: Deal): string {
  const hand = (cards: readonly Card[]): string =>
    SUITS.map((s) => RANKS.filter((r) => cards.includes((r + s) as Card)).join("")).join(".");
  return `N:${SEATS.map((s) => hand(deal[s])).join(" ")}`;
}

/** Cards a FutureTricks entry stands for: itself plus its `equals` bitmask (bit r = rank r). */
export function expandEquals(suit: number, rank: number, equals: number): Card[] {
  const s = SUITS[suit]!;
  const out: Card[] = [(rankChar(rank) + s) as Card];
  for (let r = 2; r <= 14; r++) if (equals & (1 << r)) out.push((rankChar(r) + s) as Card);
  return out;
}

/** Inverse of dealToPbn. */
export function pbnToDeal(pbn: string): Deal {
  const m = /^N:(\S+) (\S+) (\S+) (\S+)$/.exec(pbn.trim());
  if (!m) throw new Error(`bad PBN deal: ${pbn}`);
  const deal = {} as Deal;
  SEATS.forEach((seat, i) => {
    deal[seat] = m[i + 1]!.split(".").flatMap((ranks, si) => [...ranks].map((r) => (r + SUITS[si]!) as Card));
  });
  return deal;
}
