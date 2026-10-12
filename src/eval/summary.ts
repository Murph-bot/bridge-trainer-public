import type { Mode, ProblemRecord } from "./evaluate.ts";
import { MODES } from "./evaluate.ts";

export interface Rate {
  n: number;
  pass: number;
  pct: number;
}

const rate = (rs: readonly ProblemRecord[], pick: (r: ProblemRecord) => boolean): Rate => {
  const pass = rs.filter(pick).length;
  return { n: rs.length, pass, pct: rs.length === 0 ? 0 : Math.round((1000 * pass) / rs.length) / 10 };
};

export type Scoring = "imp" | "mp";

/** Pass rates of the three modes for one scoring over a set of records. */
export const passRates = (rs: readonly ProblemRecord[], scoring: Scoring): Record<Mode, Rate> => Object.fromEntries(MODES.map((m) => [m, rate(rs, (r) => r[scoring][m].pass)])) as Record<Mode, Rate>;
/** Top-3 rates: an accepted lead is among the first three options. */
export const top3Rates = (rs: readonly ProblemRecord[], scoring: Scoring): Record<Mode, Rate> => Object.fromEntries(MODES.map((m) => [m, rate(rs, (r) => r[scoring][m].pass3)])) as Record<Mode, Rate>;

export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]!;
}

export interface Summary {
  total: number;
  overall: Record<Scoring, Record<Mode, Rate>>;
  top3: Record<Scoring, Record<Mode, Rate>>;
  groups: Record<string, Record<Scoring, Record<Mode, Rate>>>;
  ms: { mean: number; median: number; p90: number };
  timedOut: number;
  meanDeals: number;
  minDeals: number;
  maxDeals: number;
  /** Largest gap first; only problems where the IMP top lead of the new scheme is not accepted or the book's best is not in our top 3. */
  worst: ProblemRecord[];
  bookNotInTop3: ProblemRecord[];
}

export function summarize(rs: readonly ProblemRecord[]): Summary {
  const groupDefs: [string, (r: ProblemRecord) => boolean][] = [
    ["book nt", (r) => r.book === "nt"],
    ["book suit", (r) => r.book === "suit"],
    ["kind quiz", (r) => r.kind === "quiz"],
    ["kind worked_example", (r) => r.kind === "worked_example"],
    ["auctionParsed true", (r) => r.auctionParsed],
    ["auctionParsed false", (r) => !r.auctionParsed],
  ];
  const groups: Summary["groups"] = {};
  for (const [name, f] of groupDefs) {
    const sub = rs.filter(f);
    if (sub.length > 0) groups[name] = { imp: passRates(sub, "imp"), mp: passRates(sub, "mp") };
  }
  const ms = rs.map((r) => r.ms);
  return {
    total: rs.length,
    overall: { imp: passRates(rs, "imp"), mp: passRates(rs, "mp") },
    top3: { imp: top3Rates(rs, "imp"), mp: top3Rates(rs, "mp") },
    groups,
    ms: { mean: Math.round(ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length)), median: quantile(ms, 0.5), p90: quantile(ms, 0.9) },
    timedOut: rs.filter((r) => r.timedOut).length,
    meanDeals: Math.round(rs.reduce((a, r) => a + r.deals, 0) / Math.max(1, rs.length)),
    minDeals: rs.length ? Math.min(...rs.map((r) => r.deals)) : 0,
    maxDeals: rs.length ? Math.max(...rs.map((r) => r.deals)) : 0,
    worst: [...rs].filter((r) => !r.imp.new.pass || r.bookRank > 3).sort((a, b) => b.gap - a.gap || b.bookRank - a.bookRank).slice(0, 25),
    bookNotInTop3: rs.filter((r) => r.bookRank > 3),
  };
}

const NAMES: Record<Mode, string> = { blend: "blend (old)", dd: "DD-only", rules: "rules-only", new: "new", ddScore: "DD-only by score (phase 5)" };

const row = (name: string, g: Record<Scoring, Record<Mode, Rate>>): string => {
  const f = (r: Rate): string => `${r.pct}% (${r.pass}/${r.n})`;
  return `| ${name} | ${MODES.map((m) => f(g.imp[m])).join(" | ")} | ${MODES.map((m) => f(g.mp[m])).join(" | ")} |`;
};

export function markdown(s: Summary, meta: { deals: number | string; seed: number }): string {
  const lines = [
    `# Lead evaluation (${s.total} problems, ${meta.deals}, seed ${meta.seed})`,
    "",
    "Pass = the top-ranked lead is in the book's accept list (cards of the same equal-DD group count as one lead).",
    "",
    `| Group | ${MODES.map((m) => `IMP ${NAMES[m]}`).join(" | ")} | ${MODES.map((m) => `MP ${NAMES[m]}`).join(" | ")} |`,
    `|---|${MODES.map(() => "---|").join("")}${MODES.map(() => "---|").join("")}`,
    row("all", s.overall),
    ...Object.entries(s.groups).map(([k, g]) => row(k, g)),
    "",
    "Top-3 (an accepted lead among the first three options):",
    "",
    `| Group | ${MODES.map((m) => `IMP ${NAMES[m]}`).join(" | ")} | ${MODES.map((m) => `MP ${NAMES[m]}`).join(" | ")} |`,
    `|---|${MODES.map(() => "---|").join("")}${MODES.map(() => "---|").join("")}`,
    row("all", s.top3),
    "",
    `ms per problem: mean ${s.ms.mean}, median ${s.ms.median}, p90 ${s.ms.p90}. Mean deals used ${s.meanDeals} (min ${s.minDeals}, max ${s.maxDeals}). Timed out: ${s.timedOut}.`,
    `Book best not in our IMP top 3: ${s.bookNotInTop3.length}.`,
    "",
    "## 25 worst disagreements",
    "",
    "gap = max(gapBest, gapTop), percentage points of our bias-corrected P(defeat): gapBest = our highest-Pdef lead minus the book's best lead; gapTop = the book's best lead minus our top-rated lead. Book beat % is from the books' 5000-deal tables.",
    "",
    "| id | contract | auction | our top (new, IMP) | book best | accept | gap | our Pdef max / top / book | book beat% best / our top | book rank | acc. rate |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...s.worst.map((r) => `| ${r.id} | ${r.contract} | ${r.auction ?? "(contract only)"} | ${r.imp.new.top} | ${r.bookBest} | ${r.accept.join(", ")} | ${r.gap} | ${r.pDefMax} / ${r.pDefTop} / ${r.pDefBook} | ${r.bookBeatBest} / ${r.bookBeatTop ?? "?"} | ${r.bookRank} | ${r.acceptanceRate} |`),
    "",
  ];
  return lines.join("\n");
}
