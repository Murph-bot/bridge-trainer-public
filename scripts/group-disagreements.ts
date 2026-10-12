// npm run eval:group -- <leads.json> [out.md] [mode: blend|dd|rules|new, default blend]
// Groups the IMP failures of the chosen mode of an eval run by the lead rules involved: rules that recommended our (wrong) top lead,
// and rules that penalised the book's lead. Failures where neither kind of rule fired are double-dummy driven.
import { readFileSync, writeFileSync } from "node:fs";
import { dataPath } from "./data-pack.mjs";
import { buildProblem, leadCards } from "../src/eval/problems.ts";
import type { TestProblem } from "../src/eval/problems.ts";
import type { ProblemRecord } from "../src/eval/evaluate.ts";
import { DEFAULT_SETTINGS, defaultRulebook, prepare } from "../src/lead/analyse.ts";
import { evaluateRules } from "../src/rules/engine.ts";

const [inPath, outPath, modeArg] = process.argv.slice(2);
const mode = (modeArg ?? "blend") as "blend" | "dd" | "rules" | "new";
if (!inPath) {
  console.error("usage: npm run eval:group -- <leads.json> [out.md]");
  process.exit(2);
}
const file = JSON.parse(readFileSync(inPath, "utf8")) as { settings: { deals: number; seed: number }; records: ProblemRecord[] };
const tests = new Map((JSON.parse(readFileSync(dataPath("lead-test-problems.json"), "utf8")) as { tests: TestProblem[] }).tests.map((t) => [t.id, t]));
const book = defaultRulebook();

interface Group {
  ids: string[];
  text: string;
}
const drove = new Map<string, Group>();
const penalised = new Map<string, Group>();
const dd: string[] = [];
const add = (m: Map<string, Group>, key: string, text: string, id: string): void => {
  const g = m.get(key) ?? { ids: [], text };
  g.ids.push(id);
  m.set(key, g);
};

const fails = file.records.filter((r) => !r.imp[mode].pass);
for (const r of fails) {
  const t = tests.get(r.id);
  if (!t) continue;
  const prep = prepare({ ...buildProblem(t).problem, scoring: "IMP" }, { ...DEFAULT_SETTINGS, ...buildProblem(t).settings }, book);
  const hits = evaluateRules(prep.ctx, book.rules, book.config.settings.evidenceFactor).hits;
  const top = leadCards(r.imp[mode].top);
  const bookCards = leadCards(r.bookBest);
  const covers = (h: (typeof hits)[number], cards: string[]): boolean => h.cards.some((c) => cards.includes(c) || (h.suitWide && cards.some((x) => x[1] === c[1])));
  const a = hits.filter((h) => h.kind === "recommend" && covers(h, top));
  const b = hits.filter((h) => h.kind === "avoid" && covers(h, bookCards));
  for (const h of a) add(drove, h.ruleId, h.text, r.id);
  for (const h of b) add(penalised, h.ruleId, h.text, r.id);
  if (a.length === 0 && b.length === 0) dd.push(r.id);
}

const table = (m: Map<string, Group>): string[] => {
  const rows = [...m.entries()].sort((x, y) => y[1].ids.length - x[1].ids.length || x[0].localeCompare(y[0]));
  if (rows.length === 0) return ["_none_", ""];
  return ["| rule | fails | sample problems | rule text |", "|---|---|---|---|", ...rows.map(([id, g]) => `| ${id} | ${g.ids.length} | ${g.ids.slice(0, 5).join(", ")} | ${g.text.replace(/\|/g, "\\|")} |`), ""];
};

const md = [
  `# Eval disagreements by lead rule`,
  "",
  `${fails.length} of ${file.records.length} problems fail IMP ${mode} (deals ${file.settings.deals}, seed ${file.settings.seed}).`,
  "",
  "## Rules that recommended our top lead",
  ...table(drove),
  "## Rules that penalised the book's lead",
  ...table(penalised),
  `## No rule involved (double-dummy driven): ${dd.length}`,
  "",
  dd.join(", "),
  "",
].join("\n");
if (outPath) writeFileSync(outPath, md);
else process.stdout.write(md);
