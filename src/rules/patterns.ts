import type { Card, Rank, Suit } from "../engine/types.ts";
import { RANKS, SUITS } from "../engine/types.ts";
import type { LeadContext, Scoring } from "./types.ts";

/** A suit of the leader's hand, ranks high to low. */
export interface SuitView {
  suit: Suit;
  ranks: Rank[];
}

const RANK_ORDER = "AKQJT98765432";
export const sortedRanks = (ranks: Rank[]): Rank[] => [...ranks].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));

export function suitViews(hand: readonly Card[]): SuitView[] {
  return SUITS.map((suit) => ({ suit, ranks: hand.filter((c) => c[1] === suit).map((c) => c[0] as Rank) })).filter((v) => v.ranks.length > 0);
}

export type SuitPred = (v: SuitView, ctx: LeadContext) => boolean;

const MAJORS: readonly Suit[] = ["S", "H"];
const HONOURS: readonly Rank[] = ["A", "K", "Q", "J"];
const isSpot = (r: Rank): boolean => !"AKQJT".includes(r);
const longest = (ctx: LeadContext): number => Math.max(...SUITS.map((s) => ctx.info.len[s]));

const hasTouchingTop = (r: readonly Rank[]): boolean => r.length >= 2 && [...HONOURS, "T"].includes(r[0]!) && RANKS.indexOf(r[0]!) + 1 === RANKS.indexOf(r[1]!);
const noAKQ = (r: readonly Rank[]): boolean => !r.some((x) => x === "A" || x === "K" || x === "Q");

const norm = (s: string): string => s.trim().replace(/10/g, "T").replace(/\s+/g, " ");

/** suit_role values of lead-rules.schema.json, plus the qualifiers that appear inside holding patterns. */
const ROLES: Record<string, SuitPred> = {
  any: () => true,
  side_suit: (v, c) => c.trump === null || v.suit !== c.trump,
  trump: (v, c) => v.suit === c.trump,
  major: (v) => MAJORS.includes(v.suit),
  minor: (v) => !MAJORS.includes(v.suit),
  "long suit": (v, c) => v.ranks.length === longest(c),
  "own suit": (v, c) => (c.roles.own.length > 0 ? c.roles.own.includes(v.suit) : v.ranks.length === longest(c)),
  own_bid_suit: (v, c) => c.roles.own.includes(v.suit),
  partner_suit: (v, c) => c.roles.partner.includes(v.suit),
  dummy_suit: (v, c) => c.roles.dummy.includes(v.suit),
  declarer_suit: (v, c) => c.roles.declarer.includes(v.suit),
  declarer_second_suit: (v, c) => c.roles.declarerSecond === v.suit,
  unbid_suit: (v, c) => c.roles.unbid.includes(v.suit),
  unbid_major: (v, c) => c.roles.unbid.includes(v.suit) && MAJORS.includes(v.suit),
  stayman_major: (v, c) => c.roles.staymanMajor === v.suit,
};

const QUALIFIERS: Record<string, SuitPred> = {
  major: ROLES.major!,
  minor: ROLES.minor!,
  trump: ROLES.trump!,
  own: ROLES.own_bid_suit!,
  unbid: ROLES.unbid_suit!,
  "unbid suit": ROLES.unbid_suit!,
  "new suit": ROLES.unbid_suit!,
  "dummy suit": ROLES.dummy_suit!,
  "dummy's suit": ROLES.dummy_suit!,
  "responder's suit": ROLES.dummy_suit!,
  "partner suit": ROLES.partner_suit!,
  "partner's suit": ROLES.partner_suit!,
  "partner's minor": (v, c) => c.roles.partner.includes(v.suit) && !MAJORS.includes(v.suit),
  "partner's weak-two suit": ROLES.partner_suit!,
  "opener's suit": (v, c) => c.roles.declarerFirst === v.suit,
  "opener's first suit": (v, c) => c.roles.declarerFirst === v.suit,
  "declarer's first suit": (v, c) => c.roles.declarerFirst === v.suit,
  "declarer's 2nd suit": ROLES.declarer_second_suit!,
  "declarer major": (v, c) => c.roles.declarer.includes(v.suit) && MAJORS.includes(v.suit),
  "splinter suit": (v, c) => c.roles.splinter === v.suit,
  "ace-shown suit": (v, c) => c.roles.shownAce.includes(v.suit),
  "shorter minor": (v, c) => !MAJORS.includes(v.suit) && v.ranks.length < c.info.len[v.suit === "D" ? "C" : "D"],
  doubleton: (v) => v.ranks.length === 2,
  sequence: (v) => hasTouchingTop(v.ranks),
  "other major": (v, c) => MAJORS.includes(v.suit) && !c.roles.dummy.includes(v.suit) && !c.roles.declarer.includes(v.suit),
};

export const suitRole = (role: string): SuitPred | null => ROLES[role] ?? QUALIFIERS[role] ?? null;

function tokenOk(tok: string, r: Rank): boolean {
  if (tok === "x") return isSpot(r);
  if (tok === "H") return HONOURS.includes(r);
  return tok === r;
}

/** Exact-holding token string, e.g. "KQxx": same length, 'x' = spot card, 'H' = any honour. */
export const holdsTokens = (tokens: string, ranks: readonly Rank[]): boolean => ranks.length === tokens.length && [...tokens].every((t, i) => tokenOk(t, ranks[i]!));

const TOKENS = /^[AKQJT98765432xH]+$/;

/** Splits "Kxxx (partner's suit)" / "Kx in partner suit" into the body and its qualifier predicates; null if a qualifier is unknown. */
function splitQualifiers(text: string): { body: string; quals: SuitPred[] } | null {
  const quals: SuitPred[] = [];
  let body = text;
  const inRole = /\s+in ((?:partner(?:'s)?|dummy's) suit|new suit|declarer major|declarer's major|opener's (?:first )?suit|declarer's first suit)$/.exec(body);
  if (inRole) {
    quals.push(QUALIFIERS[inRole[1]!.replace("declarer's major", "declarer major")]!);
    body = body.slice(0, inRole.index);
  }
  const trailing = /\s+(major|minor|majors|own|unbid|doubleton|sequence)$/.exec(body);
  if (trailing) {
    quals.push(QUALIFIERS[trailing[1]!.replace(/s$/, "")]!);
    body = body.slice(0, trailing.index);
  }
  for (const m of body.matchAll(/\(([^)]*)\)/g)) {
    const q = QUALIFIERS[m[1]!.trim()];
    if (!q) return null;
    quals.push(q);
  }
  return { body: body.replace(/\([^)]*\)/g, "").trim(), quals };
}

export interface HoldingMatcher {
  matches: SuitPred;
}

/** Parses one `holding.patterns` entry of lead-rules.json; null when the notation is not understood. */
export function parseHolding(raw: string): HoldingMatcher | null {
  let text = norm(raw);
  const out: SuitPred[] = [];
  if (text.startsWith("trump:")) {
    out.push(ROLES.trump!);
    text = text.slice(6).trim();
  }
  const q = splitQualifiers(text);
  if (!q) return null;
  out.push(...q.quals);
  const body = q.body;
  let shape: ((v: SuitView, c: LeadContext) => boolean) | null = null;
  if (body === "any") shape = () => true;
  else if (body === "long suit") shape = ROLES["long suit"]!;
  else if (body === "6+ card suit") shape = (v) => v.ranks.length >= 6;
  else if (body === "partner suit") shape = ROLES.partner_suit!;
  else if (body === "side ace") shape = (v, c) => v.ranks[0] === "A" && v.suit !== c.trump;
  else if (body === "singleton") shape = (v) => v.ranks.length === 1;
  else if (body === "singleton honour") shape = (v) => v.ranks.length === 1 && HONOURS.includes(v.ranks[0]!);
  else {
    const s = /^singleton ([AKQJT](?:\/[AKQJT])*)$/.exec(body);
    if (s) {
      const set = s[1]!.split("/");
      shape = (v) => v.ranks.length === 1 && set.includes(v.ranks[0]!);
    } else {
      const alts = body.split(/\s*\/\s*/);
      if (alts.every((a) => TOKENS.test(a))) shape = (v) => alts.some((a) => holdsTokens(a, v.ranks));
    }
  }
  if (!shape) return null;
  const s = shape;
  return { matches: (v, c) => out.every((p) => p(v, c)) && s(v, c) };
}

export type CardKind = "any" | "ace" | "king" | "queen" | "jack" | "ten" | "low" | "top" | "fourth";

/** Cards of the suit the kind selects. */
export function pickCards(kind: CardKind, v: SuitView): Card[] {
  const c = (r: Rank | undefined): Card[] => (r === undefined ? [] : [(r + v.suit) as Card]);
  switch (kind) {
    case "any": return v.ranks.map((r) => (r + v.suit) as Card);
    case "ace": return c(v.ranks.find((r) => r === "A"));
    case "king": return c(v.ranks.find((r) => r === "K"));
    case "queen": return c(v.ranks.find((r) => r === "Q"));
    case "jack": return c(v.ranks.find((r) => r === "J"));
    case "ten": return c(v.ranks.find((r) => r === "T"));
    case "low": return c(v.ranks.at(-1));
    case "top": return c(v.ranks[0]);
    case "fourth": return v.ranks.length >= 4 ? c(v.ranks[3]) : [];
  }
}

const WORD_KIND: Record<string, CardKind> = {
  low: "low", lowest: "low", "low trump": "low", "low lead": "low", ace: "ace", a: "ace", king: "king", k: "king", queen: "queen", q: "queen", jack: "jack", j: "jack",
  "10": "ten", t: "ten", top: "top", "top honour": "top", honour: "top", "4th best": "fourth", singleton: "any", "-": "any", normal: "any", "normal card for holding": "any",
  "top of sequence": "top", "top of doubleton": "top", "top of nothing": "top", either: "any", "unusual honour": "top", "ace then low": "ace", "ace then k": "ace",
  "jack (top of interior sequence)": "jack", "jack (top of sequence)": "jack", "king (not low)": "king", "ace (never underlead)": "ace", "low (not the ace)": "low",
  "low (not from k)": "low", "low (2nd highest from xxx is fine)": "low", "ace or king (not jack)": "ace",
};

export interface CardSelector {
  kinds: CardKind[];
  /** All alternatives were understood. */
  resolved: boolean;
}

/** Reads recommendation.card ("low (IMPs) / top (MPs)", "ace", "top of doubleton / low from three", ...). */
export function parseCardSelector(raw: string, scoring: Scoring): CardSelector {
  const kinds = new Set<CardKind>();
  let resolved = true;
  const text = raw.trim().toLowerCase();
  if (WORD_KIND[text]) return { kinds: [WORD_KIND[text]!], resolved: true };
  for (const alt of text.split(/\s*(?:\/|;|\bor\b)\s*/)) {
    const qual = /\((imps|mps)\)|\bat (imps|mps)\b/.exec(alt);
    const only = qual ? (qual[1] ?? qual[2])!.toUpperCase().replace("IMPS", "IMP").replace("MPS", "MP") : null;
    if (only !== null && only !== scoring) continue;
    const word = alt.replace(/\s*\((?:imps|mps)\)/, "").replace(/\s+at (?:imps|mps)/, "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+from\b.*$/, "").trim();
    const k = WORD_KIND[word];
    if (k) kinds.add(k);
    else resolved = false;
  }
  return { kinds: kinds.size > 0 ? [...kinds] : ["any"], resolved };
}

export interface Descriptor {
  suit: SuitPred;
  kinds: CardKind[];
  /** Holds only in this scoring mode, when the text carried an (IMPs)/(MPs) qualifier. */
  only: Scoring | null;
}

const KEYWORDS: Record<string, { suit: SuitPred; kinds?: CardKind[] }> = {
  trump: { suit: ROLES.trump! },
  "trump ace": { suit: ROLES.trump!, kinds: ["ace"] },
  minor: { suit: ROLES.minor! },
  major: { suit: ROLES.major! },
  "other major": { suit: QUALIFIERS["other major"]! },
  "unbid major": { suit: ROLES.unbid_major! },
  "unbid suit": { suit: ROLES.unbid_suit! },
  unbid: { suit: ROLES.unbid_suit! },
  "unbid minor": { suit: (v, c) => c.roles.unbid.includes(v.suit) && !MAJORS.includes(v.suit) },
  "unbid diamonds": { suit: (v, c) => v.suit === "D" && c.roles.unbid.includes("D") },
  "dummy's suit": { suit: ROLES.dummy_suit! },
  "partner's suit": { suit: ROLES.partner_suit! },
  "opener's suit": { suit: QUALIFIERS["opener's suit"]! },
  "responder's suit": { suit: QUALIFIERS["responder's suit"]! },
  "partner's minor": { suit: QUALIFIERS["partner's minor"]! },
  "partner's weak-two suit": { suit: ROLES.partner_suit! },
  "declarer's second suit": { suit: ROLES.declarer_second_suit! },
  "declarer's major": { suit: QUALIFIERS["declarer major"]! },
  "own suit": { suit: ROLES["own suit"]! },
  "own overcalled suit": { suit: ROLES.own_bid_suit! },
  "splinter suit": { suit: QUALIFIERS["splinter suit"]! },
  "long suit": { suit: ROLES["long suit"]! },
  longest: { suit: ROLES["long suit"]! },
  "long minor": { suit: (v, c) => !MAJORS.includes(v.suit) && v.ranks.length === Math.max(c.info.len.D, c.info.len.C) },
  "longer minor": { suit: (v, c) => !MAJORS.includes(v.suit) && v.ranks.length > c.info.len[v.suit === "D" ? "C" : "D"] },
  "shorter minor": { suit: QUALIFIERS["shorter minor"]! },
  "shorter major": { suit: (v, c) => MAJORS.includes(v.suit) && v.ranks.length < c.info.len[v.suit === "S" ? "H" : "S"] },
  "shorter suit": { suit: (v, c) => v.ranks.length < longest(c) },
  ace: { suit: () => true, kinds: ["ace"] },
  queen: { suit: () => true, kinds: ["queen"] },
  jack: { suit: () => true, kinds: ["jack"] },
  "4th best": { suit: () => true, kinds: ["fourth"] },
  singleton: { suit: (v) => v.ranks.length === 1 },
  "singleton major": { suit: (v) => v.ranks.length === 1 && MAJORS.includes(v.suit) },
  "singleton ace": { suit: (v) => v.ranks.length === 1 && v.ranks[0] === "A" },
  doubleton: { suit: (v) => v.ranks.length === 2 },
  "honour doubleton": { suit: (v) => v.ranks.length === 2 && HONOURS.includes(v.ranks[0]!) },
  "kq suit": { suit: (v) => v.ranks[0] === "K" && v.ranks[1] === "Q" },
  "ak suit": { suit: (v) => v.ranks[0] === "A" && v.ranks[1] === "K" },
  "ace suit": { suit: (v) => v.ranks[0] === "A" },
  "side ace": { suit: (v, c) => v.ranks[0] === "A" && v.suit !== c.trump },
  "unsupported ace": { suit: (v) => v.ranks[0] === "A" && v.ranks[1] !== "K" && v.ranks[1] !== "Q", kinds: ["ace"] },
  "queen-headed suit": { suit: (v) => v.ranks[0] === "Q" },
  "jack-headed suit": { suit: (v) => v.ranks[0] === "J" },
  "honour suit": { suit: (v) => HONOURS.includes(v.ranks[0]!) },
  "touching honours": { suit: (v) => hasTouchingTop(v.ranks) },
  "honour sequence": { suit: (v) => hasTouchingTop(v.ranks) },
  sequence: { suit: (v) => hasTouchingTop(v.ranks) },
  "own sequence": { suit: (v, c) => ROLES["own suit"]!(v, c) && hasTouchingTop(v.ranks) },
  "safe sequence": { suit: (v) => hasTouchingTop(v.ranks) },
  hearts: { suit: (v) => v.suit === "H" },
  clubs: { suit: (v) => v.suit === "C" },
  spades: { suit: (v) => v.suit === "S" },
  diamonds: { suit: (v) => v.suit === "D" },
  "low trump": { suit: ROLES.trump!, kinds: ["low"] },
  passive: { suit: (v) => noAKQ(v.ranks), kinds: ["low"] },
  "passive lead": { suit: (v) => noAKQ(v.ranks), kinds: ["low"] },
  "passive low": { suit: (v) => noAKQ(v.ranks), kinds: ["low"] },
  "passive suit": { suit: (v) => noAKQ(v.ranks) },
  "passive spot leads": { suit: (v) => noAKQ(v.ranks) },
};

/** Reads a preference_over entry ("minor", "low from Kxxx", "K from KQxx", "5-card minor", ...). Null when not understood. */
export function parseDescriptor(raw: string): Descriptor | null {
  let text = raw.trim();
  let only: Scoring | null = null;
  const q = /\s*\((IMPs|MPs)\)$/.exec(text);
  if (q) {
    only = q[1] === "IMPs" ? "IMP" : "MP";
    text = text.slice(0, q.index);
  }
  const lower = text.toLowerCase();
  const kw = KEYWORDS[lower];
  if (kw) return { suit: kw.suit, kinds: kw.kinds ?? ["any"], only };
  const n = /^(\d)-card (major|minor)s?$/.exec(lower);
  if (n) return { suit: (v, c) => v.ranks.length === Number(n[1]) && ROLES[n[2]!]!(v, c), kinds: ["any"], only };
  const of = /^(ace|king|queen|[AKQ]) of (.+)$/.exec(text);
  if (of) {
    const role = of[2]!.replace(/^dummy's clubs$/, "dummy's suit").replace(/^trumps$/, "trump").replace(/^own overcalled suit$/, "own").replace(/^own suit$/, "own").replace(/^own long suit$/, "own");
    const pred = QUALIFIERS[role] ?? KEYWORDS[role]?.suit;
    const kind = { ace: "ace", A: "ace", king: "king", K: "king", queen: "queen", Q: "queen" }[of[1]!] as CardKind;
    return pred ? { suit: pred, kinds: [kind], only } : null;
  }
  const from = /^(.+?) from (.+)$/.exec(text);
  if (from) {
    const left = from[1]!;
    const holding = parseHolding(from[2]!.replace(/\s+in (partner's suit)/, " in $1"));
    if (!holding) return null;
    if (left === "trump") return { suit: (v, c) => ROLES.trump!(v, c) && holding.matches(v, c), kinds: ["any"], only };
    const sel = parseCardSelector(/^[AKQJT]$/.test(left) ? { A: "ace", K: "king", Q: "queen", J: "jack", T: "ten" }[left]! : left.replace(/^10$/, "ten"), "IMP");
    if (!sel.resolved) return null;
    return { suit: holding.matches, kinds: sel.kinds, only };
  }
  const pass = /^passive (.+)$/.exec(lower);
  if (pass) {
    const h = parseHolding(text.slice(8));
    return h ? { suit: (v, c) => noAKQ(v.ranks) && h.matches(v, c), kinds: ["low"], only } : null;
  }
  const h = parseHolding(text);
  return h ? { suit: h.matches, kinds: ["any"], only } : null;
}
