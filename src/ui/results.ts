import type { Card, Rank } from "../engine/types.ts";
import type { Analysis } from "../lead/analyse.ts";
import { FEW_DEALS } from "../lead/explain.ts";
import type { MsgRef } from "../lead/explain.ts";
import type { PoolResult } from "../dd/pool.ts";
import type { Scoring } from "../rules/types.ts";
import { t, tMsg } from "../i18n/i18n.ts";
import { h, suited } from "./dom.ts";
import { cardText, rankText } from "./format.ts";

export type RunStatus = "idle" | "running" | "done" | "cancelled" | "impossible" | "error";

export interface RunView {
  status: RunStatus;
  analysis?: Analysis;
  solved?: PoolResult;
  targetDeals: number;
  wallMs: number;
  message?: string;
  conflicts: string[];
}

export interface ResultsInput {
  run: RunView;
  userCard: Card;
  scoring: Scoring;
  defeatOnly: boolean;
}

const pct = (x: number, digits = 1): string => (x * 100).toFixed(digits);
const trick = (x: number): string => x.toFixed(2);

/** The explanation's card parameters arrive as "QS"; unit as "imp"/"mp". */
export function renderMsg(m: MsgRef): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params ?? {})) {
    params[k] = (k === "card" || k === "best" || k === "agreed") && typeof v === "string" ? cardText(v as Card) : k === "unit" ? t(`unit.${v}`) : v;
  }
  return tMsg({ key: m.key, params });
}

export const groupText = (cards: readonly Card[]): string => cardText(cards[0]!) + cards.slice(1).map((c) => rankText(c[0] as Rank)).join("");

const stat = (label: string, value: string, testid: string, sub?: string): HTMLElement =>
  h("div", { class: "stat" }, h("div", { class: "stat-label" }, label), h("div", { class: "stat-value", testid: testid }, value), sub ? h("div", { class: "stat-sub" }, sub) : null);

function ratingBand(r: number): string {
  return r >= 80 ? "good" : r >= 50 ? "mid" : "bad";
}

function row(label: string, cells: (string | Node)[], cls = ""): HTMLElement {
  return h("tr", { class: cls }, h("th", { scope: "row" }, label), cells.map((c) => h("td", {}, c)));
}

function sampleDetails(a: Analysis, run: RunView, scoring: Scoring): HTMLElement {
  const chunks = run.solved?.chunks ?? [];
  const cpuMs = chunks.reduce((n, c) => n + c.dealMs + c.solveMs, 0);
  const dl = h("dl", { class: "kv", testid: "sample-details" });
  const add = (k: string, v: string, id: string): void => void dl.append(h("dt", {}, k), h("dd", { testid: id }, v));
  add(t("sample.n"), String(a.sample.n), "sample-n");
  add(t("sample.acceptance"), `${pct(a.sample.acceptanceRate)}%`, "sample-acceptance");
  add(t("sample.relaxations"), a.sample.relaxations.length ? a.sample.relaxations.join(", ") : t("sample.none"), "sample-relaxations");
  add(t("sample.seed"), String(a.sample.seed), "sample-seed");
  add(t("sample.msPerDeal"), a.sample.n ? (cpuMs / a.sample.n).toFixed(1) : "-", "sample-ms");
  add(t("sample.wall"), `${(run.wallMs / 1000).toFixed(1)} s`, "sample-wall");
  add(t("sample.akProof"), a.sample.akProof ? t("sample.on") : t("sample.off"), "sample-akproof");
  add(t("sample.unmatched"), String(a.unmatchedCalls), "sample-unmatched");
  const w = a.explanation.weights;
  const dec = a.explanation.decision;
  if (dec) add(t("sample.scheme"), t("sample.schemeValue", { k: dec.noiseK }), "sample-weights");
  else add(t("sample.weights"), `${Math.round(w.dd * 100)}% / ${Math.round(w.rules * 100)}%`, "sample-weights");
  add(t("sample.metric"), `${w.metric} (${scoring})`, "sample-metric");
  return dl;
}

function leadTable(a: Analysis, userCard: Card, scoring: Scoring, defeatOnly: boolean): HTMLElement {
  const unit = scoring === "IMP" ? t("unit.imp") : t("unit.mp");
  const head = h("tr", {}, h("th", {}, t("res.col.lead")), h("th", {}, t("res.col.pdef")), defeatOnly ? null : h("th", {}, t("res.col.edef")), h("th", {}, `${t("res.col.loss")} (${unit})`), h("th", {}, t("res.col.sR")));
  const rows = a.rate.options.map((o, i) => {
    const mine = o.cards.includes(userCard);
    const cls = [mine ? "user" : "", i === 0 ? "best" : ""].join(" ").trim();
    return h(
      "tr",
      { class: cls, testid: `lead-row-${o.card}` },
      h("td", {}, suited(groupText(o.cards))),
      h("td", {}, `${pct(o.pDef)}%`),
      defeatOnly ? null : h("td", {}, trick(o.eDef)),
      h("td", {}, scoring === "IMP" ? o.loss.toFixed(2) : pct(o.loss)),
      h("td", {}, `${Math.round(o.sR * 100)}%`),
    );
  });
  return h("div", { class: "table-wrap" }, h("table", { class: "grid", testid: "lead-table" }, h("thead", {}, head), h("tbody", {}, rows)));
}

function textbook(a: Analysis): HTMLElement {
  const rules = a.explanation.rules;
  if (rules.length === 0) return h("p", { class: "muted", testid: "rules-list" }, t("res.noRules"));
  return h(
    "ul",
    { class: "rules", testid: "rules-list" },
    rules.map((r) =>
      h(
        "li",
        { class: `rule ${r.relation}`, testid: `rule-${r.ruleId}` },
        h("div", {}, h("strong", {}, r.ruleId), " · ", t(`res.relation.${r.relation}`), " · ", t(`res.evidence.${r.evidence}`)),
        h("div", { class: "rule-text" }, r.text),
      ),
    ),
  );
}

export function renderResults(inp: ResultsInput): HTMLElement {
  const { run, userCard, scoring, defeatOnly } = inp;
  const root = h("section", { class: "panel results", testid: "results" }, h("h2", {}, t("res.title")));
  if (run.status === "impossible") {
    root.append(h("p", { class: "error", testid: "impossible-msg" }, t("res.impossible")));
    if (run.conflicts.length > 0) root.append(h("h3", {}, t("res.conflicts")), h("ul", { class: "conflicts" }, run.conflicts.map((c) => h("li", {}, c))));
    return root;
  }
  if (run.status === "error") {
    root.append(h("p", { class: "error", testid: "error-msg" }, t("run.error", { message: run.message ?? "" })));
    return root;
  }
  const a = run.analysis;
  if (!a) {
    root.append(h("p", { class: "muted" }, t("run.running")));
    return root;
  }
  const few = a.sample.n < FEW_DEALS;
  const e = a.explanation;
  const r = a.rate;
  const body = h("div", { class: few ? "greyed" : "", testid: "results-body" });
  if (few) body.append(h("p", { class: "notice", testid: "few-deals" }, t("res.few", { min: FEW_DEALS })));
  if (run.status === "cancelled") body.append(h("p", { class: "notice" }, t("run.cancelled", { n: a.sample.n })));
  if (defeatOnly) body.append(h("p", { class: "muted" }, t("res.defeatOnlyNote")));

  body.append(
    h(
      "div",
      { class: "rating-row" },
      h(
        "div",
        { class: `rating ${ratingBand(r.ratingPct)}`, testid: "rating-box" },
        h("div", { class: "stat-label" }, t("res.rating", { card: cardText(userCard) })),
        h("div", { class: "rating-value", testid: "rating" }, `${r.ratingPct}%`),
        h("div", { class: "bar" }, h("div", { class: "bar-fill", style: `width:${r.ratingPct}%` })),
      ),
      stat(t("res.sDD"), `${Math.round(r.sDD * 100)}%`, "sdd", e.decision ? t("res.ddDecides") : t("res.weightNote", { w: Math.round(e.weights.dd * 100) })),
      stat(t("res.sR"), `${Math.round(r.sREffective * 100)}%`, "sr", e.decision ? t("res.rulesTieBreak") : t("res.weightNote", { w: Math.round(e.weights.rules * 100) })),
    ),
  );

  body.append(
    h("h3", {}, t("res.compare")),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "grid" },
        h("thead", {}, h("tr", {}, h("th", {}), h("th", {}, t("res.col.pdef")), defeatOnly ? null : h("th", {}, t("res.col.edef")))),
        h(
          "tbody",
          {},
          row(`${t("res.yourLead")} ${cardText(userCard)}`, [h("span", { testid: "pdef-user" }, `${pct(r.pDefUser)}%`), ...(defeatOnly ? [] : [h("span", { testid: "edef-user" }, trick(r.eDefUser))])], "user"),
          row(`${t("res.bestLead")} ${cardText(r.bestCard)}`, [h("span", { testid: "pdef-best" }, `${pct(r.pDefBest)}%`), ...(defeatOnly ? [] : [h("span", { testid: "edef-best" }, trick(r.eDefBest))])], "best"),
        ),
      ),
    ),
    h("h3", {}, t("res.top3")),
    h(
      "ol",
      { class: "top3", testid: "top3" },
      r.top.map((o, i) =>
        h("li", { testid: `top-lead-${i}` }, suited(groupText(o.cards)), ` — ${pct(o.pDef)}%`, defeatOnly ? "" : `, ${trick(o.eDef)}`),
      ),
    ),
    h("h3", {}, t("res.verdict")),
    h("div", { class: "verdict", testid: "verdict" }, h("p", {}, h("strong", {}, suited(renderMsg(e.verdict)))), h("p", {}, suited(renderMsg(e.defeat))), h("p", {}, suited(renderMsg(e.best)))),
  );
  for (const b of e.biases) body.append(h("p", { class: "muted" }, renderMsg(b)));
  body.append(
    h("h3", {}, t("res.cardNote")),
    h("p", { testid: "card-note" }, suited(e.cardAdvice ? renderMsg(e.cardAdvice) : t("res.cardOk"))),
    h("h3", {}, t("res.textbook")),
    textbook(a),
    h("h3", {}, t("res.table")),
    leadTable(a, userCard, scoring, defeatOnly),
    h("h3", {}, t("sample.title")),
    sampleDetails(a, run, scoring),
  );
  if (e.notes.length > 0) body.append(h("ul", { class: "muted notes" }, e.notes.map((n) => h("li", {}, renderMsg(n)))));
  root.append(body);
  return root;
}

export function renderAbout(): HTMLElement {
  return h(
    "details",
    { class: "panel about", testid: "about-panel" },
    h("summary", {}, t("about.title")),
    h("ul", {}, ["about.limit1", "about.limit2", "about.limit3", "about.local"].map((k) => h("li", {}, t(k)))),
  );
}
