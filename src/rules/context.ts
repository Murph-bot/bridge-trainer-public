import { analyse } from "../engine/hand.ts";
import type { HandInfo } from "../engine/hand.ts";
import { finalContract, openingLeader } from "../engine/contract.ts";
import type { Call, Card, Contract, Rule, Seat, Suit, Vul } from "../engine/types.ts";
import { SUITS } from "../engine/types.ts";
import type { LeadConfig } from "../lead/config.ts";
import { deriveFeatures, levelClass } from "./features.ts";
import type { ContractType, HandStrength, LeadContext, Scoring } from "./types.ts";

export const contractCode = (c: Contract): string => `${c.level}${c.strain === "N" ? "NT" : c.strain}${c.doubled}`;

export interface ContextInput {
  hand: Card[];
  auction: Call[];
  dealer: Seat;
  vul: Vul;
  scoring: Scoring;
  disciplined?: boolean;
  matched?: readonly (Rule | undefined)[];
}

/** Aces plus kings with at least one other card (Kx or longer), counted outside each suit. */
export function entriesOutside(info: HandInfo): Record<Suit, number> {
  const entries = (s: Suit): number => (info.by[s].includes("A") ? 1 : 0) + (info.by[s].includes("K") && info.len[s] >= 2 ? 1 : 0);
  const total = SUITS.reduce((n, s) => n + entries(s), 0);
  return Object.fromEntries(SUITS.map((s) => [s, total - entries(s)])) as Record<Suit, number>;
}

export function deriveContext(inp: ContextInput, cfg: LeadConfig): LeadContext {
  const contract = finalContract(inp.auction, inp.dealer);
  if (!contract) throw new Error("auction is passed out: nothing to lead against");
  const leader = openingLeader(contract);
  const info = analyse(inp.hand);
  const { features, roles } = deriveFeatures({
    auction: inp.auction,
    dealer: inp.dealer,
    contract,
    leader,
    info,
    scoring: inp.scoring,
    disciplined: inp.disciplined ?? false,
    matched: inp.matched,
    config: cfg.handStrength,
  });
  const strength: HandStrength = info.hcp <= cfg.handStrength.weakMaxHcp ? "weak" : info.hcp >= cfg.handStrength.strongMinHcp ? "strong" : "normal";
  const contractType: ContractType = contract.strain === "N" ? "NT" : "suit";
  const entries = entriesOutside(info);
  return {
    contract,
    contractType,
    trump: contract.strain === "N" ? null : contract.strain,
    levelClass: levelClass(contract),
    contractCode: contractCode(contract),
    scoring: inp.scoring,
    vul: inp.vul,
    leader,
    hand: inp.hand,
    info,
    handStrength: strength,
    features,
    roles,
    entriesOutside: entries,
    fewEntries: Object.fromEntries(SUITS.map((s) => [s, entries[s] <= cfg.handStrength.fewEntriesMax])) as Record<Suit, boolean>,
  };
}
