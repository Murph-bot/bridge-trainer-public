import { sameSide } from "../engine/contract.ts";
import type { Contract, Vul } from "../engine/types.ts";

export function declarerVulnerable(vul: Vul, declarer: Contract["declarer"]): boolean {
  return vul === "both" || (vul === "NS" && sameSide(declarer, "N")) || (vul === "EW" && sameSide(declarer, "E"));
}

/** Penalty for `down` undertricks, as a positive number. */
function penalty(down: number, doubled: Contract["doubled"], vulnerable: boolean): number {
  if (doubled === "") return down * (vulnerable ? 100 : 50);
  let total = 0;
  for (let i = 1; i <= down; i++) total += vulnerable ? (i === 1 ? 200 : 300) : i === 1 ? 100 : i <= 3 ? 200 : 300;
  return doubled === "XX" ? total * 2 : total;
}

/** Duplicate score for declarer's side (negative when the contract fails). `tricks` = tricks declarer takes. */
export function contractScore(contract: Contract, tricks: number, vulnerable: boolean): number {
  const mult = contract.doubled === "XX" ? 4 : contract.doubled === "X" ? 2 : 1;
  const needed = contract.level + 6;
  if (tricks < needed) return -penalty(needed - tricks, contract.doubled, vulnerable);
  const { level, strain } = contract;
  const perTrick = strain === "C" || strain === "D" ? 20 : 30;
  const trickScore = (perTrick * level + (strain === "N" ? 10 : 0)) * mult;
  let score = trickScore + (trickScore >= 100 ? (vulnerable ? 500 : 300) : 50);
  if (level === 6) score += vulnerable ? 750 : 500;
  if (level === 7) score += vulnerable ? 1500 : 1000;
  if (mult > 1) score += 25 * mult;
  const over = tricks - needed;
  return score + over * (mult === 1 ? perTrick : (vulnerable ? 100 : 50) * mult);
}

/** Defenders' duplicate score given their own trick count. */
export const defenderScore = (contract: Contract, defenceTricks: number, vulnerable: boolean): number =>
  -contractScore(contract, 13 - defenceTricks, vulnerable);
