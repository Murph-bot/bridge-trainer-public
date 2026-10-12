import { EXPLAIN_KEYS } from "./explain.ts";

type Key = (typeof EXPLAIN_KEYS)[number];

/** English sentences for the explanation keys. Greek is added by the UI phase (needs Sotirios's terminology check). */
export const EXPLAIN_EN: Record<Key, string> = {
  "explain.verdict.best": "{card} is the best lead on the sample.",
  "explain.verdict.equalBest": "{card} is equal best with {best} within sampling noise.",
  "explain.verdict.close": "{card} is close to the best lead, {best}.",
  "explain.verdict.worse": "{card} is clearly behind the best lead, {best}.",
  "explain.verdict.ddBest": "{card} is the double-dummy best lead on the sample.",
  "explain.verdict.noiseRule": "{card} is within sampling noise of the double-dummy best lead {best}; the lead rules {rules} decide in its favour.",
  "explain.verdict.noiseBehind": "{card} is within sampling noise of {best}, which the lead rules {rules} prefer.",
  "explain.verdict.noiseTie": "{card} is within sampling noise of {best}; no lead rule separates them, so the double-dummy order puts {best} first.",
  "explain.defeat": "{card} beats the contract on {pDefPct}% of {n} deals and takes {eDef} defence tricks on average.",
  "explain.best": "Best lead {card}: beats the contract on {pDefPct}% of deals, {eDef} tricks on average; {card} loses {loss} per deal ({unit}).",
  "explain.card.wrongCard": "Right suit, wrong card per your agreements: {agreed} is the agreed card ({source} table), not {card}.",
  "explain.signal.ntAce": "Against notrump the ace asks partner to unblock (play an honour) or give count.",
  "explain.signal.ntKing": "Against notrump the king asks partner for attitude (encouraging or discouraging).",
  "explain.bias.B1": "Double-dummy credit for leading from touching honours reduced by {pdefPoints} points of defeat probability.",
  "explain.bias.B3": "Double-dummy credit for an unsupported ace reduced by {pdefPoints} points of defeat probability.",
  "explain.bias.B4": "Double-dummy credit for a short trump lead reduced by {pdefPoints} points of defeat probability.",
  "explain.bias.B5": "Double-dummy credit for a singleton king reduced by {pdefPoints} points of defeat probability.",
  "explain.note.fewDeals": "Only {n} deals (fewer than {min}): treat the numbers as rough.",
  "explain.note.timedOut": "The deal generator ran out of time; only {n} deals were found.",
  "explain.note.relaxed": "The auction constraints were relaxed to find deals: {steps}.",
  "explain.note.unmatchedCalls": "{count} calls matched no system rule and were read naturally.",
  "explain.note.adaptive": "The two best leads were within sampling noise, so deals were added automatically ({n} in total, started with {start}).",
  "explain.note.capped": "Still within noise at the cap of {cap} deals: the two best leads are a near-tie.",
  "explain.note.sample": "{n} deals, {acceptancePct}% accepted by the deal generator, seed {seed}.",
};

export const formatMsg = (template: string, params: Record<string, string | number> = {}): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
