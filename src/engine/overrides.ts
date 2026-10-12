import overridesRaw from "../../data/system-overrides.json";
import type { Call, ConstraintSet } from "./types.ts";

/** A reading for a call no system rule matched, keyed by the rule that the partner's previous call matched. */
export interface SystemOverride {
  id: string;
  afterRule: string;
  call: Call;
  shows: ConstraintSet;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function parseOverrides(raw: unknown): SystemOverride[] {
  if (!isObj(raw) || !Array.isArray(raw.rules)) throw new Error("system-overrides: rules must be an array");
  return raw.rules.map((r: unknown, i) => {
    if (!isObj(r) || typeof r.id !== "string" || typeof r.afterRule !== "string" || typeof r.call !== "string" || !isObj(r.shows)) {
      throw new Error(`system-overrides: rules[${i}] needs id, afterRule, call and shows`);
    }
    return { id: r.id, afterRule: r.afterRule, call: r.call as Call, shows: r.shows as ConstraintSet };
  });
}

export const BUNDLED_OVERRIDES: SystemOverride[] = parseOverrides(overridesRaw);
