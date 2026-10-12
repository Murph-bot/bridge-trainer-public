# Phase 5: sync with the updated spec (2026-10-04 answers)

Source: `../spec/` (old copy `../spec.bak-0403`). Nothing outside this app directory was touched.

## Data copied into `data/`
`system-stelios-sotos.json` (863 -> 896 rules), `auction-to-constraints.md`, `gaps.md`, `i18n-glossary.json`, `tools/build_system.py`, `tools/validate.py`. `opponents-default-2over1.json` is byte-identical to the spec (checked with `cmp`). `python3 data/tools/validate.py` -> ALL OK.

Not overwritten:
- `data/tools/ref_constraints.py`: the spec copy is unchanged from the old one; the app copy keeps its rulings-01 edits and gains the fourth-suit handling below.
- `data/worked-examples.json`: the only spec difference is the sampling `seconds` text; the app copy keeps its rulings-01 edit. Constraint outputs are unchanged and the golden test passes 5/5.

## Engine
- `ruleKind(rule)` (`src/engine/types.ts`): `"fourth_suit"` for ids `fourth-suit.*`, else `"natural"`. The only place the id convention is read.
- A `fourth_suit` call infers nothing about the bid suit (the rules' `shows` is empty), keeps its `forcing` (`F1` or `GF`), and:
  - is ignored when a later unmatched call is read naturally (`fallback`): after 1C-1D-1H-1S, opener's 2S is not read as a raise of promised spades (new-suit fallback, 5+);
  - is never recorded as a suit bid or a cue by `controlCalls`; its `GF` still sets the game-forcing context. A later bid of that suit by the same side is therefore a fresh suit.
- `validateSystem` (TS port of `tools/validate.py`): a redouble after a forcing-pass X may follow an intervening pass (`double_side`).
- Weak twos, 3rd-seat light openings, 1M-3C shortness replies, 1NT-3x, 1NT-(X) runouts and 2NT 4H/4S need no code: they are rule data (tests in `src/engine/spec-sync.test.ts`).

## Card choice
`carding.cardChoiceTable` now has `AK (doubleton)` -> K (order 3) and `AKx(x) (3+ cards)` -> A (order 4).
- `holdingMatcher` understands the `(N+ cards)` suffix (the listed pattern, then any number of further cards, at least N cards).
- Row 2 (`doubleton` -> top) used to win for AK doubleton before row 3 was reached, so K never came out. Generic rule added to `tableCard`: a structural `singleton`/`doubleton` row yields to a later applicable row that names the exact holding in honour letters (`AK (doubleton)`, or `AK` in `AK, AKx, AKxx`). KQ, QJ etc. doubletons are unchanged (top card = the named card).
- Result: suit contracts AK -> K, AKx / AKxx / AKxxx.. -> A. Notrump: AK -> K (row 6, was A through row 2), AKx / AKxx -> K, AKxxx+ -> A (row 5). See question 1.

## Differential
`scripts/gen_ref_differential.py 400` regenerated: the first 33 cases are the 11 fourth-suit rule contexts three times each (random continuations, system ss everywhere), then random contexts as before. 400/400 agree between `ref_constraints.py` and the TS port. No intentional differences between the two.

## Tooling
`scripts/group-disagreements.mjs` did not run (imported a non-existent `matchRules`), so it was rewritten as `scripts/group-disagreements.ts` and wired as `npm run eval:group -- <leads.json> [out.md]`. It lists, for IMP-blend failures, the lead rules that recommended our top lead and those that penalised the book's lead, plus failures with no rule involved. Kept rather than deleted because the rule view is not in the eval summary.

## Intentional differences / judgements
- Fourth-suit kind is derived from the id prefix because the schema has no kind field. `category` is `responder-rebid`.
- After a fourth-suit bid, the fallback of a repeat of that suit is "new suit, 5+" in both ref and TS port.
- Only the 11 sequences in the spec are encoded; other fourth-suit sequences read as natural bids.

## Questions for Bridge Matey
1. Notrump, bare AK: the table's row 6 says K, but the generic doubleton row came first, so the old engine led the A. With the specificity rule it is K now. Intended?
2. Suit contracts, AKxxx (5+ cards): the spec says `AKx(x) (3+ cards)` -> A, which I read as all lengths. The pattern text only lists x(x); confirm 5+ cards also lead the A.
3. After a fourth-suit bid, what does opener's raise of the artificial suit mean (e.g. 1C-1D-1H-1S-2S)? Currently a natural 5+ new suit.
4. G-REBID-6 (1S-2m-2S-2NT natural GF, no 3-card support) is still an open item in the spec; the default is encoded.

## Follow-up (2026-10-04 15:28 Athens): 1NT-3x slam rules need 15+ HCP

Bridge Matey re-synced `system-stelios-sotos.json` (still 896 rules). Only `nt1.3{C,D,H,S}.slam` changed: `shows.hcp` [15, 37]
added. Copied into `data/`, `validate.py` ALL OK, differential regenerated (400 cases, TS agrees), test asserts shows.hcp
[15, 37] and the hard hcp [14, 37] after the 1-point hcpSlack.
