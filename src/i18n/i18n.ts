import glossaryRaw from "../../data/i18n-glossary.json";
import appRaw from "./app-strings.json";
import { formatMsg } from "../lead/messages.ts";
import type { MsgRef } from "../lead/explain.ts";

export type Lang = "el" | "en";
export const LANGS: readonly Lang[] = ["el", "en"];
export const DEFAULT_LANG: Lang = "el";

export interface Entry {
  en: string;
  el: string;
  elPlural?: string;
  /** False for glossary terms awaiting the expert's OK and for app strings flagged `unverified`. */
  verified: boolean;
  from: "glossary" | "app";
}

export type Table = Map<string, Entry>;

interface GlossaryTerm {
  key: string;
  en: string;
  el: string;
  elPlural?: string;
  verified: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Glossary file first, then the app's own strings; a key in both is an error (the glossary stays the single source for its terms). */
export function buildTable(glossary: unknown, app: unknown): Table {
  const table: Table = new Map();
  if (!isObj(glossary) || !Array.isArray(glossary.terms)) throw new Error("i18n glossary: missing terms");
  for (const t of glossary.terms as GlossaryTerm[]) {
    if (typeof t.key !== "string" || typeof t.en !== "string" || typeof t.el !== "string") throw new Error("i18n glossary: term needs key, en, el");
    table.set(t.key, { en: t.en, el: t.el, elPlural: t.elPlural, verified: t.verified === true, from: "glossary" });
  }
  if (!isObj(app)) throw new Error("app strings: must be an object");
  for (const [key, v] of Object.entries(app)) {
    if (!isObj(v) || typeof v.en !== "string" || typeof v.el !== "string") throw new Error(`app strings: ${key} needs en and el`);
    if (table.has(key)) throw new Error(`app strings: ${key} already in the glossary`);
    table.set(key, { en: v.en, el: v.el, verified: v.unverified !== true, from: "app" });
  }
  return table;
}

export const DEV_MARK = " ⚠";

export interface ResolveOptions {
  lang: Lang;
  /** Append DEV_MARK to unverified terms. */
  dev: boolean;
  plural?: boolean;
}

export function resolve(table: Table, key: string, o: ResolveOptions): string {
  const e = table.get(key);
  if (!e) return `⟦${key}⟧`;
  let text = o.lang === "el" ? (o.plural && e.elPlural ? e.elPlural : e.el) : e.en;
  // The glossary writes suits as "Spades / ♠"; the label wants the word only.
  if (o.lang === "en" && key.startsWith("suit.")) text = text.replace(/ \/ .*/, "");
  return !e.verified && o.dev ? text + DEV_MARK : text;
}

export const TABLE: Table = buildTable(glossaryRaw, appRaw);

const STORAGE_KEY = "bt.lang";
let lang: Lang = DEFAULT_LANG;

export function loadLang(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    lang = v === "en" || v === "el" ? v : DEFAULT_LANG;
  } catch {
    lang = DEFAULT_LANG;
  }
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, l);
  } catch {
    // storage unavailable (private mode): the choice lasts for this page only
  }
}

export const getLang = (): Lang => lang;

/** Label for an i18n key in the current language, optionally with {param} substitution. */
export function t(key: string, params?: Record<string, string | number>, plural = false): string {
  const text = resolve(TABLE, key, { lang, dev: import.meta.env.DEV, plural });
  return params ? formatMsg(text, params) : text;
}

export const tMsg = (m: MsgRef): string => t(m.key, m.params);
