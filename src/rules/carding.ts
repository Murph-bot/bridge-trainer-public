import type { Card, Rank, Suit } from "../engine/types.ts";
import type { ContractType, Scoring } from "./types.ts";

const HONOURS = "AKQJ";
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const norm = (s: string): string => s.trim().replace(/10/g, "T");

type Holding = (ranks: readonly Rank[], strictSpot: boolean) => boolean;

const spot = (r: Rank, strict: boolean): boolean => (strict ? r < "A" || !"AKQJT".includes(r) : !HONOURS.includes(r));

/**
 * Mini notation of the partnership card, e.g. "J10(9)(x)", "AK(+)", "QJ(x)": letters are exact ranks, 'x' a spot card,
 * 'H' any honour, "(t)" an optional card, "(+)" any number of further cards. Anchored at the top card.
 */
function dslMatcher(text: string): Holding | null {
  const body = norm(text);
  if (!/^(?:[AKQJT98765432xH]|\((?:[AKQJT98765432xH]|\+)\))+$/.test(body)) return null;
  const items: { tok: string; optional: boolean }[] = [];
  let rest = false;
  for (const m of body.matchAll(/\((.)\)|(.)/g)) {
    if (m[1] === "+") rest = true;
    else items.push({ tok: (m[1] ?? m[2])!, optional: m[1] !== undefined });
  }
  return (ranks, strict) => {
    const ok = (tok: string, r: Rank): boolean => (tok === "x" ? spot(r, strict) : tok === "H" ? HONOURS.includes(r) : tok === r);
    const go = (i: number, j: number): boolean => {
      if (i === items.length) return rest || j === ranks.length;
      const it = items[i]!;
      if (j < ranks.length && ok(it.tok, ranks[j]!) && go(i + 1, j + 1)) return true;
      return it.optional && go(i + 1, j);
    };
    return go(0, 0);
  };
}

/** Holding descriptions of the partnership table and of lead-card-choice.json. */
export function holdingMatcher(raw: string): Holding | null {
  const text = norm(raw);
  if (text === "singleton") return (r) => r.length === 1;
  if (text === "doubleton") return (r) => r.length === 2;
  const open = /^(.*?)\s*\((\d+)\+ cards\)$/.exec(text);
  if (open && !open[1]!.includes("(+)")) {
    const m = dslMatcher(`${open[1]}(+)`);
    if (m) return (r, s) => r.length >= Number(open[2]) && m(r, s);
  }
  if (/^A without K/.test(text)) return (r) => r[0] === "A" && r[1] !== "K";
  const n = /^AK \+ (\d+) or more cards/.exec(text);
  if (n) return (r) => r[0] === "A" && r[1] === "K" && r.length >= Number(n[1]);
  if (/^no honour above T/.test(text)) return (r) => !HONOURS.includes(r[0]!);
  const others = /^honour \+ (\d+) or more others/.exec(text);
  if (others) return (r) => HONOURS.includes(r[0]!) && r.slice(1).every((x) => !HONOURS.includes(x)) && r.length >= Number(others[1]) + 1;
  const interior = /^honour \+ T interior \(([^)]*)\)/.exec(text);
  if (interior) {
    const ms = interior[1]!.split(",").map((p) => dslMatcher(p.trim()));
    if (ms.every((m) => m)) return (r, s) => ms.some((m) => m!(r, s));
  }
  const exact = /^(H[xX]+) \(one honour/.exec(text);
  if (exact) {
    const m = dslMatcher(exact[1]!.toLowerCase().replace("h", "H"));
    return m ? (r, s) => m(r, s) && r.slice(1).every((x) => !HONOURS.includes(x)) : null;
  }
  const head = text.replace(/,\s*no higher honour.*$/, "").replace(/\s*\([^)]*\)\s*$/, (m) => (/^\s*\((?:\+|x|\d|T)\)\s*$/.test(m) ? m : ""));
  const alts = head.split(/\s*[,/]\s*/);
  const ms = alts.map((a) => dslMatcher(a.replace(/X/g, "x")));
  return ms.every((m) => m) ? (r, s) => ms.some((m) => m!(r, s)) : null;
}

export interface AgreedCard {
  ranks: Rank[];
  source: "partnership" | "book";
  /** Table row ("order 11" or the book holding) that decided it. */
  ref: string;
}

const rankIndexCard = (spec: string, ranks: readonly Rank[]): Rank[] | null => {
  const t = norm(spec).toLowerCase();
  if (t === "the card" || t === "top" || t === "the singleton") return [ranks[0]!];
  if (t === "lowest" || t === "low") return [ranks.at(-1)!];
  if (t === "4th best") return ranks.length >= 4 ? [ranks[3]!] : null;
  if (t === "2nd highest") return ranks.length >= 2 ? [ranks[1]!] : null;
  const hi = /^([akqjt98765432])(?: or ([akqjt]))?$/.exec(t);
  if (hi) {
    const out = [hi[1]!, hi[2]].filter((x): x is string => x !== undefined).map((x) => x.toUpperCase() as Rank);
    return out.every((r) => ranks.includes(r)) ? out : null;
  }
  return null;
};

export interface PartnershipRow {
  order: number;
  contract: "any" | "suit" | "nt";
  holding: string;
  card: string;
}

export function parsePartnershipTable(raw: unknown): PartnershipRow[] {
  const t = isObj(raw) ? raw.cardChoiceTable : undefined;
  if (!Array.isArray(t)) throw new Error("carding.cardChoiceTable missing");
  return t
    .map((r: unknown) => {
      if (!isObj(r) || typeof r.order !== "number" || typeof r.holding !== "string" || typeof r.card !== "string" || (r.contract !== "any" && r.contract !== "suit" && r.contract !== "nt")) {
        throw new Error("carding.cardChoiceTable: bad row");
      }
      return { order: r.order, contract: r.contract as PartnershipRow["contract"], holding: r.holding, card: r.card };
    })
    .sort((a, b) => a.order - b.order);
}

/** Optional carding agreements (Bridge Matey rulings 01, section 4). All off by default. */
export interface CardingOptions {
  /** Ace from AK where the table says king, king where it says ace. */
  reverseAK: boolean;
  /** Second of touching top honours: AK -> K, KQ -> Q, QJ -> J. */
  rusinow: boolean;
}

export const NO_OPTIONS: CardingOptions = { reverseAK: false, rusinow: false };

const RUSINOW: Record<string, Rank> = { AK: "K", KQ: "Q", QJ: "J" };

/** Partnership card: first row (by order) whose contract type and holding fit; the card text up to the first comma/parenthesis. */
export function partnershipCard(rows: readonly PartnershipRow[], ranks: readonly Rank[], type: ContractType, options: CardingOptions = NO_OPTIONS): AgreedCard | null {
  const top = ranks.slice(0, 2).join("");
  if (options.rusinow && RUSINOW[top]) return { ranks: [RUSINOW[top]!], source: "partnership", ref: "rusinow" };
  const table = tableCard(rows, ranks, type);
  if (options.reverseAK && table && top === "AK" && table.ranks.length === 1 && (table.ranks[0] === "A" || table.ranks[0] === "K")) return { ...table, ranks: [table.ranks[0] === "A" ? "K" : "A"], ref: `${table.ref}, reversed` };
  return table;
}

const structuralKind = (holding: string): "singleton" | "doubleton" | null => {
  const t = norm(holding).toLowerCase();
  return t === "singleton" || t === "doubleton" ? t : null;
};

/** The row names exactly this holding in honour letters with the explicit length qualifier, e.g. "AK (doubleton)". */
const namesQualified = (holding: string, ranks: readonly Rank[], kind: "singleton" | "doubleton"): boolean =>
  norm(holding)
    .split(",")
    .some((alt) => {
      const m = /^(.*?)\s*\(([a-z]+)\)$/.exec(alt.trim());
      return m !== null && m[2] === kind && m[1] === ranks.join("");
    });

function tableCard(rows: readonly PartnershipRow[], ranks: readonly Rank[], type: ContractType): AgreedCard | null {
  for (const strict of [true, false]) {
    for (const row of rows) {
      if (row.contract !== "any" && row.contract !== (type === "NT" ? "nt" : "suit")) continue;
      const kind = structuralKind(row.holding);
      if (kind && rows.some((r) => r.order > row.order && (r.contract === "any" || r.contract === (type === "NT" ? "nt" : "suit")) && namesQualified(r.holding, ranks, kind))) continue;
      const m = holdingMatcher(row.holding);
      if (!m || !m(ranks, strict)) continue;
      const spec = row.card.split(/[,(]/)[0]!;
      const doubleton = /^top/.test(row.card) && ranks.length === 2;
      const picked = doubleton ? [ranks[0]!] : rankIndexCard(spec, ranks);
      if (picked) return { ranks: picked, source: "partnership", ref: `order ${row.order}` };
    }
  }
  return null;
}

export interface BookRow {
  holding: string;
  vs_NT: string;
  vs_suit: string;
}

export function parseBookTable(raw: unknown): BookRow[] {
  const h = isObj(raw) ? raw.holdings : undefined;
  if (!Array.isArray(h)) throw new Error("lead-card-choice: holdings missing");
  return h.map((r: unknown) => {
    if (!isObj(r) || typeof r.holding !== "string" || !isObj(r.vs_NT) || !isObj(r.vs_suit) || typeof r.vs_NT.card !== "string" || typeof r.vs_suit.card !== "string") throw new Error("lead-card-choice: bad row");
    return { holding: r.holding, vs_NT: r.vs_NT.card, vs_suit: r.vs_suit.card };
  });
}

export type SuitRole = "side" | "partner" | "trump";

/** Book card text: IMP/MP variants first, then "a / b" meaning b from 4+ cards, a otherwise; leading rank or low/top/4th best. */
function bookCardRanks(text: string, ranks: readonly Rank[], scoring: Scoring): Rank[] | null {
  let t = text;
  const split = /^(.*?) at IMPs; (.*?) at MPs$/.exec(t);
  if (split) t = scoring === "IMP" ? split[1]! : split[2]!;
  t = t.replace(/^low \(IMPs\) \/ top \(MPs\)$/, scoring === "IMP" ? "low" : "top").replace(/^queen \(MPs\) \/ either \(IMPs\)$/, scoring === "IMP" ? "any" : "queen");
  if (/^(avoid|prefer|-|any)/.test(t)) return null;
  const head = t.split(/\s*[;(]\s*/)[0]!.replace(/,\s*(then|asks).*$/, "").trim();
  if (/ \/ /.test(head)) {
    const parts = head.split(" / ").map((p) => p.trim());
    const fourth = parts.find((p) => p === "4th best");
    if (fourth && parts.includes("low")) return rankIndexCard(ranks.length >= 4 ? "4th best" : "low", ranks);
    for (const p of parts) {
      const r = rankIndexCard(p, ranks);
      if (r) return r;
    }
    return null;
  }
  if (/^[AKQJT] or [AKQJT]/.test(head)) return rankIndexCard(head.slice(0, 6), ranks);
  const firstWord = head.split(/[ ,]/)[0]!;
  return rankIndexCard(/^[AKQJT]$/.test(firstWord) || /^\d/.test(firstWord) ? firstWord : head, ranks);
}

export function bookCard(rows: readonly BookRow[], ranks: readonly Rank[], type: ContractType, scoring: Scoring, role: SuitRole): AgreedCard | null {
  for (const strict of [true, false]) {
    for (const row of rows) {
      let holding = row.holding;
      const prefix = /^(partner's suit|trumps): /.exec(holding);
      if (prefix) {
        if (role !== (prefix[1] === "trumps" ? "trump" : "partner")) continue;
        holding = holding.slice(prefix[0].length);
      } else if (role !== "side") continue;
      const m = holdingMatcher(holding.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s*\/\s*/g, ", "));
      if (!m || !m(ranks, strict)) continue;
      const picked = bookCardRanks(type === "NT" ? row.vs_NT : row.vs_suit, ranks, scoring);
      if (picked) return { ranks: picked, source: "book", ref: row.holding };
    }
  }
  return null;
}

export interface CardTables {
  partnership: readonly PartnershipRow[];
  book: readonly BookRow[];
  options?: CardingOptions;
}

/** Lead card of a suit holding: the partnership table, falling back to lead-card-choice.json (a book fallback never carries a penalty). */
export function agreedCard(t: CardTables, ranks: readonly Rank[], type: ContractType, scoring: Scoring, role: SuitRole): AgreedCard | null {
  return partnershipCard(t.partnership, ranks, type, t.options) ?? bookCard(t.book, ranks, type, scoring, role);
}

export const cardOf = (r: Rank, s: Suit): Card => (r + s) as Card;
