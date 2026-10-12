# Phase 6 results (2026-10-04)

Full 771-problem eval: `npm run eval:leads -- --cap 500 --workers 7 --out .eval-out/p6-full/leads.json` (adaptive 200 +100 up to 500 deals, seed 1).
Run in two parts (resumable): 40 problems with 3 workers (573 s, while another job held the CPU), then 731 with 7 workers (3097 s), 0 failures.
The first 40 problems were evaluated with the phase-5 bundle; that changes only the `leads.json` records, because the DD cache does not depend on the rules
and calibration recomputes every mode from the cache with the current `data/lead-rules.json`.

Deals per problem: mean 402, min 200, max 500. Mean 29.9 s per problem (median 23.0 s, p90 60.7 s) per worker.

Rules: Bridge Matey's tuned `data/lead-rules.json` (15 weight-0 rules = advice-only, excluded from every mode; old copy `data/lead-rules.phase5.json`).
Calibration: `npm run calibrate -- --cache .eval-out/p6-full/leads.calib-cache.json` (36.6 s). Fitted values are in `data/lead-config.json` `tieBreak`; full report in `docs/phase6-calibration-report.md`.
Split: trailing id integer odd = fit (411), even = held-out report (360).

## Held-out (even ids, n = 360)

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| blend, phase-5 rules | 59.7% | 81.1% | 52.2% | 77.5% |
| blend, tuned rules | 65.8% | 88.3% | 57.5% | 82.8% |
| DD-only (Pdef IMP / tricks MP) | 76.9% | 95.3% | 75.3% | 93.1% |
| rules-only, tuned rules | 56.9% | 81.1% | 49.4% | 76.1% |
| new, phase-5 rules | 78.1% | 95.0% | 76.4% | 93.3% |
| **new, tuned rules** | **78.6%** | **95.0%** | **76.4%** | **93.3%** |

Phase-5 rules row: same cache, calibrated from a worktree at 672f39c with `--no-write`.

## IMP metric: expected duplicate score in IMPs (2026-10-05, Bridge Matey's decisions)

1. At IMPs the new scheme (and the `dd` mode) ranks leads by the expected duplicate score converted to IMPs, in every context: per deal, IMPs of the option's
   defence score against the option with the best mean score (the phase-5 `ddScore` logic). P(defeat) stays a displayed statistic (lead table, explanation).
   MPs are unchanged (mean tricks; P(defeat) in grand slams). Defeat-only mode still decides by P(defeat) (it has no exact trick counts).
2. Noise margin: the same `noiseK` (1.5) for the tie-break and for adaptive sampling; at IMPs the gap and its paired SE are computed on the IMP series, in IMPs
   (`buildDecisionInput` -> `topTwoUnresolved`; unit test in `src/scoring/rate-new.test.ts`). No separate margin.
3. ±1 rule votes unchanged.
4. Rating scale in `data/lead-config.json` `tieBreak.lossScale` (with a `doc` field): Pdef 0.25, Edef 0.5, **IMP 3** (IMP equivalent of 0.25 P(defeat): a game
   set instead of made swings about 10-13 IMPs; also the phase-5 L_IMP). No default in the code: the parser rejects a tieBreak section without all three.
5. NT-032 stays advice-only (weight 0), no card-table row (no change).

Calibration rerun from the same cache (`npm run calibrate -- --cache .eval-out/p6-full/leads.calib-cache.json`, 35.4 s, no new DD); the cache already
stores every option's per-deal tricks plus contract and vulnerability, which is all the duplicate scores need. Refit: noiseK 1.5, family nt 1 (mpd, suit 0),
own weights NT-011 1, NT-012 0, NT-024 2, NT-050 1, NT-065 0.5; bias B4 now kept (CV gain +1), B1/B3/B5 off. Full report `docs/phase6-calibration-report.md`
(previous one: `docs/phase6-calibration-report.pdef-imp.md`).

Held-out (even ids, n = 360):

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| new, before (P(defeat) at IMPs) | 78.6% | 95.0% | 76.4% | 93.3% |
| **new, IMP score at IMPs** | **80.0%** | **95.3%** | **75.6%** | **93.3%** |
| DD-only, before (P(defeat) at IMPs) | 76.9% | 95.3% | 75.3% | 93.1% |
| DD-only, IMP score at IMPs | 78.6% | 94.4% | 75.3% | 93.1% |
| DD-only by score (phase 5 `ddScore`) | 78.1% | 94.4% | 67.2% | 81.7% |

MPs use the same metric as before; the MP change (275 -> 272 top-1) comes from the refit (one set of weights for IMP and MP items pooled, and B4 now on).

## Per-scoring-form weights (2026-10-05, Bridge Matey)

lossScale IMP = 3 confirmed (no longer a proposal). IMP and MP are now fitted separately (own family/rule weights, own DD bias decisions, shared noiseK 1.5);
every keep/drop decision, including separate-vs-joint per form and B4, uses cross-validation inside the odd ids only (method: `docs/phase6-dd-decides.md` section 4,
"Per scoring form"). Rerun from the same cache: `npm run calibrate -- --cache .eval-out/p6-full/leads.calib-cache.json` (57 s).

| form | outer CV on odd ids, joint | separate | used | weights used | B4 |
|---|---|---|---|---|---|
| IMP | 314/411 | 314/411 (tie) | joint | nt 1 (mpd, suit 0); NT-011 1, NT-012 0, NT-024 2, NT-050 1, NT-065 0.5 | on (joint decision; the separate IMP fit also kept it, CV gain +2) |
| MP | 300/411 | 301/411 | separate | nt 1 (mpd, suit 0); NT-011 0.5, NT-050 1, NT-065 0.5; NT-012 and NT-024 dropped | off (CV gain 0) |

The separate IMP fit (not used) had nt 1, NT-028 0.25, NT-053 1, NT-097 0.5. B1, B3, B5 are off in both forms.

Held-out (even ids, n = 360), reported once:

| | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| 99bb16c (joint weights) | 80.0% | 95.3% | 75.6% | 93.3% |
| **per-form weights** | **80.0%** (288) | **95.3%** (343) | **75.8%** (273) | **93.3%** (336) |
