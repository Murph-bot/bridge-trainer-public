import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import glossaryRaw from "../../data/i18n-glossary.json";
import { EXPLAIN_KEYS } from "../lead/explain.ts";
import { EXPLAIN_EN } from "../lead/messages.ts";
import appRaw from "./app-strings.json";
import { buildTable, DEV_MARK, resolve, TABLE } from "./i18n.ts";

const walk = (dir: URL): URL[] =>
  readdirSync(dir).flatMap((n) => {
    const u = new URL(n, dir);
    return statSync(u).isDirectory() ? walk(new URL(`${n}/`, dir)) : [u];
  });

const uiSources = walk(new URL("../ui/", import.meta.url)).filter((u) => u.pathname.endsWith(".ts") && !u.pathname.endsWith(".test.ts"));
const usedKeys = (): Set<string> => {
  const keys = new Set<string>();
  for (const f of uiSources) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*["']([\w.]+)["']/g)) keys.add(m[1]!);
    // keys given as literals to helpers: t(`lang.${l}`) style families and "key": strings in message refs
    for (const m of src.matchAll(/\bkey:\s*["']([\w.]+)["']/g)) keys.add(m[1]!);
  }
  return keys;
};

/** Key families the UI builds with a template literal: every member must exist too. */
const FAMILIES: string[] = [
  ...["S", "H", "D", "C"].map((s) => `suit.${s}`),
  ...["N", "E", "S", "W"].map((s) => `seat.${s}`),
  ...["el", "en"].map((l) => `lang.${l}`),
  ...["supports", "against", "other", "tip"].map((r) => `res.relation.${r}`),
  ...["simulation", "author_advice"].map((e) => `res.evidence.${e}`),
  ...["imp", "mp"].map((u) => `unit.${u}`),
  "vul.none", "vul.NS", "vul.EW", "vul.all", "IMP", "matchpoint", "pass", "double", "redouble", "strain.NT",
];

describe("acceptance: T12 i18n", () => {
  it("every key used in src/ui resolves in Greek and English", () => {
    const keys = [...usedKeys(), ...FAMILIES, ...EXPLAIN_KEYS];
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      const e = TABLE.get(k);
      expect(e, `missing i18n key ${k}`).toBeDefined();
      expect(e!.en.trim(), `${k} en`).not.toBe("");
      expect(e!.el.trim(), `${k} el`).not.toBe("");
    }
  });

  it("the explanation messages exist in English as the orchestrator wrote them, and Greek has the same placeholders", () => {
    for (const k of EXPLAIN_KEYS) {
      const e = TABLE.get(k)!;
      expect(e.en).toBe(EXPLAIN_EN[k]);
      const ph = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
      expect(ph(e.el), k).toEqual(ph(e.en));
    }
  });

  it("every app string uses the same placeholders in both languages", () => {
    for (const [k, v] of Object.entries(appRaw as Record<string, { en: string; el: string }>)) {
      const ph = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
      expect(ph(v.el), k).toEqual(ph(v.en));
    }
  });

  it("app strings never redefine a glossary key", () => {
    expect(() => buildTable(glossaryRaw, { suit: { en: "x", el: "y" } })).toThrow("already in the glossary");
  });

  it("uses the glossary terms where they exist (honours = Ονέρ, overcall = Παρεμβολή)", () => {
    expect(TABLE.get("honour")!.el).toBe("Ονέρ");
    expect(TABLE.get("overcall")!.el).toBe("Παρεμβολή");
    expect(TABLE.get("overcall")!.elPlural).toBe("Παρεμβολές");
    expect(resolve(TABLE, "overcall", { lang: "el", dev: false, plural: true })).toBe("Παρεμβολές");
    expect(resolve(TABLE, "suit.S", { lang: "en", dev: false })).toBe("Spades");
  });

  it("no Greek string contains the forbidden words τιμές/τιμή or Αντιμπίντ", () => {
    const greek: string[] = [];
    for (const [k, e] of TABLE) {
      greek.push(e.el);
      if (e.elPlural) greek.push(e.elPlural);
      expect(k).toBeTruthy();
    }
    expect(greek.length).toBeGreaterThan(150);
    const plain = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const s of greek) {
      expect(plain(s), s).not.toMatch(/τιμ(η|ες|ης|ων|ην)(?![α-ω])/);
      expect(plain(s), s).not.toMatch(/αντιμπιντ/);
    }
  });

  it("unverified terms carry the dev marker only when dev is on", () => {
    expect(TABLE.get("dealer")!.verified).toBe(false);
    expect(resolve(TABLE, "dealer", { lang: "el", dev: true })).toBe(`Μοιράζει${DEV_MARK}`);
    expect(resolve(TABLE, "dealer", { lang: "el", dev: false })).toBe("Μοιράζει");
    expect(resolve(TABLE, "seat.N", { lang: "el", dev: true })).toBe("Βορράς");
    expect(resolve(TABLE, "input.seed", { lang: "en", dev: true })).toBe(`Seed${DEV_MARK}`);
  });

  it("an unknown key is shown loudly", () => {
    expect(resolve(TABLE, "no.such.key", { lang: "en", dev: false })).toBe("⟦no.such.key⟧");
  });
});
