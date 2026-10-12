import { checkAuction } from "../ui/auction.ts";
import { isComplete } from "../engine/contract.ts";
import { seatAfter } from "../engine/contract.ts";
import type { Call, Contract, Level, Seat, Strain } from "../engine/types.ts";

export interface ContractSpec {
  level: Level;
  strain: Strain;
  doubled: "" | "X" | "XX";
}

export type AuctionSource = "text" | "default" | "contract-only";

export interface ParsedAuction {
  source: AuctionSource;
  /** Complete auction (empty for contract-only). The leader is West and South declares. */
  calls: Call[];
  dealer: Seat;
  /** The text says the slam auction was disciplined (no cashable A-K): the dealer applies the AK-proof filter. */
  disciplined: boolean;
  /** The text says the slam auction was undisciplined: the AK-proof filter is off. */
  undisciplined: boolean;
}

export function parseContract(text: string): ContractSpec {
  const m = /^([1-7])(NT|[CDHS])(XX|X)?$/.exec(text.trim());
  if (!m) throw new Error(`unreadable contract ${text}`);
  return { level: Number(m[1]) as Level, strain: (m[2] === "NT" ? "N" : m[2]) as Strain, doubled: (m[3] ?? "") as ContractSpec["doubled"] };
}

type Side = "D" | "L";
interface Item {
  call: Call;
  /** Seq form: "A" is the side of the first call, "B" the other. Prose form: D (declarer's N-S) or L (leader's E-W). */
  side: Side | "A" | "B";
  seat?: Seat;
}

const SUIT_OF: Record<string, string> = { "♣": "C", "♦": "D", "♥": "H", "♠": "S" };
const BID = String.raw`[1-7]\s?(?:NT|N|[♣♦♥♠])`;
const CALLW = String.raw`(?:${BID}|pass(?:/bid)?|dble|dbl|double)`;
const TOK = String.raw`\(?\s*${CALLW}\s*\)?(?:\s*\((?:North|South|East|West)\))?`;
const SEQ = new RegExp(String.raw`${TOK}(?:\s*[-–—]\s*${TOK})+`, "i");
const SEAT_LETTER: Record<string, Seat> = { north: "N", south: "S", east: "E", west: "W" };

const bidOf = (raw: string): Call => {
  const t = raw.replace(/\s/g, "").toUpperCase();
  const strain = t.slice(1);
  return `${t[0]}${strain === "NT" || strain === "N" ? "N" : (SUIT_OF[strain] ?? strain)}` as Call;
};

function callOf(raw: string): Call {
  const w = raw.toLowerCase();
  if (w.startsWith("pass")) return "P";
  if (w === "dble" || w === "dbl" || w === "double") return "X";
  return bidOf(raw);
}

const isEW = (s: Seat): boolean => s === "E" || s === "W";
const sideOfSeat = (s: Seat): Side => (isEW(s) ? "L" : "D");
const strip = (t: string): string => t.replace(/\((?:or|where)\b[^)]*\)/gi, " ");

function seqItems(text: string): Item[] | null {
  const m = SEQ.exec(strip(text));
  if (!m) return null;
  let tokens = m[0].split(/\s*[-–—]\s*/);
  if (tokens[0]!.trimStart().startsWith("(") && tokens.at(-1)!.trimEnd().endsWith(")") && !tokens[0]!.includes(")") && !tokens.at(-1)!.includes("(")) {
    tokens = tokens.map((t, i) => (i === 0 ? t.replace("(", "") : i === tokens.length - 1 ? t.replace(")", "") : t));
  }
  const items: Item[] = [];
  for (const t of tokens) {
    const label = /\((North|South|East|West)\)/i.exec(t);
    const core = t.replace(/\((?:North|South|East|West)\)/i, "");
    const wrapped = core.trimStart().startsWith("(");
    const word = new RegExp(CALLW, "i").exec(core)![0];
    const seat = label ? SEAT_LETTER[label[1]!.toLowerCase()] : undefined;
    items.push({ call: callOf(word), side: seat ? sideOfSeat(seat) : wrapped ? "B" : "A", seat });
  }
  return items;
}

const D_CUE = /\b(North|South|Dummy|opponents?|RHO|LHO|next player)\b/gi;
const L_CUE = /\b(you(?!r)|partner|East|West)\b/gi;

function lastCue(seg: string, re: RegExp): number {
  let last = -1;
  for (const m of seg.matchAll(re)) last = m.index;
  return last;
}

function proseItems(text: string, contract: ContractSpec): Item[] | null {
  const body = strip(text.replace(/\b(?:What|Which)\b[^.]*\blead\b.*$/i, "")).replace(/’/g, "'");
  if (new RegExp(`${BID}[^.]*\\bor\\b[^.]*${BID}`, "i").test(body)) return null;
  const found = [...body.matchAll(new RegExp(`${BID}|negative double`, "gi"))];
  if (found.length === 0) return null;
  const items: Item[] = [];
  let prevEnd = 0;
  let prevSide: Side | undefined;
  let firstSide: Side | undefined;
  for (const m of found) {
    const seg = body.slice(prevEnd, m.index);
    const d = lastCue(seg, D_CUE);
    const l = lastCue(seg, L_CUE);
    let side: Side;
    if (/\bopener/i.test(seg) && firstSide) side = firstSide;
    else if (d < 0 && l < 0) side = prevSide ?? "D";
    else side = d > l ? "D" : "L";
    const seatName = /\b(North|South|East|West)\b(?![^.]*\b(?:North|South|East|West)\b)/i.exec(seg)?.[1];
    items.push({ call: /negative/i.test(m[0]) ? "X" : bidOf(m[0]), side, seat: seatName && /\bopens\b/i.test(seg) ? SEAT_LETTER[seatName.toLowerCase()] : undefined });
    firstSide ??= side;
    prevSide = side;
    prevEnd = m.index + m[0].length;
  }
  const want = `${contract.level}${contract.strain}` as Call;
  const bids = items.filter((i) => i.call !== "X");
  if (bids.at(-1)?.call !== want) items.push({ call: want, side: "D" });
  if (/\bdoubled\b/i.test(body) || contract.doubled) {
    const last = items.filter((i) => i.call !== "P").at(-1)!;
    if (last.call !== "X") items.push({ call: "X", side: last.side === "D" ? "L" : "D" });
  }
  return items;
}

/** Seats the items from a dealer, inserting a pass wherever the next item belongs to the other side. */
function layout(items: Item[], sideOf: (i: Item) => Side, dealer: Seat): Call[] | null {
  const calls: Call[] = [];
  let seat = dealer;
  for (const it of items) {
    if (isComplete(calls)) return null;
    if (sideOfSeat(seat) !== sideOf(it)) {
      calls.push("P");
      seat = seatAfter(seat, 1);
    }
    if (it.seat && it.seat !== seat) return null;
    calls.push(it.call);
    seat = seatAfter(seat, 1);
  }
  if (!calls.some((c) => c !== "P")) return null;
  while (!isComplete(calls)) calls.push("P");
  return calls;
}

const sameContract = (c: Contract | null, spec: ContractSpec): boolean => c !== null && c.level === spec.level && c.strain === spec.strain && c.doubled === spec.doubled && c.declarer === "S";

function solve(items: Item[], maps: ((i: Item) => Side)[], contract: ContractSpec): { calls: Call[]; dealer: Seat } | null {
  for (const sideOf of maps) {
    const first = sideOf(items[0]!);
    const dealers: Seat[] = items[0]!.seat ? [items[0]!.seat] : first === "D" ? ["S", "N"] : ["E", "W"];
    for (const dealer of dealers) {
      const calls = layout(items, sideOf, dealer);
      if (!calls) continue;
      const checked = checkAuction(calls, dealer);
      if (checked.errors.length === 0 && sameContract(checked.contract, contract)) return { calls, dealer };
    }
  }
  return null;
}

/**
 * Reads a paraphrased auction (dash sequences with parentheses for the other side, or prose such as "Partner opens 1♥ and
 * the next player overcalls 1♠. You pass and North bids 4♠."). The contract is authoritative: a reading that does not end
 * in it with South declaring (so West leads) is rejected, and the result falls back to contract-only. A bare "Contract 3NT"
 * or an empty text for 3NT is the chapters' default 1NT-3NT.
 */
export function parseAuction(text: string, contractText: string, contractNote?: string): ParsedAuction {
  const contract = parseContract(contractText);
  const flags = {
    disciplined: /disciplined|no cashable AK|do not have two top losers/i.test(text) && !/undisciplined/i.test(text),
    undisciplined: /without (?:using )?cue-?bid|cashable AK possible|undisciplined/i.test(text),
  };
  const contractOnly: ParsedAuction = { source: "contract-only", calls: [], dealer: "S", ...flags };
  if (text.trim() === "") {
    if (contractNote && /default 1NT-3NT/.test(contractNote) && contractText === "3NT") return { source: "default", calls: ["1N", "P", "3N", "P", "P", "P"], dealer: "S", ...flags };
    return contractOnly;
  }
  const prose = /\b(opens|overcalls?|responds)\b/i.test(text);
  let items: Item[] | null = null;
  let maps: ((i: Item) => Side)[] = [];
  if (prose) {
    items = proseItems(text, contract);
    maps = [(i) => i.side as Side];
  } else {
    items = seqItems(text);
    if (!items) {
      const bids = [...strip(text).matchAll(new RegExp(BID, "gi"))];
      if (bids.length === 1 && /passed out|\bcontract\b/i.test(text)) {
        if (contract.level >= 3 && contract.strain === "N") return { source: "default", calls: ["1N", "P", "3N", "P", "P", "P"], dealer: "S", ...flags };
        if (contract.level <= 2) items = [{ call: bidOf(bids[0]![0]), side: "A" }];
      }
    }
    maps = [(i) => (i.side === "A" ? "D" : i.side === "B" ? "L" : i.side), (i) => (i.side === "A" ? "L" : i.side === "B" ? "D" : i.side)];
  }
  if (!items) return contractOnly;
  const solved = solve(items, maps, contract);
  return solved ? { source: "text", ...solved, ...flags } : contractOnly;
}
