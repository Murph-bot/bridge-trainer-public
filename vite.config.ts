import { defineConfig, type Plugin } from "vite";

type Json = Record<string, unknown>;

const withoutDocs = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(withoutDocs)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "doc").map(([k, x]) => [k, withoutDocs(x)]))
  : v;

const cardText = (side: unknown) => ((side as Json).card as string).replace(/\s*\(book:[^)]*\)/gi, "");

const sanitizers: Record<string, (d: unknown) => unknown> = {
  "lead-rules.json": (d) =>
    (d as Json[]).map((r) => {
      const source = r.source as Json;
      const evidence = r.evidence as Json;
      return { ...r, source: { book: "", book_key: source.book_key, chapter: 0, page: 0 }, evidence: { type: evidence.type } };
    }),
  "lead-card-choice.json": (d) => ({
    holdings: ((d as Json).holdings as Json[]).map((h) => ({
      holding: h.holding,
      vs_NT: { card: cardText(h.vs_NT) },
      vs_suit: { card: cardText(h.vs_suit) },
    })),
  }),
  "system-stelios-sotos.json": (d) => {
    const { notes: _notes, ...carding } = (d as Json).carding as Json;
    return { ...(d as Json), carding };
  },
  "lead-config.json": withoutDocs,
  "lead-config.baseline.json": withoutDocs,
};

// The published app ships rule logic only: no source titles, pages or study notes.
function stripSources(): Plugin {
  return {
    name: "strip-sources",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      const file = Object.keys(sanitizers).find((f) => id.endsWith(`/data/${f}`));
      if (!file) return null;
      return { code: JSON.stringify(sanitizers[file]!(JSON.parse(code))), map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripSources()],
  worker: { plugins: () => [stripSources()] },
});
