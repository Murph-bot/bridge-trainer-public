import type { Call, Card, Contract, Seat, Vul } from "../engine/types.ts";
import type { Scoring } from "../rules/types.ts";

/** Per-deal results are stored compactly: defence tricks as base64 of an Int8Array, defeat (tricks >= need) as base64 of a bit array. */
export const encodeTricks = (xs: ArrayLike<number>): string => Buffer.from(Int8Array.from(xs).buffer).toString("base64");

export function decodeTricks(s: string): Int8Array {
  const b = Buffer.from(s, "base64");
  return new Int8Array(b.buffer, b.byteOffset, b.length);
}

export function encodeBits(bits: ArrayLike<number>): string {
  const out = Buffer.alloc(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3]! |= 1 << (i & 7);
  return out.toString("base64");
}

export function decodeBits(s: string, n: number): Uint8Array {
  const b = Buffer.from(s, "base64");
  return Uint8Array.from({ length: n }, (_, i) => (b[i >> 3]! >> (i & 7)) & 1);
}

export interface CalibOption {
  cards: Card[];
  rep: Card;
  /** Defence tricks after leading the option, one per deal (base64 Int8Array). */
  tricks: string;
  /** 1 when the lead defeats the contract on that deal (base64 bit array). */
  defeat: string;
}

/** The rules that fired for the problem, with their signed recommendation per option (index = option). Informational: calibration recomputes them. */
export interface CalibRuleFiring {
  id: string;
  contrib: number[];
}

export interface CalibEntry {
  id: string;
  book: "nt" | "suit";
  hand: Card[];
  auction: Call[];
  dealer: Seat;
  vul: Vul;
  disciplined: boolean;
  leader: Seat;
  contract: Contract;
  contractType: "NT" | "suit";
  levelClass: string;
  sacrifice: boolean;
  /** Defence tricks that beat the contract. */
  need: number;
  /** The book's accepted leads as in data/lead-test-problems.json ("♠K", "♦7/6/2"). */
  accept: Record<Scoring, string[]>;
  /** Deals used (adaptive sampling). */
  deals: number;
  options: CalibOption[];
  rules: Record<Scoring, CalibRuleFiring[]>;
  /** DD bias corrections that apply to each option's representative card (1/0 per option). */
  biases: { id: string; pdefPoints: number; edefTricks: number; applies: number[] }[];
  ms: number;
}

export interface CalibCache {
  version: 1;
  settings: { start: number; step: number; cap: number; seed: number; fixedDeals: number | null; evalSeconds: number };
  entries: CalibEntry[];
}
