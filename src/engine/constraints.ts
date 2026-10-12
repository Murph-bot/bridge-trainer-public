import { candidates, sideVulnerable } from "./matcher.ts";
import type { Call, ConstraintSet, PlayerConstraints, Range, Rule, Seat, Suit, SystemFile, Vul } from "./types.ts";
import { ruleKind, SEATS, SUITS } from "./types.ts";
import { BUNDLED_OVERRIDES } from "./overrides.ts";
import type { SystemOverride } from "./overrides.ts";

export interface InferInput {
  auction: Call[];
  dealer: Seat;
  /** Informational: the leader's own entry is still inferred; the dealer overrides it with the known hand. */
  leader: Seat;
  profiles: Record<Seat, SystemFile>;
  vul?: Vul;
  /** Readings for calls no system rule matched; defaults to data/system-overrides.json. */
  overrides?: readonly SystemOverride[];
}

const narrow = (a: Range, b: Range): Range => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
const fullLen = (): Record<Suit, Range> => ({ S: [0, 13], H: [0, 13], D: [0, 13], C: [0, 13] });

export function emptyPlayer(): PlayerConstraints {
  return {
    hard: { hcp: [0, 37], len: fullLen(), all: [] },
    soft: { hcp: [0, 37], len: fullLen(), none: [] },
    rules: [],
    unmatched: [],
    conflicts: [],
  };
}

export function applyShows(P: PlayerConstraints, shows: ConstraintSet, slack: number, ruleId: string): void {
  const { hard, soft } = P;
  if (shows.hcp) {
    const h = shows.hcp;
    const hh = narrow(hard.hcp, [Math.max(0, h[0] - slack), Math.min(37, h[1] + slack)]);
    if (hh[0] > hh[1]) {
      P.conflicts.push(`${ruleId}: hcp [${h.join(", ")}] conflicts with [${hard.hcp.join(", ")}]; kept as soft only`);
      soft.hcp = [h[0], h[1]];
    } else {
      hard.hcp = hh;
      const sh = narrow(soft.hcp, h);
      if (sh[0] <= sh[1]) soft.hcp = sh;
    }
  }
  for (const s of SUITS) {
    const rng = shows.len?.[s];
    if (!rng) continue;
    const nl = narrow(hard.len[s], rng);
    if (nl[0] > nl[1]) {
      P.conflicts.push(`${ruleId}: len ${s} [${rng.join(", ")}] conflicts with [${hard.len[s].join(", ")}]; kept as soft only`);
      soft.len[s] = [rng[0], rng[1]];
    } else {
      hard.len[s] = nl;
      soft.len[s] = narrow(soft.len[s], rng);
    }
  }
  const { hcp: _hcp, len: _len, ...rest } = shows;
  if (Object.keys(rest).length > 0) hard.all.push(rest);
}

/** Natural reading of a call that has no rule. */
export function fallback(call: Call, auction: readonly Call[], i: number, artificial: ReadonlySet<number> = new Set()): ConstraintSet {
  if (call === "P" || call === "X" || call === "XX") return {};
  const level = Number(call[0]);
  const suit = call[1]!;
  if (suit === "N") return level <= 3 ? { shape: "semibalanced" } : {};
  const bidSuits = (from: number): Set<string> => {
    const out = new Set<string>();
    for (let j = from; j >= 0; j -= 4) if (/^\d/.test(auction[j]!) && !artificial.has(j)) out.add(auction[j]![1]!);
    return out;
  };
  if (bidSuits(i - 4).has(suit)) return {};
  if (bidSuits(i - 2).has(suit)) return { len: { [suit]: [3, 13] } };
  return { len: { [suit]: [level === 1 ? 4 : 5, 13] } };
}

function candidatesAt(input: InferInput, i: number): Map<string, Rule> {
  const { auction, dealer, profiles, vul } = input;
  const seat = SEATS[(SEATS.indexOf(dealer) + i) % 4]!;
  const passed = [...Array(Math.floor(i / 4)).keys()].some((k) => auction[i - 4 * (k + 1)] === "P");
  return candidates(profiles[seat], {
    prefix: auction.slice(0, i),
    seatNo: (i % 4) + 1,
    passed,
    vul: vul ? sideVulnerable(vul, seat) : undefined,
  });
}

/** The system rule each call of the auction matched, undefined for a call no rule covers. */
export const matchCalls = (input: InferInput): (Rule | undefined)[] => input.auction.map((call, i) => candidatesAt(input, i).get(call));

export function inferConstraints(input: InferInput): Record<Seat, PlayerConstraints> {
  const { auction, dealer, profiles } = input;
  const players: Record<Seat, PlayerConstraints> = { N: emptyPlayer(), E: emptyPlayer(), S: emptyPlayer(), W: emptyPlayer() };
  const d = SEATS.indexOf(dealer);
  const artificial = new Set<number>();
  const overrides = input.overrides ?? BUNDLED_OVERRIDES;
  const matchedIds: (string | undefined)[] = [];
  auction.forEach((call, i) => {
    const seat = SEATS[(d + i) % 4]!;
    const slack = profiles[seat].meta.constraintConventions.hcpSlack;
    const cands = candidatesAt(input, i);
    const P = players[seat];
    const r = cands.get(call);
    matchedIds[i] = r?.id;
    const override = r ? undefined : overrides.find((o) => o.call === call && matchedIds[i - 2] === o.afterRule);
    if (override) {
      applyShows(P, override.shows, slack, override.id);
      P.rules.push(override.id);
    } else if (r) {
      if (ruleKind(r) === "fourth_suit") artificial.add(i);
      applyShows(P, r.shows, slack, r.id);
      P.rules.push(r.id);
      for (const [k, c] of cands) {
        if (k !== call && c.inferable && c.priority > r.priority && Object.keys(c.shows).length > 0) P.soft.none.push({ from: c.id, shows: c.shows });
      }
    } else {
      const fb = fallback(call, auction, i, artificial);
      if (Object.keys(fb).length > 0) applyShows(P, fb, 0, `fallback:${call}`);
      P.unmatched.push({ index: i, call, fallback: fb });
    }
  });
  return players;
}

export interface ConstraintSummary {
  hard: { hcp: Range; len: Partial<Record<Suit, Range>>; all?: ConstraintSet[] };
  soft: { hcp: Range; len: Partial<Record<Suit, Range>>; notAnyFromSiblings?: string[] };
  rules: string[];
  unmatched?: PlayerConstraints["unmatched"];
  conflicts?: string[];
}

/** Compact form used by the golden examples (full-range suits dropped, empty lists omitted). */
export function summarize(P: PlayerConstraints): ConstraintSummary {
  const lens = (l: Record<Suit, Range>): Partial<Record<Suit, Range>> => {
    const out: Partial<Record<Suit, Range>> = {};
    for (const s of SUITS) if (l[s][0] !== 0 || l[s][1] !== 13) out[s] = l[s];
    return out;
  };
  const out: ConstraintSummary = {
    hard: { hcp: P.hard.hcp, len: lens(P.hard.len) },
    soft: { hcp: P.soft.hcp, len: lens(P.soft.len) },
    rules: P.rules,
  };
  if (P.hard.all.length) out.hard.all = P.hard.all;
  if (P.soft.none.length) out.soft.notAnyFromSiblings = P.soft.none.map((n) => n.from);
  if (P.unmatched.length) out.unmatched = P.unmatched;
  if (P.conflicts.length) out.conflicts = P.conflicts;
  return out;
}
