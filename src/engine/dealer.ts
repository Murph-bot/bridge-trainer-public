import { auctionHasControlBid } from "./controlbids.ts";
import type { ControlInput } from "./controlbids.ts";
import { seatAfter } from "./contract.ts";
import { analyse, lenCmpOk, satisfies, shapeOk } from "./hand.ts";
import type { Call, Card, ConstraintSet, Contract, Deal, Hand, PlayerConstraints, Range, Seat, Strain, Suit } from "./types.ts";
import { RANKS, SEATS, SUITS } from "./types.ts";

/**
 * PRNG: sfc32 (Chris Doty-Humphrey's "small fast counting" generator, 128-bit state, 32-bit output).
 * The four state words are filled from the user seed with splitmix32, and the first 12 outputs are discarded.
 * Same seed -> same stream on every platform (pure 32-bit integer arithmetic).
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const u32 = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) u32();
  return { next: () => u32() / 4294967296, int: (n) => Math.floor((u32() / 4294967296) * n) };
}

export interface DealInput {
  known: { seat: Seat; cards: Card[] };
  constraints: Record<Seat, PlayerConstraints>;
  /** Accepted deals wanted. */
  target: number;
  /** Tries budget per attempt (each relaxation stage gets its own). */
  max: number;
  timeoutMs: number;
  seed: number;
  /** Soft acceptance probability is softPenalty^violations. Default 0.3. */
  softPenalty?: number;
  /** Fewer accepted deals than this triggers the relaxation ladder. Default min(200, target). */
  minDeals?: number;
  /** Optional AK-proof filter, see cashableSideAKSuits. */
  akProof?: { declarer: Seat; trump: Strain };
  /** Pin the relaxation stage (0 none, 1 drop-soft, 2 drop-soft + hcp slack) instead of climbing the ladder. */
  stage?: number;
}

export interface DealResult {
  deals: Deal[];
  tried: number;
  acceptanceRate: number;
  /** Fewer than `target` deals because the time/tries budget ran out or the constraints are infeasible. */
  timedOut: boolean;
  /** Relaxations applied by the returned attempt, in order: "drop-soft", "widen-hcp-slack-2". */
  relaxations: string[];
  /** Relaxation stage of the returned attempt (see DealInput.stage). */
  stage: number;
  elapsedMs: number;
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600, 6227020800];
const SUIT_RANK_ORDER = new Map<string, number>(RANKS.map((r, i) => [r, i]));
const now = (): number => performance.now();

/** Sound length-only pruning of a constraint set: false only if the lengths alone already violate it. */
function lengthPossible(cs: ConstraintSet, len: Record<Suit, number>): boolean {
  for (const s of SUITS) {
    const r = cs.len?.[s];
    if (r && !(r[0] <= len[s] && len[s] <= r[1])) return false;
  }
  if (cs.shape && !shapeOk(cs.shape, len)) return false;
  if (cs.lenCmp && !lenCmpOk(cs.lenCmp, len)) return false;
  if (cs.anyOf && !cs.anyOf.some((x) => lengthPossible(x, len))) return false;
  return true;
}

interface Stage {
  dropSoft: boolean;
  widenHcp: boolean;
}

const STAGES: Stage[] = [
  { dropSoft: false, widenHcp: false },
  { dropSoft: true, widenHcp: false },
  { dropSoft: true, widenHcp: true },
];
const STAGE_BUDGET_SHARE = [0.5, 0.75, 1];

type Vec = [number, number, number, number];

const vecKey = (v: Vec): number => ((v[0] * 14 + v[1]) * 14 + v[2]) * 14 + v[3];

function lengthVectors(P: PlayerConstraints, rem: Record<Suit, number>): Vec[] {
  const r = (s: Suit): Range => [P.hard.len[s][0], Math.min(P.hard.len[s][1], rem[s])];
  const out: Vec[] = [];
  const [rs, rh, rd, rc] = [r("S"), r("H"), r("D"), r("C")];
  for (let a = rs[0]; a <= rs[1]; a++)
    for (let b = rh[0]; b <= rh[1]; b++)
      for (let c = rd[0]; c <= rd[1]; c++) {
        const d = 13 - a - b - c;
        if (d < rc[0] || d > rc[1]) continue;
        const len = { S: a, H: b, D: c, C: d };
        if (P.hard.all.every((cs) => lengthPossible(cs, len))) out.push([a, b, c, d]);
      }
  return out;
}

interface Triples {
  vecs: [Vec, Vec, Vec][];
  cum: Float64Array;
}

/** All feasible (length vector per hidden hand) triples, each weighted by its number of card layouts. */
function buildTriples(hidden: [PlayerConstraints, PlayerConstraints, PlayerConstraints], rem: Record<Suit, number>): Triples {
  const [la, lb, lc] = hidden.map((P) => lengthVectors(P, rem)) as [Vec[], Vec[], Vec[]];
  const cSet = new Map<number, Vec>(lc.map((v) => [vecKey(v), v]));
  const vecs: [Vec, Vec, Vec][] = [];
  const weights: number[] = [];
  const remV = SUITS.map((s) => rem[s]);
  for (const a of la)
    for (const b of lb) {
      const c: Vec = [remV[0]! - a[0] - b[0], remV[1]! - a[1] - b[1], remV[2]! - a[2] - b[2], remV[3]! - a[3] - b[3]];
      if (c.some((x) => x < 0) || !cSet.has(vecKey(c))) continue;
      let w = 1;
      for (let i = 0; i < 4; i++) w /= FACT[a[i]!]! * FACT[b[i]!]! * FACT[c[i]!]!;
      vecs.push([a, b, c]);
      weights.push(w);
    }
  const cum = new Float64Array(weights.length);
  let acc = 0;
  weights.forEach((w, i) => (cum[i] = acc += w));
  return { vecs, cum };
}

function pickTriple(t: Triples, rng: Rng): [Vec, Vec, Vec] {
  const x = rng.next() * t.cum[t.cum.length - 1]!;
  let lo = 0;
  let hi = t.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.cum[mid]! <= x) lo = mid + 1;
    else hi = mid;
  }
  return t.vecs[lo]!;
}

function sortHand(cards: Card[]): Hand {
  return cards.sort((x, y) => SUITS.indexOf(x[1] as Suit) - SUITS.indexOf(y[1] as Suit) || SUIT_RANK_ORDER.get(x[0])! - SUIT_RANK_ORDER.get(y[0])!);
}

function shuffle<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function relaxed(P: PlayerConstraints, st: Stage): PlayerConstraints {
  if (!st.widenHcp) return P;
  return { ...P, hard: { ...P.hard, hcp: [Math.max(0, P.hard.hcp[0] - 1), Math.min(37, P.hard.hcp[1] + 1)] } };
}

interface Attempt {
  deals: Deal[];
  tried: number;
  budgetHit: boolean;
}

function attempt(input: DealInput, st: Stage, rng: Rng, deadline: number): Attempt {
  const { known, target, max, akProof } = input;
  const softPenalty = input.softPenalty ?? 0.3;
  const hiddenSeats = SEATS.filter((s) => s !== known.seat) as [Seat, Seat, Seat];
  const cons = hiddenSeats.map((s) => relaxed(input.constraints[s], st)) as [PlayerConstraints, PlayerConstraints, PlayerConstraints];
  const knownSet = new Set<string>(known.cards);
  const remCards: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const s of SUITS) for (const r of RANKS) if (!knownSet.has(r + s)) remCards[s].push((r + s) as Card);
  const rem: Record<Suit, number> = { S: remCards.S.length, H: remCards.H.length, D: remCards.D.length, C: remCards.C.length };

  const triples = buildTriples(cons, rem);
  if (triples.vecs.length === 0) return { deals: [], tried: 0, budgetHit: true };

  const knownHand = sortHand([...known.cards]);
  const deals: Deal[] = [];
  let tried = 0;
  let budgetHit = false;
  while (deals.length < target) {
    if (tried >= max || ((tried & 31) === 0 && now() > deadline)) {
      budgetHit = true;
      break;
    }
    tried++;
    const vecs = pickTriple(triples, rng);
    const hands: Card[][] = [[], [], []];
    for (let si = 0; si < 4; si++) {
      const cards = remCards[SUITS[si]!].slice();
      shuffle(cards, rng);
      let at = 0;
      for (let h = 0; h < 3; h++) {
        const n = vecs[h]![si]!;
        for (let k = 0; k < n; k++) hands[h]!.push(cards[at++]!);
      }
    }
    let violations = 0;
    let ok = true;
    for (let h = 0; h < 3 && ok; h++) {
      const P = cons[h]!;
      const info = analyse(hands[h]!);
      if (info.hcp < P.hard.hcp[0] || info.hcp > P.hard.hcp[1] || !P.hard.all.every((cs) => satisfies(cs, info))) {
        ok = false;
        break;
      }
      if (st.dropSoft) continue;
      if (info.hcp < P.soft.hcp[0] || info.hcp > P.soft.hcp[1]) violations++;
      for (const s of SUITS) if (info.len[s] < P.soft.len[s][0] || info.len[s] > P.soft.len[s][1]) violations++;
      for (const n of P.soft.none) if (satisfies(n.shows, info)) violations++;
    }
    if (!ok) continue;
    const deal = { [known.seat]: knownHand } as Deal;
    hiddenSeats.forEach((s, h) => (deal[s] = sortHand(hands[h]!)));
    if (akProof && defenceHasCashableSideAK(deal, akProof.declarer, akProof.trump)) continue;
    if (violations > 0 && rng.next() >= softPenalty ** violations) continue;
    deals.push(deal);
  }
  return { deals, tried, budgetHit };
}

/**
 * Rejection sampler with shape-first dealing.
 * 1. Enumerate suit-length vectors per hidden hand from the hard `len` ranges, shape/lenCmp/anyOf-on-length predicates.
 * 2. Keep triples whose columns sum to the remaining suit lengths; sample one weighted by the number of card layouts
 *    (prod over suits of 1/(a!b!c!)), so the length distribution is unbiased.
 * 3. Shuffle each suit's remaining cards and deal them by the sampled lengths.
 * 4. Check hard hcp/predicates, the optional AK filter, then accept with probability softPenalty^violations.
 * Relaxation ladder when an attempt yields fewer than minDeals: drop soft constraints, then widen the hard hcp
 * range by 1 on each side (hcpSlack 1 -> 2), each attempt restarting from scratch. The attempts share the
 * time budget (50% / 75% / 100% of timeoutMs, cumulative). A structurally infeasible length system returns at once.
 */
export function deal(input: DealInput): DealResult {
  if (input.known.cards.length !== 13) throw new Error("known hand must have 13 cards");
  const start = now();
  const minDeals = input.minDeals ?? Math.min(200, input.target);
  const rng = makeRng(input.seed);
  const relaxations: string[] = [];
  let last: Attempt = { deals: [], tried: 0, budgetHit: true };
  let stage = 0;
  const pinned = input.stage !== undefined;
  for (let i = pinned ? input.stage! : 0; i < (pinned ? input.stage! + 1 : STAGES.length); i++) {
    const st = STAGES[i]!;
    stage = i;
    relaxations.length = 0;
    if (st.dropSoft) relaxations.push("drop-soft");
    if (st.widenHcp) relaxations.push("widen-hcp-slack-2");
    last = attempt(input, st, rng, start + input.timeoutMs * (pinned ? 1 : STAGE_BUDGET_SHARE[i]!));
    if (last.deals.length >= minDeals) break;
  }
  return {
    deals: last.deals,
    tried: last.tried,
    acceptanceRate: last.tried === 0 ? 0 : last.deals.length / last.tried,
    timedOut: last.deals.length < input.target,
    relaxations: [...relaxations],
    stage,
    elapsedMs: now() - start,
  };
}

/**
 * AK-proof definition (Bridge Matey rulings 01, section 1; lead-weights.md B7, SU-082/SU-083). A non-trump suit is
 * "cashable" when the defenders (leader + partner) together hold its ace and king, the partner holds at least one of
 * them, and, in a suit contract, declarer and dummy each hold at least two cards in it (a 0-1 card holding is ruffed
 * on the second round). Against notrump the lengths do not matter. A suit where the leader alone holds both honours
 * is skipped: the leader's hand is fixed by the problem, so it would reject every deal.
 */
export function cashableSideAKSuits(deal: Deal, declarer: Seat, trump: Strain): Suit[] {
  const dummy = seatAfter(declarer, 2);
  const leader = seatAfter(declarer, 1);
  const partner = seatAfter(declarer, 3);
  const holds = (seat: Seat, c: Card): boolean => deal[seat].includes(c);
  const count = (seat: Seat, suit: Suit): number => deal[seat].filter((c) => c[1] === suit).length;
  return SUITS.filter((s) => {
    if (s === trump) return false;
    const [a, k] = [`A${s}`, `K${s}`] as const;
    const both = (holds(leader, a) || holds(partner, a)) && (holds(leader, k) || holds(partner, k));
    if (!both || (holds(leader, a) && holds(leader, k))) return false;
    if (!holds(partner, a) && !holds(partner, k)) return false;
    return trump === "N" || (count(declarer, s) >= 2 && count(dummy, s) >= 2);
  });
}

export function defenceHasCashableSideAK(deal: Deal, declarer: Seat, trump: Strain): boolean {
  return cashableSideAKSuits(deal, declarer, trump).length > 0;
}

/** The AK-proof filter applies to slam contracts when the auction has a control bid or keycard ask, or the user marks it disciplined. */
export function akProofApplies(auction: readonly Call[], contract: Contract, disciplined = false, matched?: ControlInput["matched"]): boolean {
  return contract.level >= 6 && (disciplined || auctionHasControlBid({ auction, trump: contract.strain, matched }));
}
