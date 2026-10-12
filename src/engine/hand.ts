import type { Card, ConstraintSet, Rank, Suit } from "./types.ts";
import { RANKS, SUITS } from "./types.ts";

export interface HandInfo {
  by: Record<Suit, Rank[]>;
  len: Record<Suit, number>;
  hcp: number;
}

export type ShapeClass = "balanced" | "semibalanced" | "unbalanced";

const HCP_VALUE: Partial<Record<Rank, number>> = { A: 4, K: 3, Q: 2, J: 1 };
const RANK_INDEX = new Map(RANKS.map((r, i) => [r, i]));

export function cardRank(c: Card): Rank {
  return c[0] as Rank;
}

export function cardSuit(c: Card): Suit {
  return c[1] as Suit;
}

export function analyse(cards: readonly Card[]): HandInfo {
  const by: Record<Suit, Rank[]> = { S: [], H: [], D: [], C: [] };
  let hcp = 0;
  for (const c of cards) {
    by[cardSuit(c)].push(cardRank(c));
    hcp += HCP_VALUE[cardRank(c)] ?? 0;
  }
  for (const s of SUITS) by[s].sort((a, b) => RANK_INDEX.get(a)! - RANK_INDEX.get(b)!);
  return { by, len: { S: by.S.length, H: by.H.length, D: by.D.length, C: by.C.length }, hcp };
}

export function shapeClass(len: Record<Suit, number>): ShapeClass {
  const pat = SUITS.map((s) => len[s]).sort((a, b) => b - a).join("");
  if (pat === "4333" || pat === "4432" || pat === "5332") return "balanced";
  if (pat === "5422" || pat === "6322") return "semibalanced";
  return "unbalanced";
}

export function shapeOk(shape: NonNullable<ConstraintSet["shape"]>, len: Record<Suit, number>): boolean {
  if (shape === "any") return true;
  const c = shapeClass(len);
  if (shape === "semibalanced") return c !== "unbalanced";
  return c === shape;
}

export function lenCmpOk(cmps: readonly [Suit, ">" | ">=" | "=", Suit][], len: Record<Suit, number>): boolean {
  return cmps.every(([a, op, b]) => (op === ">" ? len[a] > len[b] : op === ">=" ? len[a] >= len[b] : len[a] === len[b]));
}

const has = (c: Rank[], r: Rank): boolean => c.includes(r);

const SUIT_TESTS: Record<string, (c: Rank[]) => boolean> = {
  single: (c) => c.length === 1,
  void: (c) => c.length === 0,
  short: (c) => c.length <= 1,
  stopper: (c) => has(c, "A") || (has(c, "K") && c.length >= 2) || (has(c, "Q") && c.length >= 3) || (has(c, "J") && c.length >= 4),
  noTopHonors: (c) => !(has(c, "A") || has(c, "K") || has(c, "Q")),
  goodSuit: (c) => ["A", "K", "Q"].filter((r) => has(c, r as Rank)).length >= 2 || ["A", "K", "Q", "J", "T"].filter((r) => has(c, r as Rank)).length >= 3,
  solidSuit: (c) => has(c, "A") && has(c, "K") && has(c, "Q"),
  topHonor: (c) => has(c, "A") || has(c, "K"),
};

export function featureHolds(feature: string, h: HandInfo): boolean {
  if (feature === "noSingleton") return SUITS.every((s) => h.len[s] !== 1);
  if (feature.startsWith("aces:")) {
    const aces = SUITS.filter((s) => has(h.by[s], "A")).length;
    return feature.slice(5).split("|").includes(String(aces));
  }
  const [kind, suit] = feature.split(":");
  const test = SUIT_TESTS[kind!];
  if (!test) throw new Error(`unknown feature ${feature}`);
  const suits = suit === "any" ? SUITS : [suit as Suit];
  return suits.some((s) => test(h.by[s]));
}

/** Aces plus the trump king. */
export function keycardCount(h: HandInfo, trump: Suit): number {
  return SUITS.filter((s) => has(h.by[s], "A")).length + (has(h.by[trump], "K") ? 1 : 0);
}

/** Does the hand meet every predicate of the constraint set? */
export function satisfies(cs: ConstraintSet, h: HandInfo): boolean {
  if (cs.hcp && !(cs.hcp[0] <= h.hcp && h.hcp <= cs.hcp[1])) return false;
  for (const s of SUITS) {
    const r = cs.len?.[s];
    if (r && !(r[0] <= h.len[s] && h.len[s] <= r[1])) return false;
  }
  if (cs.shape && !shapeOk(cs.shape, h.len)) return false;
  if (cs.lenCmp && !lenCmpOk(cs.lenCmp, h.len)) return false;
  if (cs.features && !cs.features.every((f) => featureHolds(f, h))) return false;
  if (cs.hcpPlusLen && h.hcp + h.len[cs.hcpPlusLen.suit] < cs.hcpPlusLen.min) return false;
  if (cs.keycards && !cs.keycards.oneOf.includes(keycardCount(h, cs.keycards.trump))) return false;
  if (cs.trumpQueen !== undefined && cs.keycards && has(h.by[cs.keycards.trump], "Q") !== cs.trumpQueen) return false;
  if (cs.kings?.oneOf && !cs.kings.oneOf.includes(SUITS.filter((s) => has(h.by[s], "K")).length)) return false;
  if (cs.anyOf && !cs.anyOf.some((x) => satisfies(x, h))) return false;
  if (cs.notAny && cs.notAny.some((x) => satisfies(x, h))) return false;
  return true;
}

/** "QJ1095.K74.852.63" (S.H.D.C, "-" or empty = void, "10" = T) -> cards. */
export function parseDotted(text: string): Card[] {
  const parts = text.trim().split(".");
  if (parts.length !== 4) throw new Error(`hand needs 4 suits: ${text}`);
  const cards: Card[] = [];
  parts.forEach((p, i) => {
    for (const r of p.replace("10", "T").replace("-", "")) {
      if (!RANK_INDEX.has(r as Rank)) throw new Error(`bad rank ${r} in ${text}`);
      cards.push((r + SUITS[i]!) as Card);
    }
  });
  return cards;
}
