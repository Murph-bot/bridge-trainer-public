import { assemble } from "../dd/assemble.ts";
import { createBrowserPool } from "../dd/browser-pool.ts";
import { CHUNK_SIZE } from "../dd/job.ts";
import type { PoolResult } from "../dd/pool.ts";
import { RANKS, SEATS, SUITS } from "../engine/types.ts";
import type { Call, Card, Seat, Suit, Vul } from "../engine/types.ts";
import { analyse, analyseSolved, defaultRulebook, needsMoreDeals, prepare } from "../lead/analyse.ts";
import type { AnalyseSettings, LeadProblem, Prepared } from "../lead/analyse.ts";
import { weightsFor } from "../lead/config.ts";
import { getLang, loadLang, setLang, t } from "../i18n/i18n.ts";
import type { Lang } from "../i18n/i18n.ts";
import type { Scoring } from "../rules/types.ts";
import { ALL_BIDS, checkProblem, legalCalls } from "./auction.ts";
import type { ProblemCheck } from "./auction.ts";
import { h, suited } from "./dom.ts";
import { callText, contractText, formatAuction, formatHand, rankText, SUIT_SYMBOL, seatName, sideName, sortCards } from "./format.ts";
import { generateProblem } from "./random.ts";
import type { RandomProblem } from "./random.ts";
import { renderAbout, renderMsg, renderResults } from "./results.ts";
import type { RunView } from "./results.ts";
import { OPPONENT_SYSTEM, PARTNERSHIP_SYSTEM, profilesFor } from "./systems.ts";
import { parseAuctionText, parseHandText } from "./text.ts";

/** First solve of a problem; more deals are added automatically while the two best leads are within noise (lead-config.json "adaptive"). */
const DEALS_DEFAULT = 200;
const DEALS_REFINED = 1000;
const POOL_SIZE = 4;
const VULS: [Vul, string][] = [["none", "vul.none"], ["NS", "vul.NS"], ["EW", "vul.EW"], ["both", "vul.all"]];

interface State {
  hand: Card[];
  auction: Call[];
  dealer: Seat;
  vul: Vul;
  scoring: Scoring;
  userCard: Card | null;
  seed: number;
  defeatOnly: boolean;
  disciplined: boolean;
  disciplinedTouched: boolean;
  /** null = the weights table default for the contract. */
  wDD: number | null;
  random: RandomProblem | null;
  randomFailed: boolean;
}

interface Derived {
  check: ProblemCheck;
  prep: Prepared | null;
  autoAk: boolean;
  slam: boolean;
  defaultDD: number;
  weightsContext: string;
}

interface Cache {
  key: string;
  solved: PoolResult;
}

const fresh = (): State => ({
  hand: ["AS", "7S", "JH", "8H", "7H", "6H", "3H", "QD", "JD", "5D", "4D", "9C", "3C"],
  auction: ["1N", "P", "3N", "P", "P", "P"],
  dealer: "N",
  vul: "none",
  scoring: "IMP",
  userCard: null,
  seed: 1,
  defeatOnly: false,
  disciplined: false,
  disciplinedTouched: false,
  wDD: null,
  random: null,
  randomFailed: false,
});

const idleRun = (): RunView => ({ status: "idle", targetDeals: DEALS_DEFAULT, wallMs: 0, conflicts: [] });

/** Defence-side conflicts the constraint inference reported, for the impossible-constraints message. */
const conflictsOf = (prep: Prepared): string[] => SEATS.flatMap((s) => prep.job.constraints[s].conflicts.map((c) => `${seatName(s)}: ${c}`));

export function mountApp(root: HTMLElement): void {
  const state = fresh();
  let run = idleRun();
  let derived: Derived;
  let cache: Cache | null = null;
  let runId = 0;
  let controller: AbortController | null = null;
  let pool: ReturnType<typeof createBrowserPool> | null = null;

  // Elements that survive refreshes (inputs, controls) are created per mount; the rest are rebuilt from state.
  let handInput: HTMLInputElement;
  let auctionInput: HTMLInputElement;
  let dealerSelect: HTMLSelectElement;
  let vulSelect: HTMLSelectElement;
  let scoringSelect: HTMLSelectElement;
  let seedInput: HTMLInputElement;
  let defeatBox: HTMLInputElement;
  let discBox: HTMLInputElement;
  let discNote: HTMLElement;
  let slider: HTMLInputElement;
  let sliderValue: HTMLElement;
  let sliderNote: HTMLElement;
  let progress: HTMLElement;
  let rerunBtn: HTMLButtonElement;
  let refineBtn: HTMLButtonElement;
  let cancelBtn: HTMLButtonElement;
  const slot: Record<"handErrors" | "count" | "picker" | "auctionErrors" | "auctionTable" | "bidBox" | "contract" | "random" | "hand" | "results", HTMLElement> = {} as never;

  const slam = (): boolean => (derived.check.contract?.level ?? 0) >= 6;

  function problem(): LeadProblem | null {
    const c = derived.check;
    if (c.errors.length > 0 || c.handErrors.length > 0 || !c.leader || !state.userCard || !state.hand.includes(state.userCard)) return null;
    return { hand: state.hand, auction: state.auction, dealer: state.dealer, vul: state.vul, scoring: state.scoring, userCard: state.userCard, profiles: profilesFor(c.leader) };
  }

  function settings(deals: number, adaptive = false): AnalyseSettings {
    const s = slam();
    return {
      adaptive,
      mode: state.wDD === null ? "new" : "blend",
      deals,
      seed: state.seed,
      dealTimeoutMs: 10000,
      disciplined: s && state.disciplined,
      akProof: s ? state.disciplined : undefined,
      defeatOnly: state.defeatOnly,
      weights: state.wDD === null ? undefined : { dd: state.wDD, rules: 1 - state.wDD },
    };
  }

  function recompute(): void {
    const check = checkProblem(state.hand, state.auction, state.dealer);
    let prep: Prepared | null = null;
    if (check.errors.length === 0 && check.handErrors.length === 0 && check.leader) {
      try {
        prep = prepare({ hand: state.hand, auction: state.auction, dealer: state.dealer, vul: state.vul, scoring: state.scoring, userCard: state.hand[0]!, profiles: profilesFor(check.leader) }, { deals: DEALS_DEFAULT, seed: state.seed, dealTimeoutMs: 10000, disciplined: false });
      } catch {
        prep = null;
      }
    }
    let defaultDD = 0.7;
    let weightsContext = "";
    if (prep) {
      const w = weightsFor(defaultRulebook().config, { contractType: prep.ctx.contractType, levelClass: prep.ctx.levelClass, scoring: state.scoring, sacrifice: prep.ctx.features.has("sacrifice") });
      defaultDD = w.dd;
      weightsContext = w.context;
    }
    derived = { check, prep, autoAk: prep?.akProof ?? false, slam: (check.contract?.level ?? 0) >= 6, defaultDD, weightsContext };
    if (!state.disciplinedTouched) state.disciplined = derived.autoAk;
  }

  function dealKey(): string {
    return JSON.stringify([sortCards(state.hand), state.auction, state.dealer, state.vul, state.seed, state.defeatOnly, slam() ? state.disciplined : null]);
  }

  // ---- analysis -------------------------------------------------------------------------------------------------

  function stop(): void {
    runId++;
    controller?.abort();
    controller = null;
  }

  function contiguous(solved: PoolResult): PoolResult {
    let k = 0;
    while (k < solved.chunks.length && solved.chunks[k]!.chunk === k) k++;
    return assemble(solved.chunks.slice(0, k), k * CHUNK_SIZE, solved.stage, false);
  }

  function rerate(p: LeadProblem): void {
    const s = settings(Math.max(DEALS_DEFAULT, cache!.solved.deals.length), true);
    const prep = prepare(p, s);
    const analysis = analyseSolved(p, s, prep, cache!.solved);
    run = { ...run, status: "done", analysis, solved: cache!.solved, message: undefined, conflicts: [] };
  }

  async function start(p: LeadProblem, deals: number, previous?: PoolResult, adaptive = false): Promise<void> {
    stop();
    const id = runId;
    const ctl = new AbortController();
    controller = ctl;
    const t0 = performance.now();
    run = { status: "running", targetDeals: deals, wallMs: 0, conflicts: [], analysis: previous ? run.analysis : undefined, solved: previous };
    refreshControls();
    refreshResults();
    pool ??= createBrowserPool(POOL_SIZE);
    const key = dealKey();
    const s = settings(deals, adaptive);
    try {
      const res = await analyse(p, pool, {
        settings: s,
        signal: ctl.signal,
        previous,
        onProgress: (a) => {
          if (id !== runId) return;
          run = { ...run, status: "running", analysis: a, solved: a.solved, wallMs: performance.now() - t0 };
          refreshControls();
          refreshResults();
        },
      });
      if (id !== runId) return;
      cache = { key, solved: contiguous(res.solved) };
      run = { status: ctl.signal.aborted ? "cancelled" : "done", targetDeals: deals, wallMs: performance.now() - t0, analysis: res, solved: res.solved, conflicts: [] };
    } catch (e) {
      if (id !== runId) return;
      const message = e instanceof Error ? e.message : String(e);
      if (ctl.signal.aborted) run = idleRun();
      else if (message.startsWith("no deals could be generated")) run = { status: "impossible", targetDeals: deals, wallMs: performance.now() - t0, conflicts: derived.prep ? conflictsOf(derived.prep) : [] };
      else run = { status: "error", targetDeals: deals, wallMs: performance.now() - t0, message, conflicts: [] };
    }
    refreshControls();
    refreshResults();
  }

  function evaluate(forceNew = false): void {
    const p = problem();
    if (!p) {
      stop();
      run = idleRun();
    } else if (!forceNew && cache?.key === dealKey()) {
      stop();
      rerate(p);
      const prep = prepare(p, settings(cache.solved.deals.length, true));
      if (state.wDD === null && !state.defeatOnly && cache.solved.deals.length < defaultRulebook().config.adaptive.cap && needsMoreDeals([{ p, prep }], cache.solved, defaultRulebook())) {
        void start(p, cache.solved.deals.length, cache.solved, true);
        return;
      }
    } else {
      void start(p, DEALS_DEFAULT, undefined, true);
      return;
    }
    refreshControls();
    refreshResults();
  }

  // ---- state changes ------------------------------------------------------------------------------------------------

  /** Anything that changes the problem itself: the old lead and result no longer apply. */
  function problemChanged(): void {
    stop();
    state.disciplinedTouched = false;
    state.userCard = null;
    run = idleRun();
    recompute();
    refreshInput();
    refreshControls();
    refreshResults();
  }

  function setHand(cards: Card[], fromInput: boolean): void {
    state.hand = cards;
    state.random = null;
    if (!fromInput) handInput.value = formatHand(cards);
    problemChanged();
  }

  function setAuction(calls: Call[], fromInput: boolean): void {
    state.auction = calls;
    state.random = null;
    if (!fromInput) auctionInput.value = formatAuction(calls);
    problemChanged();
  }

  function loadRandom(seed: number): void {
    const p = generateProblem(seed, PARTNERSHIP_SYSTEM, OPPONENT_SYSTEM);
    state.seed = seed;
    seedInput.value = String(seed);
    state.randomFailed = p === null;
    if (p) {
      state.random = p;
      state.hand = p.hand;
      state.auction = p.auction;
      state.dealer = p.dealer;
      state.vul = p.vul;
      handInput.value = formatHand(p.hand);
      auctionInput.value = formatAuction(p.auction);
      dealerSelect.value = p.dealer;
      vulSelect.value = p.vul;
    }
    problemChanged();
  }

  function pickLead(card: Card): void {
    state.userCard = card;
    refreshHand();
    evaluate();
  }

  // ---- views --------------------------------------------------------------------------------------------------------

  const errorList = (errs: { key: string; params?: Record<string, string | number> }[], testid: string): HTMLElement =>
    h("ul", { class: "errors", testid }, errs.map((e) => h("li", {}, suited(renderMsg(e)))));

  function refreshInput(): void {
    const parsedHand = parseHandText(handInput.value);
    slot.handErrors.replaceChildren(errorList([...parsedHand.errors, ...derived.check.handErrors], "validation-hand"));
    slot.count.textContent = t("input.cardsCount", { n: new Set(state.hand).size });

    const parsedAuction = parseAuctionText(auctionInput.value);
    const auctionMsgs = [...parsedAuction.errors, ...derived.check.errors];
    slot.auctionErrors.replaceChildren(errorList(auctionMsgs, "validation-auction"));

    slot.auctionTable.replaceChildren(auctionTable());
    slot.bidBox.replaceChildren(bidBox());
    slot.picker.replaceChildren(picker());

    const c = derived.check;
    slot.contract.replaceChildren(
      c.contract && c.leader
        ? h(
            "p",
            { class: "contract", testid: "contract-line" },
            suited(t("input.contractLine", { contract: contractText(c.contract), declarer: seatName(c.contract.declarer), leader: seatName(c.leader) })),
            h("br"),
            h("span", { class: "muted" }, t("input.leaderNote", { leader: seatName(c.leader), side: sideName(c.leader) })),
          )
        : h("p", { class: "muted" }, t("input.noContract")),
    );

    const r = state.random;
    slot.random.replaceChildren();
    if (state.randomFailed) slot.random.append(h("p", { class: "error", testid: "random-failed" }, t("input.randomFailed")));
    if (r) {
      const natural = r.rules.filter((x, i) => x === null && r.auction[i] !== "P").length;
      slot.random.append(
        h(
          "div",
          { testid: "random-info" },
          h("p", { class: "muted" }, t("input.randomInfo", { seed: r.seed, fallback: natural, calls: r.auction.length })),
          h("details", {}, h("summary", {}, t("input.randomRules")), h("ol", { class: "rules-used" }, r.auction.map((call, i) => h("li", {}, `${callText(call)} — ${r.rules[i] ?? "·"}`)))),
        ),
      );
    }
    refreshHand();
  }

  function auctionTable(): HTMLElement {
    if (state.auction.length === 0) return h("p", { class: "muted" }, t("auction.empty"));
    const start = SEATS.indexOf(state.dealer);
    const cells: (string | null)[] = [...Array<null>(start).fill(null), ...state.auction.map((c) => callText(c))];
    const rows: HTMLElement[] = [];
    for (let i = 0; i < cells.length; i += 4) rows.push(h("tr", {}, [0, 1, 2, 3].map((k) => h("td", {}, cells[i + k] ? suited(cells[i + k]!) : ""))));
    return h("table", { class: "auction", testid: "auction-table" }, h("thead", {}, h("tr", {}, SEATS.map((s) => h("th", {}, seatName(s))))), h("tbody", {}, rows));
  }

  function bidBox(): HTMLElement {
    const legal = new Set(legalCalls(state.auction));
    const btn = (call: Call, cls = ""): HTMLElement =>
      h("button", { type: "button", class: `bid ${cls}`, testid: `bid-${call}`, disabled: !legal.has(call), onclick: () => setAuction([...state.auction, call], false) }, suited(callText(call)));
    const levels = [1, 2, 3, 4, 5, 6, 7].map((l) => h("div", { class: "bid-row" }, ALL_BIDS.filter((b) => b[0] === String(l)).map((b) => btn(b, b[1] === "H" || b[1] === "D" ? "red" : ""))));
    return h(
      "div",
      { class: "bidbox" },
      h("div", { class: "bid-levels" }, levels),
      h("div", { class: "bid-row" }, btn("P"), btn("X"), btn("XX")),
      h(
        "div",
        { class: "bid-row" },
        h("button", { type: "button", testid: "auction-undo", disabled: state.auction.length === 0, onclick: () => setAuction(state.auction.slice(0, -1), false) }, t("input.undo")),
        h("button", { type: "button", testid: "auction-clear", disabled: state.auction.length === 0, onclick: () => setAuction([], false) }, t("input.clearAuction")),
      ),
    );
  }

  function picker(): HTMLElement {
    const have = new Set(state.hand);
    const full = have.size >= 13;
    return h(
      "div",
      { class: "picker" },
      SUITS.map((s: Suit) =>
        h(
          "div",
          { class: "picker-row" },
          h("span", { class: `suit-label ${s === "H" || s === "D" ? "red" : "black"}` }, SUIT_SYMBOL[s]),
          RANKS.map((r) => {
            const c = (r + s) as Card;
            const on = have.has(c);
            return h(
              "button",
              { type: "button", class: `pick ${on ? "on" : ""}`, testid: `pick-${c}`, "aria-pressed": String(on), disabled: !on && full, onclick: () => setHand(on ? state.hand.filter((x) => x !== c) : [...state.hand, c], false) },
              rankText(r),
            );
          }),
        ),
      ),
      h("button", { type: "button", testid: "hand-clear", onclick: () => setHand([], false) }, t("input.clearHand")),
    );
  }

  function refreshHand(): void {
    const ready = derived.check.errors.length === 0 && derived.check.handErrors.length === 0;
    const rows = SUITS.map((s: Suit) => {
      const cards = sortCards(state.hand.filter((c) => c[1] === s));
      return h(
        "div",
        { class: "hand-row" },
        h("span", { class: `suit-label ${s === "H" || s === "D" ? "red" : "black"}`, title: t(`suit.${s}`) }, SUIT_SYMBOL[s]),
        cards.length === 0
          ? h("span", { class: "muted" }, "—")
          : cards.map((c) =>
              h("button", { type: "button", class: `card ${s === "H" || s === "D" ? "red" : "black"} ${state.userCard === c ? "selected" : ""}`, testid: `lead-${c}`, disabled: !ready, onclick: () => pickLead(c) }, rankText(c[0] as never)),
            ),
      );
    });
    slot.hand.replaceChildren(h("h2", {}, t("run.handTitle")), h("div", { class: "hand" }, rows), h("p", { class: "muted", testid: "lead-hint" }, ready ? (state.userCard ? "" : t("run.pickLead")) : t("run.fixInput")));
  }

  function refreshResults(): void {
    slot.results.replaceChildren(state.userCard && run.status !== "idle" ? renderResults({ run, userCard: state.userCard, scoring: state.scoring, defeatOnly: state.defeatOnly }) : "");
  }

  function refreshControls(): void {
    const running = run.status === "running";
    const p = problem();
    defeatBox.checked = state.defeatOnly;
    discBox.checked = state.disciplined;
    discBox.disabled = !derived.slam;
    discNote.textContent = !derived.slam ? t("run.disciplinedSlamOnly") : derived.autoAk ? t("run.disciplinedAuto") : "";
    const dd = state.wDD ?? derived.defaultDD;
    slider.value = String(Math.round(dd * 100));
    sliderValue.textContent = t("run.weightsValue", { dd: Math.round(dd * 100), rules: 100 - Math.round(dd * 100) });
    sliderNote.textContent = state.wDD === null ? t("run.weightsNew") : derived.weightsContext ? t("run.weightsContext", { context: derived.weightsContext }) : "";
    const done = run.solved?.deals.length ?? 0;
    progress.textContent = running ? t("run.progress", { done, total: Math.max(run.targetDeals, done) }) : "";
    progress.style.display = running ? "" : "none";
    cancelBtn.style.display = running ? "" : "none";
    rerunBtn.style.display = !running && p ? "" : "none";
    const canRefine = !running && p && (run.status === "done" || run.status === "cancelled") && (run.analysis?.sample.n ?? 0) < DEALS_REFINED;
    refineBtn.style.display = canRefine ? "" : "none";
  }

  // ---- layout -------------------------------------------------------------------------------------------------------

  const field = (label: string, ...rest: (Node | string | null)[]): HTMLElement => h("label", { class: "field" }, h("span", { class: "field-label" }, label), rest);
  const container = (name: keyof typeof slot, tag: "div" | "section" = "div", cls = ""): HTMLElement => (slot[name] = h(tag, cls ? { class: cls } : {}));

  function langButton(l: Lang): HTMLElement {
    return h("button", { type: "button", class: `lang ${getLang() === l ? "on" : ""}`, testid: `lang-${l}`, "aria-pressed": String(getLang() === l), onclick: () => { setLang(l); build(); } }, t(`lang.${l}`));
  }

  function select<T extends string>(options: [T, string][], value: T, testid: string, onchange: (v: T) => void): HTMLSelectElement {
    const el = h("select", { testid, onchange: () => onchange(el.value as T) }, options.map(([v, label]) => h("option", { value: v }, label)));
    el.value = value;
    return el;
  }

  function build(): void {
    document.documentElement.lang = getLang();
    document.title = t("app.title");
    handInput = h("input", { type: "text", class: "text", testid: "hand-input", spellcheck: "false", autocomplete: "off", placeholder: t("input.handHint"), oninput: () => {
      const parsed = parseHandText(handInput.value);
      setHand(parsed.value, true);
    } });
    handInput.value = formatHand(state.hand);
    auctionInput = h("input", { type: "text", class: "text", testid: "auction-input", spellcheck: "false", autocomplete: "off", placeholder: t("input.auctionHint"), oninput: () => setAuction(parseAuctionText(auctionInput.value).value, true) });
    auctionInput.value = formatAuction(state.auction);
    dealerSelect = select(SEATS.map((s) => [s, seatName(s)] as [Seat, string]), state.dealer, "dealer-select", (v) => { state.dealer = v; state.random = null; problemChanged(); });
    vulSelect = select(VULS.map(([v, k]) => [v, t(k)] as [Vul, string]), state.vul, "vul-select", (v) => { state.vul = v; state.random = null; problemChanged(); });
    scoringSelect = select<Scoring>([["IMP", t("IMP")], ["MP", t("matchpoint")]], state.scoring, "scoring-select", (v) => { state.scoring = v; recompute(); refreshControls(); evaluate(); });
    seedInput = h("input", { type: "number", min: "0", step: "1", class: "text seed", testid: "seed-input", onchange: () => {
      const n = Math.floor(Number(seedInput.value));
      state.seed = Number.isFinite(n) && n >= 0 ? n : state.seed;
      seedInput.value = String(state.seed);
      evaluate();
    } });
    seedInput.value = String(state.seed);

    defeatBox = h("input", { type: "checkbox", testid: "defeat-only", onchange: () => { state.defeatOnly = defeatBox.checked; evaluate(); } });
    discBox = h("input", { type: "checkbox", testid: "disciplined", onchange: () => { state.disciplined = discBox.checked; state.disciplinedTouched = true; evaluate(); } });
    discNote = h("span", { class: "muted" });
    sliderValue = h("span", { class: "slider-value", testid: "weights-value" });
    sliderNote = h("span", { class: "muted" });
    slider = h("input", { type: "range", min: "0", max: "100", step: "5", testid: "weights-slider", oninput: () => { state.wDD = Number(slider.value) / 100; refreshControls(); if (problem() && cache?.key === dealKey()) evaluate(); } });
    progress = h("span", { class: "progress", testid: "progress" });
    rerunBtn = h("button", { type: "button", testid: "rerun-btn", onclick: () => evaluate(true) }, t("run.rerun"));
    refineBtn = h("button", { type: "button", class: "primary", testid: "refine-btn", onclick: () => { const p = problem(); if (p) void start(p, DEALS_REFINED, cache?.key === dealKey() ? cache.solved : undefined); } }, t("run.refine", { n: DEALS_REFINED }));
    cancelBtn = h("button", { type: "button", testid: "cancel-btn", onclick: () => { controller?.abort(); } }, t("run.cancel"));
    const resetW = h("button", { type: "button", class: "link", testid: "weights-reset", onclick: () => { state.wDD = null; refreshControls(); evaluate(); } }, t("run.weightsReset"));

    const left = h(
      "section",
      { class: "panel input" },
      h("h2", {}, t("input.title")),
      field(t("input.handText"), handInput, container("count", "div", "muted"), container("handErrors")),
      h("details", { class: "picker-details" }, h("summary", {}, t("input.picker")), container("picker")),
      h("div", { class: "row" }, field(t("dealer"), dealerSelect), field(t("vulnerability"), vulSelect), field(t("input.scoring"), scoringSelect)),
      field(t("input.auctionText"), auctionInput, container("auctionErrors")),
      container("auctionTable"),
      h("details", { class: "picker-details", open: true }, h("summary", {}, t("input.bidBox")), container("bidBox")),
      container("contract"),
      h("div", { class: "row random" }, field(t("input.seed"), seedInput), h("button", { type: "button", testid: "seed-use-btn", onclick: () => loadRandom(Number(seedInput.value) >= 0 ? Math.floor(Number(seedInput.value)) : 1) }, t("input.useSeed")), h("button", { type: "button", class: "primary", testid: "random-btn", onclick: () => loadRandom(Math.floor(Math.random() * 1_000_000_000)) }, t("input.random"))),
      container("random"),
    );
    const controls = h(
      "section",
      { class: "panel controls" },
      h("div", { class: "row" }, h("label", { class: "check" }, defeatBox, t("run.defeatOnly")), h("label", { class: "check" }, discBox, t("run.disciplined")), discNote),
      h("div", { class: "row slider-row" }, h("label", { class: "field grow" }, h("span", { class: "field-label" }, t("run.weights")), slider), sliderValue, resetW, sliderNote),
      h("div", { class: "row" }, rerunBtn, refineBtn, cancelBtn, progress),
    );
    const right = h("div", { class: "right" }, container("hand", "section", "panel hand-panel"), controls, container("results"), renderAbout());

    root.replaceChildren(
      h("header", { class: "top" }, h("div", {}, h("h1", {}, t("app.title")), h("p", { class: "muted" }, t("app.subtitle"))), h("div", { class: "langs", role: "group", "aria-label": t("app.language") }, langButton("el"), langButton("en"))),
      h("main", { class: "layout" }, left, right),
    );
    recompute();
    refreshInput();
    refreshControls();
    refreshResults();
  }

  loadLang();
  build();
}
