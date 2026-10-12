import type { Card } from "../engine/types.ts";
import { decide, decideDdOnly } from "../scoring/decide.ts";
import type { DecisionInput, DecisionParams } from "../scoring/decide.ts";
import type { Rater } from "../scoring/rate.ts";
import { leadCards, leadText } from "./problems.ts";

/**
 * blend: phase-5 weighted blend (baseline config). dd: double dummy by the deciding metric (IMPs vs the score-best lead at IMPs, tricks at MPs), no rules (phase 6). rules: rules only (baseline).
 * new: phase 6, rules break near-ties. ddScore: phase-5 DD-only (mean duplicate score / MP fraction), kept for comparison.
 */
export type Mode = "blend" | "dd" | "rules" | "new" | "ddScore";
export const MODES: readonly Mode[] = ["blend", "dd", "rules", "new", "ddScore"];

/** Per mode, the lead options (groups of equivalent cards, highest first) in rank order. */
export type Orders = Record<Mode, Card[][]>;

export interface ModeResult {
  /** Top-ranked lead, e.g. "♠A" (the group's top card). */
  top: string;
  pass: boolean;
  /** An accepted lead is among the first three options. */
  pass3: boolean;
  /** 1-based rank of the first accepted option, 0 when none is accepted. */
  rank: number;
}

/** Legacy modes: every option is rated as the user's card, best rating first, ties in double-dummy order. */
export function legacyOrders(rater: Rater, hand0: Card, blend: { dd: number; rules: number }): Pick<Orders, "blend" | "rules" | "ddScore"> {
  const rows = rater.rate(hand0, { dd: 1, rules: 0 }).options;
  const order = (w: { dd: number; rules: number }): Card[][] =>
    rows
      .map((o, i) => ({ cards: o.cards, r: rater.rate(o.card, w).ratingPct, i }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.cards);
  return { blend: order(blend), rules: order({ dd: 0, rules: 1 }), ddScore: order({ dd: 1, rules: 0 }) };
}

/** Phase-6 modes from the summary statistics. `options[i]` are the cards of option i of the decision input. */
export function decisionOrders(inp: DecisionInput, params: DecisionParams, options: readonly { cards: Card[] }[]): Pick<Orders, "dd" | "new"> {
  const cardsOf = (order: number[]): Card[][] => order.map((i) => options[i]!.cards);
  return { dd: cardsOf(decideDdOnly(inp, params.biasOn).order), new: cardsOf(decide(inp, params).order) };
}

export const acceptCards = (accept: readonly string[]): Set<Card> => new Set(accept.flatMap(leadCards));

export function modeResult(order: readonly Card[][], accept: ReadonlySet<Card>): ModeResult {
  const hit = (g: Card[]): boolean => g.some((c) => accept.has(c));
  const first = order.findIndex(hit);
  return { top: leadText(order[0]![0]!), pass: first === 0, pass3: first >= 0 && first < 3, rank: first + 1 };
}
