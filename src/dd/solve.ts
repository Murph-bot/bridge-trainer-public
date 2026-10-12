import type { Dds, DealPbn, FutureTricks } from "bridge-dds";
import type { Card, Contract, Deal, Seat } from "../engine/types.ts";
import { dealToPbn, expandEquals, seatNum, trumpNum } from "./pbn.ts";

export type DdsLike = Pick<Dds, "SolveBoardPBN">;

/** Defence tricks needed to beat the contract. */
export const tricksToSet = (c: Pick<Contract, "level">): number => 8 - c.level;

const request = (deal: Deal, contract: Contract, leader: Seat): DealPbn => ({
  trump: trumpNum(contract.strain),
  first: seatNum(leader),
  currentTrickSuit: [0, 0, 0],
  currentTrickRank: [0, 0, 0],
  remainCards: dealToPbn(deal),
});

function expand(ft: FutureTricks, keep: (score: number) => boolean): Map<Card, number> {
  const out = new Map<Card, number>();
  for (let i = 0; i < ft.cards; i++) {
    if (!keep(ft.score[i]!)) continue;
    for (const c of expandEquals(ft.suit[i]!, ft.rank[i]!, ft.equals[i]!)) out.set(c, ft.score[i]!);
  }
  return out;
}

/** Defence tricks (leader's side) for every legal opening lead. One SolveBoardPBN call, exact mode. */
export function solveLeads(dds: DdsLike, deal: Deal, contract: Contract, leader: Seat): Record<Card, number> {
  const ft = dds.SolveBoardPBN(request(deal, contract, leader), -1, 3, 0);
  return Object.fromEntries(expand(ft, () => true)) as Record<Card, number>;
}

/** Defeat-only mode: the leads that set the contract (target = tricks to set, solutions = 2). */
export function solveDefeat(dds: DdsLike, deal: Deal, contract: Contract, leader: Seat): Set<Card> {
  const need = tricksToSet(contract);
  const ft = dds.SolveBoardPBN(request(deal, contract, leader), need, 2, 0);
  return new Set(expand(ft, (s) => s >= need).keys());
}

export interface DdSolver {
  solveLeads(deal: Deal, contract: Contract, leader: Seat): Record<Card, number>;
  solveDefeat(deal: Deal, contract: Contract, leader: Seat): Set<Card>;
}

export const bindSolver = (dds: DdsLike): DdSolver => ({
  solveLeads: (d, c, l) => solveLeads(dds, d, c, l),
  solveDefeat: (d, c, l) => solveDefeat(dds, d, c, l),
});

/** Load the wasm and bind a solver. Plain Node ESM cannot import bridge-dds, see `npm run build:node`. */
export async function loadSolver(): Promise<DdSolver> {
  const { Dds, loadDds } = await import("bridge-dds");
  return bindSolver(new Dds(await loadDds()));
}
