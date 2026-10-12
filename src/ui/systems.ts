import oppsRaw from "../../data/opponents-default-2over1.json";
import ssRaw from "../../data/system-stelios-sotos.json";
import { parseSystemFile } from "../engine/load.ts";
import { SEATS } from "../engine/types.ts";
import type { Seat, SystemFile } from "../engine/types.ts";

export const PARTNERSHIP_SYSTEM: SystemFile = parseSystemFile(ssRaw);
export const OPPONENT_SYSTEM: SystemFile = parseSystemFile(oppsRaw);

/** The leader's side plays the partnership system, the other side the default 2/1. */
export function profilesFor(leader: Seat, own: SystemFile = PARTNERSHIP_SYSTEM, opps: SystemFile = OPPONENT_SYSTEM): Record<Seat, SystemFile> {
  const mine = SEATS.indexOf(leader) % 2;
  return Object.fromEntries(SEATS.map((s) => [s, SEATS.indexOf(s) % 2 === mine ? own : opps])) as Record<Seat, SystemFile>;
}
