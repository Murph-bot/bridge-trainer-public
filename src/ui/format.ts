import type { Call, Card, Contract, Rank, Seat, Suit } from "../engine/types.ts";
import { RANKS, SUITS } from "../engine/types.ts";
import { t } from "../i18n/i18n.ts";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

export const rankText = (r: Rank): string => (r === "T" ? "10" : r);
export const cardText = (c: Card): string => SUIT_SYMBOL[c[1] as Suit] + rankText(c[0] as Rank);

/** "N" / "NT" abbreviation taken from the glossary entry "Χωρίς Ατού (ΧΑ)" / "No trump (NT)". */
export const ntLabel = (): string => /\(([^)]+)\)/.exec(t("strain.NT"))?.[1] ?? "NT";

export function callText(c: Call): string {
  if (c === "P") return t("pass");
  if (c === "X") return t("double");
  if (c === "XX") return t("redouble");
  return c[0] + (c[1] === "N" ? ntLabel() : SUIT_SYMBOL[c[1] as Suit]);
}

export const seatName = (s: Seat): string => t(`seat.${s}`);
export const sideName = (s: Seat): string => (s === "N" || s === "S" ? `${seatName("N")}–${seatName("S")}` : `${seatName("E")}–${seatName("W")}`);

const rankIndex = (r: Rank): number => RANKS.indexOf(r);

export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => SUITS.indexOf(a[1] as Suit) - SUITS.indexOf(b[1] as Suit) || rankIndex(a[0] as Rank) - rankIndex(b[0] as Rank));
}

/** "S:K9 H:Q8642 D:AJ73 C:85" (10 is written T; a void is "-"). */
export function formatHand(cards: readonly Card[]): string {
  return SUITS.map((s) => {
    const ranks = sortCards(cards.filter((c) => c[1] === s)).map((c) => c[0]).join("");
    return `${s}:${ranks === "" ? "-" : ranks}`;
  }).join(" ");
}

export const formatAuction = (auction: readonly Call[]): string => auction.join(" ");

export const contractText = (c: Contract): string => callText(`${c.level}${c.strain}` as Call) + c.doubled;
