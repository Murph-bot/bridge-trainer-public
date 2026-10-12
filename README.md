# bridge-trainer

Local opening-lead trainer (TypeScript + Vite). Greek UI by default, English toggle.

## Public snapshot: book content excluded

This repository contains no book content. `data/lead-rules.json` (8 rules) and `data/lead-card-choice.json` are small
sample files written for this snapshot (standard leading conventions, no book text, hands or statistics); the book test
set (`lead-test-problems.json`) is not included. Without the private data pack, tests that need it skip themselves
and `npm run eval:leads` / `npm run calibrate` cannot run.

### Private data pack (optional, access required)

Setup, from the repo root (one line):

```bash
gh repo clone Murph-bot/bridge-trainer-bookdata data/private
```

or point `BRIDGE_DATA_DIR` at a checkout of the pack. When `data/private/lead-rules.json` (or
`$BRIDGE_DATA_DIR/lead-rules.json`) exists, `lead-rules.json`, `lead-card-choice.json`, `lead-rules-rulings-01.json` and
`lead-test-problems.json` are read from the pack instead of `data/`: by `npm run dev` / `npm run build` (Vite plugin,
resolved at build time), `npm test` (Vitest), `npm run eval:leads` / `calibrate` / `eval:group` (esbuild + tsx hook).
See `scripts/data-pack.mjs`. `data/private/` is gitignored; never commit the pack here.

## Requirements

- Node.js 24+ (Mac target: 24.14)

## Start locally

```bash
cd bridge-trainer-public
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Other scripts

| Script | What it does |
|---|---|
| `npm test` | Unit + acceptance tests (vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build to `dist/` |
| `npm run smoke` | Headless Playwright smoke (EL + EN) against `vite preview` |
| `npm run eval:leads` | Book-problem eval over `data/lead-test-problems.json`: modes blend / dd / rules / new (plus the phase-5 DD-only), top-1 and top-3, adaptive sampling (200 deals, +100 while the two best leads are within noise, cap 1000), 7 workers. Also writes the calibration cache `.eval-out/calib-cache.json`. Options: `--limit N`, `--ids a,b`, `--deals N` (fixed), `--start/--step/--cap`, `--workers`, `--seed`, `--out`, `--cache` |
| `npm run calibrate` | Offline calibration from the cache (no DD, seconds): fits `noiseK` and the rule tie-break weights on odd problem ids, reports even ids, writes `data/lead-config.json` "tieBreak" and `.eval-out/calibration-report.md`. Options: `--cache`, `--cached-rules`, `--no-legacy`, `--no-write`, `--report` |
| `npm run eval:calibrate` | `eval:leads` then `calibrate` |
| `npm run eval:group -- <leads.json> [out.md] [mode]` | Groups eval failures by the lead rules involved (markdown; mode blend by default) |

## Scoring (phase 6: double dummy decides)

Double dummy ranks the lead options by P(defeat) (IMP contexts, slams) or mean defence tricks (MP contexts). The textbook rules only reorder options that are within `noiseK` paired standard errors of the DD-best one. The old weighted blend is still available (`mode: "blend"`, driven by `data/lead-config.baseline.json`; in the UI, moving the weights slider switches to it). Details: `docs/phase6-dd-decides.md`.

### After a new `data/lead-rules.json`

Rule firings are recomputed from the cached problems, so only the calibration needs to run (the DD vectors in the cache stay valid):

```bash
npm run calibrate
```

A full re-evaluation (`npm run eval:calibrate`, about 40+ minutes on 8 cores) is needed only when the deals change (auction reading, system file, solver or seeds).

## Notes

- Local-only: no network at runtime, no analytics, no LLM calls.
- Do not push or deploy from this tree unless approved.
- `books/` on the Mac (if present) is reference material outside this app copy — leave it alone.
