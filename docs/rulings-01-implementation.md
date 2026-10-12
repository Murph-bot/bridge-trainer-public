# Rulings 01: how each point is implemented

Source of truth: `docs/rulings-01.md`. Nothing here adds bridge policy; where the ruling left a mechanical detail open, the choice made is listed.

## 1. AK-proof filter (`src/engine/dealer.ts`, `cashableSideAKSuits`)
A non-trump suit is rejected when the leader and partner together hold its A and K, the partner holds at least one of them, and in a suit contract declarer and dummy each hold >= 2 cards in it (notrump: lengths ignored). A suit where the leader alone holds A and K is skipped. `akProofApplies`: contract level >= 6 and (control bid or keycard ask in the auction, or the user marked the auction disciplined).

## 2. Control-bid test (`src/engine/controlbids.ts`, `controlCalls`)
Per partnership, in auction order. Counted: "cue" (fit side, suit not yet bid by that side and not trump, at the 4 level or higher; or at the 3 level when the fit is a major agreed at the 2 or 3 level and an earlier call of the side matched a `GF` system rule), "keycard-ask" (4NT after the fit), "king-ask" (5NT after a keycard ask), "queen-ask" (5-level suit by the asker after the reply), and the partner's next call after each ask ("reply"). Not counted: bids of the opponents' suit as such; any other 5-level suit after a keycard ask.
Mechanical choices: a fit is agreed by (a) support of a suit the partner bid naturally, (b) a 4-level jump to a new suit after the partner bid the final trump suit (splinter; needs the contract strain), (c) a matched system rule with `forcing: "GF"` whose `shows.len` gives 3+ in a suit the partner bid (GF raise, e.g. `resp.1S.3C`; needs the profiles, so `matchCalls` output is passed in). The responder's first suit bid over a 1NT/2NT opening is treated as artificial and never recorded. Without profiles only the 4-level-and-higher cues, asks and splinters are detected.

## 3. Constraints
Conflicting ranges become soft ranges (see `docs/rulings-01-expected-changes.md`). `data/tools/ref_constraints.py` mirrors the TS port, including the `hcpPlusLen`, `keycards`, `trumpQueen`, `kings` predicates.

## 4. Card choice
`rateLead` penalises a card only against the partnership table (`carding.cardChoiceTable`), never against `lead-card-choice.json`. Suit choice comes from the book rules and DD; a rule that recommends a suit credits every card of it. A rule that sets another card of the recommended suit against its recommendation (NT-023, NT-029, NT-045 ... any rule with a same-suit `preference_over`, or `technical: true` in the overlay) decides top-vs-low itself: it is scored card by card and the table does not penalise in that suit. DD scores the card actually led. Optional agreements `reverseAK` and `rusinow` (`lead-config.json` settings.optionalCarding, `AnalyseSettings.carding`) are off by default. 3rd/5th is not implemented (the spot to lead is not specified).

## 5/6. Holdings and per-scoring fields (`data/lead-rules-rulings-01.json`, `src/rules/machine.ts`)
`data/lead-rules.json` stays the untouched spec copy; an overlay by rule id supplies `machine` (suit / paired / longer / tip), `card` and `weight` (plain or `{IMP, MP}`) and `technical`. MP-007 is a `tip`: reported as a hit of kind `tip`, weight 0, never scored.

## 7. lead-config
`handStrength`: weakMaxHcp 6, strongMinHcp 10, `fewEntriesMax` 1 (replaces fewEntriesMaxHcp). Few entries is per led suit: aces + kings of Kx or longer outside it, 0 or 1 (`LeadContext.fewEntries`); the `few_entries` feature is evaluated per suit in `evaluateRules`. Bias entries B3, B4, B5 and the B1 Edef size carry `status: "proposal"`.
