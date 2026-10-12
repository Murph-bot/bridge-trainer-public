import type { Call, Contract, Level, Seat, Strain } from "./types.ts";
import { SEATS } from "./types.ts";

const STRAIN_ORDER = "CDHSN";

export const bidValue = (c: string): number => (Number(c[0]) - 1) * 5 + STRAIN_ORDER.indexOf(c[1]!);

export const isBid = (c: string): boolean => /^[1-7][CDHSN]$/.test(c);

export const seatAfter = (seat: Seat, n: number): Seat => SEATS[(SEATS.indexOf(seat) + n) % 4]!;

export const sameSide = (a: Seat, b: Seat): boolean => (SEATS.indexOf(a) - SEATS.indexOf(b)) % 2 === 0;

export function seatOfCall(dealer: Seat, index: number): Seat {
  return seatAfter(dealer, index);
}

/** Auction is finished: three passes after a bid, or four passes. */
export function isComplete(auction: readonly Call[]): boolean {
  const n = auction.length;
  if (n === 4 && auction.every((c) => c === "P")) return true;
  return n >= 4 && auction.slice(-3).every((c) => c === "P") && auction.some(isBid);
}

/** Final contract; null when passed out. Throws on an unfinished auction. */
export function finalContract(auction: readonly Call[], dealer: Seat): Contract | null {
  if (!isComplete(auction)) throw new Error("auction is not complete");
  let last = -1;
  auction.forEach((c, i) => {
    if (isBid(c)) last = i;
  });
  if (last < 0) return null;
  const bid = auction[last]!;
  const strain = bid[1] as Strain;
  const bidder = seatOfCall(dealer, last);
  const declarerIdx = auction.findIndex((c, i) => isBid(c) && c[1] === strain && sameSide(seatOfCall(dealer, i), bidder));
  let doubled: Contract["doubled"] = "";
  for (let i = last + 1; i < auction.length; i++) {
    if (auction[i] === "X") doubled = "X";
    else if (auction[i] === "XX") doubled = "XX";
  }
  return { level: Number(bid[0]) as Level, strain, declarer: seatOfCall(dealer, declarerIdx), doubled };
}

export const openingLeader = (contract: Contract): Seat => seatAfter(contract.declarer, 1);
