# Phase 6: double dummy decides, rules break near-ties

Why: on the lead test set at IMPs, DD-only ranking beat both the phase-5 blend and rules-only ranking clearly. The hand-set rule weights hurt, so the scheme was inverted: double dummy decides, the rules only reorder options that DD cannot separate.

Nothing outside this app directory was touched. Nothing was pushed.

## 1. The scheme (`src/scoring/decide.ts`, `src/scoring/rate-new.ts`)

Everything in `decide.ts` is pure and DD-free: it works on per-option summary statistics. The live scorer, the evaluation, the adaptive-sampling test and the offline calibration all call the same functions.

**Metric** (`decidingMetric` in `src/lead/config.ts`; changed after phase 6). At IMP scoring, in every context, the deciding metric is the expected duplicate score converted to IMPs (Bridge Matey's decision 1; it reuses the phase-5 `ddScore` logic): the reference is the option with the highest mean duplicate score of the defence (ties: higher P(defeat), then the first), and option `o`'s per-deal series is `IMPs(score_o - score_ref)` with the config's `impTable`, so its mean is minus the expected IMP loss against the reference. At MP scoring the `weights` table of the config decides as before (mean defence tricks; P(defeat) in grand slams). Defeat-only mode knows only which leads set the contract and always decides by P(defeat). P(defeat) stays a displayed statistic at IMPs (the lead table and the explanation). For P(defeat) or tricks the series is the per-deal 0/1 defeat (tricks >= 8 - level) or the per-deal defence tricks.

**Bias corrections B1..B5** are subtracted from the option's mean in metric units (`pdefPoints / 100` or `edefTricks`), exactly as in phase 5. For the IMP metric a bias of `p` points moves that share of the option's defeating deals to the "contract made" score (the phase-5 rule) and the amount is the resulting drop of the option's mean IMPs. They are treated like rules: calibration keeps one only if it improves held-out accuracy (section 4). `tieBreak.biasOff` lists the ones switched off.

**Noise set.** `b` is the DD-best option (highest corrected value; exact ties go to the option with the higher other metric, then to the first). For every other option `o`:

- `g = value(b) - value(o)`,
- `SE(g)` = standard error of the *paired* per-deal difference series `x_b - x_o` (same deals), `sqrt(var(d) / n)`,
- `o` is within noise iff `g <= noiseK * SE(g)`. `noiseK` is `tieBreak.noiseK` (default 1.5). With `noiseK = 0` only exact ties are in the set.

**Tie-break.** Inside the noise set only:

```
score(o) = value(o) + sigma * sum over firing rules r of  w_r * s_r(o)
```

- `s_r(o)` is the rule's signed recommendation for the option: +1 for each hit of rule `r` that recommends a card of the option (a suit-wide recommendation covers every card of the suit), -1 for each hit that avoids one. The book's own weights (0.25-0.9) and the 0.6 evidence factor are not used any more: they are exactly the hand-set numbers that hurt. Tips (weight 0 advice) are ignored.
- `w_r = tieBreak.weights[r]` if the rule has its own weight, else `tieBreak.familyWeights[source.book_key]` (nt / suit / mpd); rules in `tieBreak.dropped` count 0.
- **Scale.** `sigma` is the median over the other options of `SE(g)` (only those with SE > 0), floored at `0.2 / sqrt(n)` (times `lossScale.IMP / lossScale.Pdef` = 12 for the IMP metric, its size of one unit of P(defeat)) so that exactly tied options (SE = 0) still obey a rule. So a weight is in units of "typical paired standard error of this problem": weight 1 lets a rule lift an option that trails by about one standard error over its rival. It is independent of the number of deals, the metric and the context, which is why one weight can serve all of them.

**Ranking.** The noise set ordered by score (ties by value), followed by all other options by value. An option outside the noise set can therefore never rank above any option of the set, in particular never above the DD-best. Two unit tests in `src/scoring/decide.test.ts` prove it: a rule with weight 1e9 cannot overrule a clear DD winner (the option is outside the set and its rule term is 0), and a rule with weight 1 reorders a near-tie whereas weight 0.5 or `noiseK = 1` does not.

**Rating %** (`ratings()` in `decide.ts`). For each option: `loss = max(0, score(top) - own)` where `own` is its score inside the noise set and its plain value outside; `rating = round(100 * clamp(1 - loss / lossScale))`, then made non-increasing along the ranking. `lossScale` is `tieBreak.lossScale` in `data/lead-config.json` (P(defeat) 0.25, tricks 0.5, IMPs 3; its `doc` field explains them): set by Bridge Matey (IMP 3 confirmed 2026-10-05), not fitted. There is no default in the code: the parser rejects a `tieBreak` section without all three, and `ratings()` rejects a missing scale. IMP 3 is the IMP equivalent of 0.25 P(defeat) (a game set instead of made swings about 10-13 IMPs; a quarter of that is about 3) and equals the phase-5 `L_IMP`. The top of the ranking is always 100, so the rating, the "best lead" shown and the verdict agree by construction.

**Explanation.** Verdict keys (Greek and English, glossary terms; honours = ονέρ is not needed in these sentences, "τιμές" is never used):

- `explain.verdict.ddBest`: the lead is the DD-best.
- `explain.verdict.noiseRule`: within noise of the DD-best, "the book rules X decide in its favour".
- `explain.verdict.noiseBehind`: within noise of the top lead, which rules X prefer.
- `explain.verdict.noiseTie`: within noise, no rule separates them, the DD order puts the other first.
- `explain.verdict.close` / `worse` as before (outside noise; the split is rating 50).
- Notes `explain.note.adaptive` (deals were added) and `explain.note.capped` (still within noise at the cap).

The UI shows "decides the ranking" / "only near-ties" under the two component boxes and the scheme with its `k` in the sample details. The weights slider of phase 5 still works: moving it selects the legacy blend (the note under it says so), "Reset" returns to the new scheme.

**Modes (`src/eval/modes.ts`).** `blend` = phase-5 blend from `data/lead-config.baseline.json`; `dd` = the new metric ranking with no rules; `rules` = rules only (baseline machinery); `new` = the scheme above. A fifth mode `ddScore` is the phase-5 DD-only (mean duplicate score / MP fraction); it is kept because the new `dd` is a different definition (see open questions). The old blend reproduces the phase-5 eval exactly (checked on 12 problems against `../eval-0404/leads.json`: identical top lead and pass flag for blend, rules and, as `ddScore`, the old DD-only; the calibration test also recomputes every mode from the cache and compares it with the evaluation).

## 2. Adaptive sampling (`solveAdaptive`, `needsMoreDeals` in `src/lead/analyse.ts`)

Start at 200 deals (`adaptive.startDeals`). While the two best options by the metric are within noise (`g <= noiseK * SE(g)` with `noiseK` from the config; at IMPs `g` and `SE(g)` are in IMPs, from the same IMP series the ranking uses, and there is no separate margin) and deals < cap, add `adaptive.step` = 100 deals (chunks of 25, the same chunk seeds, so the result does not depend on where it stopped). `adaptive.cap` defaults to 1000 (configurable; 500-1000 is the intended range). A pair whose difference series has zero variance (SE = 0) counts as resolved, otherwise exactly equivalent leads would always run to the cap.

- The UI starts with 200 and refines the same way; the "Refine (1000 deals)" button still works and is shown while fewer than 1000 deals were used. Switching IMP/MP re-rates the cached deals and, if the other metric's top two are within noise, adds deals.
- The eval uses one deal sample for IMP and MP and continues while either scoring's top two are within noise. `deals` in each record is the number used. `--deals N` gives a fixed sample (also used by the tests); `--start/--step/--cap` override the config.
- A timed-out dealer stops the loop.

## 3. Calibration cache (`.eval-out/calib-cache.json`, git-ignored)

`npm run eval:leads` writes one entry per problem next to the usual records (resumable like `leads.json`; a problem counts as done only when it is in both files):

| field | content |
|---|---|
| `id`, `book`, `hand`, `auction`, `dealer`, `vul`, `disciplined`, `leader` | problem inputs (the rules and contexts are recomputed from these) |
| `contract`, `contractType`, `levelClass`, `sacrifice`, `need` | contract context (`need` = defence tricks that beat it) |
| `accept` | `{IMP, MP}` accepted leads as in the problems file |
| `deals` | deals used (adaptive) |
| `options[]` | `cards`, `rep`, `tricks` (base64 of an Int8Array, one defence trick count per deal) and `defeat` (base64 bit array, tricks >= need) |
| `rules.IMP`, `rules.MP` | rules that fired, with their signed contribution per option (informational) |
| `biases[]` | each bias with its points and which options it applies to |
| `ms` | evaluation time of the problem |

The file header holds the sampling settings, the seed and the total evaluation seconds. About 1.5 KB per option and 1000 deals.

**Recomputing without DD** (`src/calib/rebuild.ts`). By default calibration rebuilds the problem from `hand / auction / dealer / vul`, derives the context and evaluates `data/lead-rules.json` and the rulings overlay as they are now, and reuses only the cached tricks. `--cached-rules` reuses the stored firings instead (a test checks that both agree when the rules did not change). The legacy modes are recomputed too: the cached option columns are expanded back into the per-deal table and given to the unchanged phase-5 rater.

## 4. Calibration (`npm run calibrate`, `src/calib/fit.ts`, `calibrate.ts`)

**Split.** Parity of the trailing integer of the id: `nt-x-q1` -> 1 -> odd -> FIT; `...-q2` -> even -> REPORT. The counts are printed first and written into the report. The even set is never used for any choice.

**Objective.** Top-1 accuracy on the odd problems, the IMP and the MP item of each problem pooled (one weight set for both scorings, so that the rules stay explainable and the parameter count stays small). Accepted = the cards of the top option are in `accept_imps` (IMP item) or `accept_mps` (MP item).

**Parameters.** `noiseK` from {0, 0.5, 1, 1.5, 2, 2.5, 3}; one weight per rule family (`book_key`: nt, suit, mpd) from {0, 0.25, 0.5, 1, 2, 4}; rules that fire on at least 8 odd problems also get their own weight from the same grid. Most of the 214 rules fire on a handful of problems at most, so they share the family weight.

**Fit.** Deterministic coordinate ascent on `correct - 0.001 * (sum of weights)`: for each `noiseK` the three family weights, three passes; the best `noiseK` (ties to the smaller); then the per-rule weights, two passes, each coordinate re-evaluating only the problems the rule fires on. The small penalty makes a weight that buys nothing fall back to 0 and breaks ties towards smaller `k` and weights.

**Drops by cross-validation inside the odd set.** 5 folds (position of the sorted problem id modulo 5). For each fold the parameters are fitted on the other four, then the held-out problems are scored with and without each component; the gain is summed over the folds:

- a rule is dropped (listed in `tieBreak.dropped`, weight 0) if it fires on some held-out problem and its gain is <= 0;
- a family is zeroed if its gain is <= 0 (its individually weighted rules are dropped with it);
- a bias is switched off (`biasOff`) if its gain is <= 0.

Then the final fit on all odd problems with those drops fixed. "Does not improve" includes "changes nothing", so with little data everything is dropped and the scheme is plain DD: that is the intended failure mode, not a bug. Rules that never fire on an odd problem are not tested; they inherit their family weight (hierarchical shrinkage). The report has a row "new, evidence-only rules" that zeroes them, to show what they contribute.

If no weight survives, `noiseK` is not identified by the rules and the previous value is kept (it also sets the adaptive-sampling test, and `k = 0` would switch adaptivity off).

**Per scoring form** (`chooseForms` in `src/calib/fit.ts`; added 2026-10-05). After the joint fit above, IMP and MP items are fitted separately, each with its own family and rule weights and its own DD bias decisions (B1..B5, by the same inner cross-validation, on that form's odd items only); `noiseK` stays the shared joint value (1.5), there is no second margin. Whether a form uses its separate fit or the joint one is decided by an outer 5-fold cross-validation on the odd ids: in each fold the whole joint procedure and the whole separate procedure are rerun on the other four folds and scored on the fold's items of that form; the separate fit is used only if it is strictly better, otherwise the form falls back to the joint weights. The even ids are only used for the final report. `tieBreak.byScoring.{IMP,MP}` holds the set each form uses (`fit`: "separate" or "joint"); the app picks it by scoring form (`tieBreakSet`, `paramsOf(config, rules, scoring)`), and a form without an entry uses the joint values.

**Output.** `data/lead-config.json` gets the section `tieBreak { noiseK, familyWeights, weights, dropped, biasOff, lossScale, byScoring, fittedAt, fitSplit, metrics }` (the rest of the file is untouched; `data/lead-config.baseline.json` is the phase-5 file the legacy blend reads; the parser accepts both, a file without `tieBreak` gets the defaults). The shipped values are unfitted (`fittedAt: null`, `noiseK` 1.5, family weights 0.25 as a placeholder prior) until `npm run calibrate` runs on the full cache. `.eval-out/calibration-report.md` (printed too) has: split counts, fitted values, the bias / family / rule tables with their cross-validated gains, dropped rules, even-id (held-out) and odd-id top-1 and top-3 at IMPs and MPs for blend, DD-only, rules-only, new and the extras, deals per problem and runtimes.

Runtime: the fit and the report take seconds (2 s for 80 problems including the legacy modes; expect about 20-30 s for the full test set, the legacy recomputation dominates; `--no-legacy` skips it).

**Commands.**

```bash
export PATH=$HOME/.local/opt/node24/bin:$PATH
npm run eval:calibrate          # eval (40+ min, 7 workers) then calibrate
npm run eval:leads              # eval only; writes .eval-out/leads.json and .eval-out/calib-cache.json
npm run calibrate               # calibration only, from the cache; rerun after a new data/lead-rules.json
```

## 5. Card within suit (`src/rules/carding.ts`)

The partnership `carding.cardChoiceTable` stays the source. Answers of Bridge Matey to the phase 5 questions:

- **a. Bare AK leads K only against suit contracts; against NT the previous behaviour returns (A, the generic doubleton row).** Generic fix, no list of holdings: a structural `singleton` / `doubleton` row yields to a later applicable row only when that row names the exact holding in honour letters *with the explicit length qualifier*, e.g. `AK (doubleton)`. `AK, AKx, AKxx` (NT row 6) has no qualifier, so against NT the doubleton row (top card) wins again for bare AK. NT AKx / AKxx -> K (row 6) and AKxxx+ -> A (row 5) are unchanged from HEAD. KQ, QJ doubletons are unchanged.
- **b. AKx(x) = AK plus one or more small cards:** AKx, AKxx, AKxxx, AKxxxx all lead the A in suit contracts (row 4 already read `AKx(x) (3+ cards)` that way; now covered by tests for every length).
- **c. 1C-1D-1H-1S-2S** (see section 6).
- **d. G-REBID-6** keeps its default.

Tests (`src/rules/rules.test.ts`): bare AK -> K vs suit, A vs NT; KQ -> K vs NT; `AKx`, `AKxx`, `AKxxx`, `AKxxxx` -> A (row 4) vs suit; the G-LEAD-1 table row `["AK", "NT"]` changed from K to A on purpose.

## 6. System overlay (`data/system-overrides.json`, `src/engine/overrides.ts`)

`data/system-stelios-sotos.json` stays a spec copy. The overlay is a small data file read by the constraint inference. Each rule: `{ id, afterRule, call, shows, meaning, source }`. It applies to a call that **no system rule matches**, made by the partner of the player whose previous call matched the rule `afterRule`; `shows` is an ordinary constraint set, and `hcp` is widened by the system's `hcpSlack` like any rule. The call is then not counted as unmatched and its id is recorded in `P.rules`. Generic enough for other "raise of the fourth suit" overrides: add an entry with the `fourth-suit.*` rule id and the call.

One entry: `override.fourth-suit-raise.1C1D1H1S2S`: after `1C-1D-1H-1S` (1S = fourth suit, F1) opener's `2S` shows 4+ spades and 11-14 HCP (soft 11-14, hard 10-15 with the slack). The mirror is in `data/tools/ref_constraints.py` (`OVERRIDES`, read from the same file; the spec copy is not edited). `scripts/gen_ref_differential.py` now forces three cases per overlay entry; the differential was regenerated (400 cases) and the TS port agrees. Tests in `src/engine/spec-sync.test.ts`: constraints for both opener seats (N and E) and, with `overrides: []`, the old natural reading (5+ spades, unmatched); the overlay does not fire after another auction.

## 7. Test expectation changes (nothing silent)

- The 12 acceptance tests and the 5 worked examples pass unchanged. No acceptance test's expected lead changed.
- `rules.test.ts` "G-LEAD-1": bare AK against NT: K -> A (Bridge Matey answer a).
- `spec-sync.test.ts`: the 1C-1D-1H-1S-2S test now expects the overlay reading; the old reading is asserted with `overrides: []`.
- `analyse.test.ts`: the default mode is now the new scheme, so the three tests that pin phase-5 numbers (weights object, golden `pct 70` for seed 7, slam weights) run with `mode: "blend"` and keep their expected values. New tests pin the new mode (determinism, DD-best and ranking, rating below 100 for a clearly worse lead, adaptive sampling).
- `eval.test.ts`: the fast subset now reads the `{record, calib}` output and checks all five modes plus the new `pass3` / `rank` fields.
- Eval records changed shape: `imp` / `mp` hold five modes with `pass3` and `rank`; `bookRank`, `ranking`, `pDef*` and `gap*` now refer to the new scheme; `deals` varies. `eval:group` takes an optional mode (default blend, so it still reads the old `leads.json`).
- `src/lead/data.ts` exports `BASELINE_CONFIG`; `Rulebook` has a `baseline` field.

## 8. Verification done in this session

- `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run smoke` (see the final message for counts).
- `npm run eval:leads -- --limit 40 --out .eval-out/p6-smoke.json` then `npm run calibrate -- --cache .eval-out/p6-smoke.calib-cache.json` ran end to end (the numbers on 40 problems mean nothing). The full 771 eval was not run, as instructed.
- On 80 problems at 100 deals (a trial, not a result): the fit found no rule family that helps held-out accuracy (38 odd problems are too few), so it kept `noiseK` and returned plain DD; at those sizes `new` equals `dd`.

## 9. Open questions

1. **The DD metric at IMPs.** *Resolved: Bridge Matey chose the expected duplicate score in IMPs (see the Metric paragraph).* The brief asked to rank by P(defeat) at IMPs and by mean tricks at MPs. In the 80-problem trial the phase-5 duplicate-score ranking (`ddScore`) did slightly better than P(defeat) at IMPs (73.8% vs 69.0% on 42 even problems) and much worse than Edef at MPs (52.4% vs 73.8%). That is far too small a sample to conclude anything, but the full eval prints all five modes side by side. If `ddScore` wins at IMPs, switching the IMP metric to the duplicate score is a one-line change in `buildDecisionInput` plus the noise series.
2. **Rule weights are signs only.** The book weights are ignored in the new scheme. If calibration keeps few rules, is that acceptable, or should the book weight (and the 0.6 evidence factor for MPD) be the prior and only a family multiplier be fitted?
3. **One k for two jobs.** `noiseK` sets both the rule tie-break and the adaptive-sampling test. If calibration ever returns a small `k`, adaptive sampling nearly stops. Should the adaptive test have its own `k` in `adaptive`?
4. **Rating scale.** `lossScale` (0.25 P(defeat), 0.5 tricks, 3 IMPs; in `data/lead-config.json`) is set by Bridge Matey (IMP 3 confirmed 2026-10-05); ratings inside the noise set drop with the rule term, so a near-tie can show 90-something rather than 100.
5. **Drops are strict.** A rule is dropped when it adds nothing on held-out problems, which includes rules whose effect is simply never visible in 385 problems. The "evidence-only" row in the report shows what the unobserved rules add on the even set; if they hurt, they could be zeroed instead of inheriting the family weight.
6. **Eval cost with adaptive sampling.** Measured on the 40-problem smoke run (7 workers): mean 660 deals per problem (min 200, max 1000), 100 s wall per problem, 629 s in total, against about 17 s per problem at the fixed 250 deals. Extrapolated, the full 771-problem eval takes roughly 2-3 hours instead of 32 minutes, because near-ties (a third of the problems) run to the cap. `--cap 500` roughly halves it; `--deals 250` restores the old cost (and a fixed sample).
