# bridge-trainer v1 — opening-lead trainer (brief for the coding agent)

Local-only Vite + TypeScript web app. The user gets a hand + finished auction (typed or random), picks an opening lead,
and sees a rating %, P(defeat) and an explanation (Greek default, English toggle).

## Hard rules
- No network calls at runtime, no LLM calls, no analytics. Everything deterministic given a seed.
- Never `git push`, never deploy. Commit locally with clear messages after each verified unit.
- All bridge rules are data-driven: read them from `data/*.json` (copies of the spec). Changing a rule = swapping a file. No rule content hard-coded in TS beyond generic algorithms.
- Spec docs live in `data/` (README.md is authoritative for module contracts + 12 acceptance tests; auction-to-constraints.md, lead-scoring.md, lead-weights.md, gaps.md; `data/tools/ref_constraints.py` is the Python reference to port).
- Precedence: `lead-weights.md` weights win over the 0.7/0.3 split in lead-scoring.md. The partnership `carding.cardChoiceTable` in `system-stelios-sotos.json` overrides `lead-card-choice.json`.
- i18n: labels from `data/i18n-glossary.json`. Honors = ονέρ, overcall = Παρεμβολή/Παρεμβολές. Never use τιμές or Αντιμπίντ.
- Node 24 lives at ~/.local/opt/node24/bin (prepend to PATH). Tests: vitest. Typecheck: `npx tsc --noEmit`.
- Do not touch anything outside this app directory.

## Solver
- `bridge-dds` 1.4.0 (pinned). `dist/api.js` imports `./lib/dds` without extension → breaks plain Node ESM. Vite is fine. For Node/vitest, alias it (vitest `resolve.alias` or an esbuild bundle). Reference benchmark code using it: /tmp/ddseval/{common.mjs,worker.mjs,bench5.mjs,web/} and /home/box/grokbot-workspace/bridge-trainer/DDS-EVAL.md.
- One `SolveBoardPBN({trump, first, currentTrickSuit:[0,0,0], currentTrickRank:[0,0,0], remainCards: pbn}, -1, 3, 0)` per deal gives tricks for every lead; expand `equals` bitmask (bit r = rank r) to touching cards.
- Defeat-only mode: target = tricks to set, solutions = 2.
- Browser: module Web Workers, pool of 4 by default. Node (eval/tests): worker_threads using the same pure solve core.

## Defaults
~250 deals per problem, progressive UI update every ~25 deals, 4 workers, "Refine" button → 1000 deals. Dealer timeout 10 s. hcpSlack from system meta. softPenalty 0.3, L_IMP 3, L_MP 0.25, cardPenalty 0.8.

## Extra requirement
AK-proof filter (lead-weights.md B7, rules SU-082/SU-083): for slam contracts whose auction contains cue bids (or user marks "disciplined"), the dealer rejects deals where the defence has a cashable side-suit A-K (one defender holds both A and K of a non-trump suit... implement per spec text; document the exact definition used).

## Code style
Small pure modules, typed data shapes first (Seat, Card, Call, Hand, Deal, ConstraintSet...). Parse JSON at the boundary. No comments that restate code. Tests assert literal expected values.
