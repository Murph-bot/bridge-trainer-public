import { bidValue, finalContract, isBid, isComplete, openingLeader } from "../engine/contract.ts";
import type { Call, Card, Contract, Level, Seat, Strain } from "../engine/types.ts";
import type { MsgRef } from "../lead/explain.ts";
import { cardText } from "./format.ts";

const STRAINS: readonly Strain[] = ["C", "D", "H", "S", "N"];
const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6, 7];

export const ALL_BIDS: readonly Call[] = LEVELS.flatMap((l) => STRAINS.map((s) => `${l}${s}` as Call));

/** Calls that may legally follow `auction` (empty once it is complete). */
export function legalCalls(auction: readonly Call[]): Call[] {
  if (isComplete(auction)) return [];
  const n = auction.length;
  let lastBid = -1;
  let lastNonPass = -1;
  auction.forEach((c, i) => {
    if (isBid(c)) lastBid = i;
    if (c !== "P") lastNonPass = i;
  });
  const last = lastNonPass < 0 ? undefined : auction[lastNonPass];
  const opponents = lastNonPass >= 0 && (n - lastNonPass) % 2 === 1;
  const out: Call[] = ["P"];
  if (last !== undefined && isBid(last) && opponents) out.push("X");
  if (last === "X" && opponents) out.push("XX");
  const floor = lastBid < 0 ? -1 : bidValue(auction[lastBid]!);
  for (const b of ALL_BIDS) if (bidValue(b) > floor) out.push(b);
  return out;
}

export interface Checked {
  errors: MsgRef[];
  contract: Contract | null;
  leader: Seat | null;
}

/** Legality, completeness and not-passed-out, one message at most. */
export function checkAuction(auction: readonly Call[], dealer: Seat): Checked {
  const none = { contract: null, leader: null };
  if (auction.length === 0) return { errors: [{ key: "val.auction.empty" }], ...none };
  for (let i = 0; i < auction.length; i++) {
    const before = auction.slice(0, i);
    if (isComplete(before)) return { errors: [{ key: "val.auction.afterEnd", params: { pos: i + 1 } }], ...none };
    if (!legalCalls(before).includes(auction[i]!)) return { errors: [{ key: "val.auction.illegal", params: { call: auction[i]!, pos: i + 1 } }], ...none };
  }
  if (!isComplete(auction)) return { errors: [{ key: "val.auction.incomplete" }], ...none };
  const contract = finalContract(auction, dealer);
  if (!contract) return { errors: [{ key: "val.auction.passedOut" }], ...none };
  return { errors: [], contract, leader: openingLeader(contract) };
}

export interface ProblemCheck extends Checked {
  handErrors: MsgRef[];
}

/** Everything the input panel can be wrong about. */
export function checkProblem(hand: readonly Card[], auction: readonly Call[], dealer: Seat): ProblemCheck {
  const handErrors: MsgRef[] = [];
  const seen = new Set<Card>();
  for (const c of hand) {
    if (seen.has(c)) handErrors.push({ key: "val.hand.duplicate", params: { card: cardText(c) } });
    seen.add(c);
  }
  if (seen.size !== 13) handErrors.push({ key: "val.hand.count", params: { n: seen.size } });
  return { ...checkAuction(auction, dealer), handErrors };
}
