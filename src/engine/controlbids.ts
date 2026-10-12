import { isBid } from "./contract.ts";
import type { Call, Rule, Strain, Suit } from "./types.ts";
import { ruleKind, SUITS } from "./types.ts";

export type ControlKind = "cue" | "keycard-ask" | "king-ask" | "queen-ask" | "reply";

export interface ControlCall {
  index: number;
  kind: ControlKind;
}

export interface ControlInput {
  auction: readonly Call[];
  /** Strain of the final contract; null when unknown. Needed to read a 4-level jump to a new suit as a splinter. */
  trump: Strain | null;
  /** System rule matched by each call (inferConstraints order). Gives the GF raises and the game-forcing context. */
  matched?: readonly (Rule | undefined)[];
}

interface Fit {
  suit: Suit;
  index: number;
  level: number;
}

interface Side {
  bid: Set<Suit>[];
  firstBid: (string | undefined)[];
  fit: Fit | null;
  gf: boolean;
  asker: number | null;
  askReplyAt: number;
  replyAt: Set<number>;
}

const isSuit = (s: string): s is Suit => (SUITS as readonly string[]).includes(s);

/**
 * Control-bid test of Bridge Matey rulings 01 (section 2), per partnership, in auction order. A call is counted when:
 *  - "cue": after a trump fit is agreed, a bid by the fit side of a suit it has not bid before, other than trump,
 *    at the 4 level or higher; or at the 3 level (below 3NT) when the fit is a major agreed at the 2 or 3 level and the
 *    side's earlier calls include a game-forcing system rule.
 *  - "keycard-ask": 4NT by the fit side after the fit. "king-ask": 5NT after a keycard ask.
 *  - "queen-ask": a 5-level suit by the asker after the keycard reply (the K/Q ask or the ask with a void).
 *  - "reply": the partner's next call after any ask.
 * Not counted: a bid of the opponents' suit as such (Michaels, unassuming cue raise, western cue), and any other
 * 5-level suit after a keycard ask.
 * A fit is agreed when a suit already bid naturally by one partner is bid by the other (support), when a 4-level
 * jump to a new suit follows partner's bid of the trump suit (splinter), or when a game-forcing system rule shows
 * 3+ cards in a suit the partner bid (GF raise). The first suit bid by the responder over a 1NT/2NT opening is treated
 * as artificial (Stayman, transfer) and never recorded. A fourth-suit-forcing bid (rule kind `fourth_suit`) is artificial:
 * never recorded as a suit bid, never a cue, but its forcing value still counts toward the game-forcing context.
 */
export function controlCalls(inp: ControlInput): ControlCall[] {
  const { auction, trump, matched } = inp;
  const out: ControlCall[] = [];
  const sides: Side[] = [0, 1].map(() => ({ bid: [new Set<Suit>(), new Set<Suit>()], firstBid: [undefined, undefined], fit: null, gf: false, asker: null, askReplyAt: -1, replyAt: new Set<number>() }));
  const seen = (st: Side, s: Suit): boolean => st.bid[0]!.has(s) || st.bid[1]!.has(s);

  for (let i = 0; i < auction.length; i++) {
    const call = auction[i]!;
    const st = sides[i % 2]!;
    const me = (i % 4) >> 1;
    const gfBefore = st.gf;
    if (matched?.[i]?.forcing === "GF") st.gf = true;
    if (!isBid(call)) continue;
    if (matched?.[i] && ruleKind(matched[i]!) === "fourth_suit") continue;
    const level = Number(call[0]);
    const strain = call[1]!;
    const partnerFirst = st.firstBid[1 - me];
    const first = st.firstBid[me] === undefined;
    st.firstBid[me] ??= call;

    if (st.replyAt.has(i)) {
      out.push({ index: i, kind: "reply" });
      continue;
    }
    if (strain === "N") {
      if (st.fit && i > st.fit.index && level === 4 && st.asker === null) {
        st.asker = me;
        st.askReplyAt = i + 2;
        st.replyAt.add(i + 2);
        out.push({ index: i, kind: "keycard-ask" });
      } else if (st.fit && st.asker !== null && level === 5 && i > st.askReplyAt) {
        st.replyAt.add(i + 2);
        out.push({ index: i, kind: "king-ask" });
      }
      continue;
    }
    if (!isSuit(strain)) continue;
    const ntOpened = partnerFirst !== undefined && partnerFirst[1] === "N" && Number(partnerFirst[0]) <= 2;
    if (first && ntOpened && level <= 4) continue;

    if (!st.fit) {
      const gfRaise = matched?.[i]?.forcing === "GF" ? [...st.bid[1 - me]!].find((s) => !st.bid[me]!.has(s) && (matched[i]!.shows.len?.[s]?.[0] ?? 0) >= 3) : undefined;
      if (st.bid[1 - me]!.has(strain)) st.fit = { suit: strain, index: i, level };
      else if (gfRaise) st.fit = { suit: gfRaise, index: i, level };
      else if (trump && trump !== "N" && strain !== trump && level === 4 && st.bid[1 - me]!.has(trump) && !st.bid[me]!.has(trump) && !seen(st, strain)) st.fit = { suit: trump, index: i, level };
      else st.bid[me]!.add(strain);
      continue;
    }
    if (strain === st.fit.suit) continue;
    const fresh = !seen(st, strain);
    st.bid[me]!.add(strain);
    if (st.asker !== null) {
      if (me === st.asker && i > st.askReplyAt && level === 5) {
        st.replyAt.add(i + 2);
        out.push({ index: i, kind: "queen-ask" });
      }
      continue;
    }
    const major = st.fit.suit === "S" || st.fit.suit === "H";
    if (fresh && (level >= 4 || (level === 3 && major && (st.fit.level === 2 || st.fit.level === 3) && gfBefore))) out.push({ index: i, kind: "cue" });
  }
  return out;
}

export const auctionHasControlBid = (inp: ControlInput): boolean => controlCalls(inp).length > 0;
