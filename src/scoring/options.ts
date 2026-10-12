import type { Card, Rank, Suit } from "../engine/types.ts";
import { RANKS, SUITS } from "../engine/types.ts";

export interface LeadOption {
  suit: Suit;
  /** Equivalent leads: touching cards, or spot cards whose DD results are identical on every deal. */
  cards: Card[];
  /** The top card of the group; stands for the option in comparisons. */
  rep: Card;
}

const isSpot = (r: Rank): boolean => !"AKQJT".includes(r);
const rankOf = (c: Card): Rank => c[0] as Rank;

/**
 * Lead options of a hand (lead-scoring.md section 3, lead-weights.md B8): cards of one suit that touch in rank are
 * one option; spot cards (below the ten) with an identical per-deal trick column are merged into one option.
 */
export function groupOptions(hand: readonly Card[], column: (c: Card) => readonly number[]): LeadOption[] {
  const out: LeadOption[] = [];
  for (const suit of SUITS) {
    const cards = RANKS.map((r) => (r + suit) as Card).filter((c) => hand.includes(c));
    const groups: Card[][] = [];
    for (const c of cards) {
      const g = groups.at(-1);
      if (g && RANKS.indexOf(rankOf(g.at(-1)!)) + 1 === RANKS.indexOf(rankOf(c))) g.push(c);
      else groups.push([c]);
    }
    const merged: Card[][] = [];
    for (const g of groups) {
      const same = (a: Card, b: Card): boolean => column(a).every((x, i) => x === column(b)[i]);
      const target = g.every((c) => isSpot(rankOf(c))) ? merged.find((m) => m.every((c) => isSpot(rankOf(c))) && same(m[0]!, g[0]!)) : undefined;
      if (target) target.push(...g);
      else merged.push([...g]);
    }
    for (const g of merged) out.push({ suit, cards: g, rep: g[0]! });
  }
  return out;
}
