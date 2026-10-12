import type { Rank, Suit } from "../engine/types.ts";
import { SUITS } from "../engine/types.ts";
import { holdsTokens, sortedRanks, suitRole, suitViews } from "./patterns.ts";
import type { SuitPred } from "./patterns.ts";
import type { LeadContext, PerScoring, Scoring } from "./types.ts";

/** Conditions on one suit of the leader's hand. Every given field must hold. */
export interface SuitSpec {
  role?: string[];
  minLen?: number;
  has?: Rank[];
  lacks?: Rank[];
  /** The top cards in order, e.g. "KQJT" or "Q". */
  headedBy?: string;
  /** Token string as in holding patterns ("AQxx"): exact length, 'x' = spot card. */
  exact?: string;
  /** No card above this rank in the suit. */
  noHonourAbove?: Rank;
}

/** Conditions on the other three suits. */
export interface OutsideSpec {
  minAces?: number;
  /** No card of these ranks in any other suit. */
  none?: Rank[];
}

export type CardKindName = "any" | "ace" | "king" | "queen" | "jack" | "ten" | "low" | "top" | "fourth";

export interface AvoidSpec {
  /** Whose cards are avoided: the matched suit itself, the paired suits of a "paired" machine, or the other candidates of a "longer" machine. */
  target: "matched" | "others";
  kinds: PerScoring<CardKindName[]>;
}

interface MachineBase {
  /** Matched cards count against the rule instead of for it (the rule says "not this suit"). */
  negative?: boolean;
  avoid?: AvoidSpec;
}

export type Machine =
  | (MachineBase & { kind: "suit"; spec: SuitSpec; outside?: OutsideSpec; allSuits?: Suit[] })
  | (MachineBase & { kind: "paired"; primary: SuitSpec; other: SuitSpec; similar: { honourMask?: boolean; hcpWithin?: number } })
  | (MachineBase & { kind: "longer"; candidates: SuitSpec; minCandidates: number })
  | (MachineBase & { kind: "tip" });

export interface RuleOverlay {
  machine?: Machine;
  card?: PerScoring<string>;
  weight?: PerScoring<number>;
  technical?: boolean;
}

export interface MachineResult {
  matched: Suit[];
  others: Suit[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const RANK_ORDER = "AKQJT98765432";
const HON = ["A", "K", "Q", "J", "T"] as const;

export function parseMachine(raw: unknown, where: string): Machine {
  if (!isObj(raw) || typeof raw.kind !== "string" || !["suit", "paired", "longer", "tip"].includes(raw.kind)) throw new Error(`${where}: machine needs a known kind`);
  return raw as unknown as Machine;
}

function specPred(spec: SuitSpec): SuitPred {
  const roles = (spec.role ?? []).map((r) => {
    const p = suitRole(r);
    if (!p) throw new Error(`machine: unknown suit role "${r}"`);
    return p;
  });
  return (v, ctx) => {
    const r = v.ranks;
    if (!roles.every((p) => p(v, ctx))) return false;
    if (spec.minLen !== undefined && r.length < spec.minLen) return false;
    if (spec.has && !spec.has.every((x) => r.includes(x))) return false;
    if (spec.lacks && spec.lacks.some((x) => r.includes(x))) return false;
    if (spec.headedBy !== undefined && r.slice(0, spec.headedBy.length).join("") !== spec.headedBy) return false;
    if (spec.exact !== undefined && !holdsTokens(spec.exact, r)) return false;
    if (spec.noHonourAbove !== undefined && r.some((x) => RANK_ORDER.indexOf(x) < RANK_ORDER.indexOf(spec.noHonourAbove!))) return false;
    return true;
  };
}

const HCP: Partial<Record<Rank, number>> = { A: 4, K: 3, Q: 2, J: 1 };
const hcpOf = (r: readonly Rank[]): number => r.reduce((n, x) => n + (HCP[x] ?? 0), 0);
const maskOf = (r: readonly Rank[]): string => HON.filter((x) => r.includes(x)).join("");

/** Which suits of the leader's hand the machine matches, and the suits it sets them against. */
export function runMachine(m: Machine, ctx: LeadContext): MachineResult {
  const views = suitViews(ctx.hand).map((v) => ({ suit: v.suit as Suit, ranks: sortedRanks(v.ranks) }));
  const outsideOk = (v: { suit: Suit }, o: OutsideSpec | undefined): boolean => {
    if (!o) return true;
    const rest = views.filter((w) => w.suit !== v.suit);
    if (o.minAces !== undefined && rest.filter((w) => w.ranks.includes("A")).length < o.minAces) return false;
    if (o.none && rest.some((w) => w.ranks.some((x) => o.none!.includes(x)))) return false;
    return true;
  };
  switch (m.kind) {
    case "suit": {
      const pred = specPred(m.spec);
      const all = m.allSuits ? m.allSuits.every((s) => views.some((w) => w.suit === s && pred(w, ctx))) : true;
      const matched = all ? views.filter((v) => pred(v, ctx) && (!m.allSuits || m.allSuits.includes(v.suit)) && outsideOk(v, m.outside)).map((v) => v.suit) : [];
      return { matched, others: [] };
    }
    case "paired": {
      const p = specPred(m.primary);
      const q = specPred(m.other);
      const matched: Suit[] = [];
      const others = new Set<Suit>();
      for (const v of views.filter((x) => p(x, ctx))) {
        const mates = views.filter((w) => w.suit !== v.suit && q(w, ctx) && w.ranks.length === v.ranks.length && ((m.similar.honourMask && maskOf(w.ranks) === maskOf(v.ranks)) || (m.similar.hcpWithin !== undefined && Math.abs(hcpOf(w.ranks) - hcpOf(v.ranks)) <= m.similar.hcpWithin)));
        if (mates.length > 0) {
          matched.push(v.suit);
          for (const w of mates) others.add(w.suit);
        }
      }
      return { matched, others: SUITS.filter((s) => others.has(s) && !matched.includes(s)) };
    }
    case "longer": {
      const pred = specPred(m.candidates);
      const cand = views.filter((v) => pred(v, ctx));
      const max = Math.max(...cand.map((v) => v.ranks.length));
      const top = cand.filter((v) => v.ranks.length === max);
      if (cand.length < m.minCandidates || top.length !== 1) return { matched: [], others: [] };
      return { matched: [top[0]!.suit], others: cand.filter((v) => v !== top[0]).map((v) => v.suit) };
    }
    case "tip":
      return { matched: [], others: [] };
  }
}

export const forScoring = <T>(x: PerScoring<T>, scoring: Scoring): T => (isObj(x) && "IMP" in x && "MP" in x ? (x as { IMP: T; MP: T })[scoring] : (x as T));
