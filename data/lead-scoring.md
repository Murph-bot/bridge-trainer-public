# Lead scoring

The user picks an opening lead (Αντάμ). The app returns a rating %, the probability of defeating the contract for that card and for the best card, the average defensive tricks, and a textbook verdict with citations. Everything runs locally: dealer → DDS → scorer. No runtime AI.

## 1. Inputs

- `deals[]`: N layouts from the dealer (`auction-to-constraints.md`), leader's hand fixed.
- `contract`: level, strain, declarer, `doubled` (0/1/2). `vulnerability`. `scoring` = `IMP` | `MP`.
- `userCard`.
- Rule sources, owned by the separate lead-books job (this spec does not define their schema): `lead-rules.json` + `lead-rules.schema.json` (textbook rules), `lead-card-choice.json` (book card-within-suit table), `lead-weights.md` (weights), `lead-test-problems.json` (known problems). The partnership's own card table is `system-stelios-sotos.json` → `carding.cardChoiceTable` (from the CC). It overrides the book table for the user's leads.

## 2. Double-dummy pass

For every deal, call DDS `SolveBoardPBN` once: leader on lead, empty trick, `target = -1`, `solutions = 3`, `mode = 1`. DDS returns a score for every legal card (cards it reports as equivalent get the same score; expand them). That gives `defTricks[i][c]` = tricks for the defence on deal `i` after lead `c`. One call per deal covers all 13 cards.

Per card `c` over N deals:

- `need = 8 − level` (tricks the defence needs to beat the contract).
- `Pdef(c) = mean_i [defTricks[i][c] ≥ need]`. Standard error `sqrt(Pdef(1−Pdef)/N)`.
- `Edef(c) = mean_i defTricks[i][c]`.
- `S[i][c]` = the defenders' duplicate score on deal `i` (standard scoring table with vulnerability and `doubled`).

## 3. DD component `sDD ∈ [0,1]`

Lead options = the leader's cards grouped by touching cards in the same suit (Q and J from QJ109 are one option). Use one representative per option for comparisons, but rate the exact card the user chose.

- **IMPs.** `best` = option with the highest mean `S`. `loss(c) = max(0, mean_i IMP(S[i][best] − S[i][c]))`, with the WBF IMP table. `sDD(c) = clamp(1 − loss(c) / L_IMP, 0, 1)`, `L_IMP = 3` IMPs.
- **Matchpoints.** `MP(c) = mean_i [ (#options d with S[i][c] > S[i][d]) + 0.5·(#options tied with c, excluding c) ] / (#options − 1)`. `loss(c) = MP(best) − MP(c)`. `sDD(c) = clamp(1 − loss(c) / L_MP, 0, 1)`, `L_MP = 0.25`.
- **Noise band.** Comparisons are paired (same deals for every card). If `loss(c) ≤ 2·SE_paired(c, best)` (std of per-deal differences / √N), treat `c` as equal best and set `sDD = 1`. Show "equal best within sampling noise".

Why both: at IMPs the defeat probability dominates (game and slam swings). At matchpoints every overtrick counts, so `Edef` matters even when the contract is cold. The UI always shows `Pdef` and `Edef` for the user's card and the best card, whatever the scoring.

## 4. Rules component `sR ∈ [0,1]`

Interface (rule format is owned by the books job): `evaluateLeadRules(ctx) → Array<{ruleId, target, weight, sign, source}>`, where `target` names a suit or a card class for the leader's hand, `sign` is +1 (recommend) or −1 (avoid), and `ctx` holds contract type (NT/suit), level, the auction features (which suits each player bid, doubles, artificial calls doubled, slam, sacrifice, Lightner) and the leader's holding per suit.

- `R(c) = Σ sign·weight` over rules whose target covers `c`.
- `sR(c) = (R(c) − min R) / (max R − min R)` over the lead options; `1` when all are equal.
- Card-within-suit check: compute the agreed card for that suit holding from `carding.cardChoiceTable` (partnership), falling back to `lead-card-choice.json`. If `userCard` ≠ agreed card and the DD scores of the two differ by less than the noise band, multiply `sR` by `cardPenalty = 0.8` and say "right suit, wrong card per your agreements (2nd/4th)". If DD shows a real difference, `sDD` already prices it.
- Partnership lead-directing agreements from the CC feed `ctx`: a lead-directing double of an artificial bid (Stayman, transfer) and Lightner doubles of slams. Advancer's redouble = A/K in partner's suit.

## 5. Rating

`rating% = round(100 · (wDD·sDD + wR·sR))`, defaults `wDD = 0.7`, `wR = 0.3`. Weights live in settings (slider). `lead-weights.md` may set the rule weights inside `sR`, and a different default split. If it does, it wins.

Show:

1. Rating %, with the two components side by side.
2. `Pdef` and `Edef` for the user's card vs the best option, plus the top 3 options.
3. Textbook verdict: matched rule ids with `source` (book + page).
4. Sample details: N deals, acceptance rate, relaxations, seed.

## 6. Known limits (show in an "about" panel)

- Double dummy plays perfectly on both sides after the lead. It does not credit leads that only gain when declarer misguesses. It does credit leads that need perfect follow-up defence. The 0.3 rules weight partly offsets this.
- Ratings are only as good as the constraints. Unmatched calls are read naturally and listed.
- With fewer than 200 deals, show the numbers greyed and say so.

## 7. Performance plan

- DDS in WebAssembly inside a worker pool (`navigator.hardwareConcurrency − 1` workers). Stream results: update the rating every 50 deals with its running SE. Stop early at 200 deals when the best option leads the user's card by more than 4 SE (configurable).
- Cache DD results by deal hash + contract in IndexedDB, so re-rating with other weights is instant.
