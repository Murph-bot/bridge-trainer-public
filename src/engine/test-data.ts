import { readFileSync } from "node:fs";
import { parseSystemFile } from "./load.ts";
import type { Call, Card, Seat, SystemFile } from "./types.ts";
import { parseDotted } from "./hand.ts";

const dataUrl = (name: string): URL => new URL(`../../data/${name}`, import.meta.url);

export const readJson = (name: string): unknown => JSON.parse(readFileSync(dataUrl(name), "utf8"));

export const SS: SystemFile = parseSystemFile(readJson("system-stelios-sotos.json"));
export const OPPS: SystemFile = parseSystemFile(readJson("opponents-default-2over1.json"));
export const SYSTEMS: Record<string, SystemFile> = { ss: SS, opps: OPPS };

export const profilesOf = (p: Record<Seat, string>): Record<Seat, SystemFile> => ({ N: SYSTEMS[p.N]!, E: SYSTEMS[p.E]!, S: SYSTEMS[p.S]!, W: SYSTEMS[p.W]! });

export const calls = (s: string): Call[] => s.split(" ") as Call[];

/** "QJ1095 ♠ K74 ♥ 852 ♦ 63 ♣" -> cards */
export function parseSymbolHand(txt: string): Card[] {
  const m = txt.split(" ");
  const bySuit: Record<string, string> = {};
  for (let i = 0; i < m.length; i += 2) bySuit[m[i + 1]!] = m[i]!;
  return parseDotted(["♠", "♥", "♦", "♣"].map((s) => bySuit[s] ?? "-").join("."));
}
