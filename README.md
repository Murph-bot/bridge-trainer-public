# bridge-trainer

Local opening-lead trainer (TypeScript + Vite). Greek UI by default, English toggle.

## Public snapshot: book content excluded

This repository is a clean public snapshot. The book test set and all book-derived lead data are **not included**:
`data/lead-test-problems.json` (book quiz and worked-example hands), `data/lead-books-summary.md`, `data/lead-weights.md`
and `data/lead-rules.phase5.json` are removed. `data/lead-rules.json` and `data/lead-card-choice.json` are small sample
files written for this snapshot (standard leading conventions, no book text, hands or statistics), and the rulings overlay
is filtered to match. Tests that need the full private data skip themselves (`src/test-support/book-data.ts`), and
`npm run eval:leads` / `npm run calibrate` need the excluded test set.

## Requirements

- Node.js 24+ (Mac target: 24.14)

## Start locally

```bash
cd /Users/sotirios/dev/bridge-trainer
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
