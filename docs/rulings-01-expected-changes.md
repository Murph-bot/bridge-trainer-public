# Rulings 01: expected-output changes (for Bridge Matey re-approval)

Cause: rulings-01 section 3. Two changes to `data/tools/ref_constraints.py` (the arbiter), mirrored in `src/engine/constraints.ts`:

1. **Conflicting ranges become soft constraints.** When a new `shows` hcp or length range does not intersect the earlier hard range, the earlier hard value is kept (as before, with the conflict logged) and the new range is now recorded as the soft range (before: it was dropped and the soft range stayed at the earlier value). A deal outside the new soft range counts one violation (acceptance `softPenalty^violations`).
2. **Hand predicates the reference ignored are now enforced** when sampling: `hcpPlusLen`, `keycards` (aces + trump K), `trumpQueen`, `kings.oneOf`. These change sampling only, never the constraint summaries.

## Worked examples (`data/worked-examples.json`, 5 cases)

Constraint summaries (hard, soft, rules, unmatched, conflicts) of all five examples: **no change**.

Sampling block (informational, not compared by the golden tests; same seed):

| example | before | after |
|---|---|---|
| ex1-1NT-3NT | tried 34340, rate 0.01456 | unchanged |
| ex2-1S-2S-4S | tried 103809, rate 0.00482 | unchanged |
| ex3-competitive-1H-2C-2H-P-4H | tried 36876, rate 0.01356 | unchanged |
| ex4-1NT-Stayman-4H | tried 119788, rate 0.00417 | unchanged |
| ex5-weak2H-relay-same-system | tried 29585, rate 0.0169 | **tried 400912, rate 0.00125** (West's 2S relay needs HCP + hearts length >= 18; the old sampler ignored it) |

`data/worked-examples.json` was updated for the ex5 sampling line only.

## Differential (`src/engine/fixtures/ref-differential.json`, 400 auctions, `python3 scripts/gen_ref_differential.py 400`)

Same 400 auctions (deterministic generator, seed 5). **15 of 400 cases change**, 15 seat entries in all; every change is `soft.hcp` of a seat whose call conflicted with its earlier hard range (the `conflicts` list is identical before and after). All other 385 cases are byte-identical. The TS matcher reproduces all 400 (golden test `golden: differential against tools/ref_constraints.py`).

### Case 20: `P P P 1N X P` (dealer E, profiles {"N":"ss","E":"opps","S":"ss","W":"ss"})

- **E** — conflicts: ["vs1n.direct.X: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 27: `P P 1N P 4C P 4S P P P` (dealer S, profiles {"N":"opps","E":"opps","S":"opps","W":"ss"})

- **S** — conflicts: ["nt1.4C: hcp [16, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[16,37]`

### Case 54: `P 1D P P 2N P` (dealer W, profiles {"N":"opps","E":"ss","S":"opps","W":"ss"})

- **W** — conflicts: ["bal.1D.2N: hcp [20, 21] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[20,21]`

### Case 101: `P P P 3H P 3N P` (dealer S, profiles {"N":"ss","E":"ss","S":"opps","W":"ss"})

- **W** — conflicts: ["pre.3H.3N: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 106: `P P 1N P 4N P 6N` (dealer S, profiles {"N":"ss","E":"opps","S":"ss","W":"ss"})

- **S** — conflicts: ["nt1.4N: hcp [16, 17] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[16,17]`

### Case 113: `P P P 1N P 4C P 4S` (dealer S, profiles {"N":"ss","E":"opps","S":"opps","W":"opps"})

- **W** — conflicts: ["nt1.4C: hcp [16, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[16,37]`

### Case 200: `P P P 1D 1N` (dealer N, profiles {"N":"opps","E":"opps","S":"ss","W":"opps"})

- **N** — conflicts: ["ov.1D.1N: hcp [15, 18] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,18]`

### Case 224: `P P P 3S P 3N P` (dealer W, profiles {"N":"opps","E":"ss","S":"opps","W":"ss"})

- **N** — conflicts: ["pre.3S.3N: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 299: `P P 3S P 3N` (dealer N, profiles {"N":"opps","E":"ss","S":"opps","W":"ss"})

- **N** — conflicts: ["pre.3S.3N: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 303: `P P 3D P 4C P 4S P P` (dealer S, profiles {"N":"ss","E":"opps","S":"ss","W":"ss"})

- **S** — conflicts: ["pre.3D.4C: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 319: `P P P 3D 3N` (dealer W, profiles {"N":"ss","E":"ss","S":"ss","W":"ss"})

- **W** — conflicts: ["vs3.3D.3N: hcp [15, 22] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,22]`

### Case 320: `P P 2S P 2N P` (dealer E, profiles {"N":"ss","E":"opps","S":"ss","W":"opps"})

- **E** — conflicts: ["w2.2S.2N: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 333: `P P P 3H P 4C P 4S P` (dealer N, profiles {"N":"opps","E":"ss","S":"opps","W":"ss"})

- **E** — conflicts: ["pre.3H.4C: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`

### Case 335: `P P P 3S 3N P` (dealer S, profiles {"N":"opps","E":"ss","S":"opps","W":"ss"})

- **S** — conflicts: ["vs3.3S.3N: hcp [15, 22] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,22]`

### Case 378: `P P P 3H P 4C P 4D` (dealer W, profiles {"N":"ss","E":"opps","S":"opps","W":"ss"})

- **N** — conflicts: ["pre.3H.4C: hcp [15, 37] conflicts with [0, 13]; kept as soft only"]
  - `soft.hcp`: before `[0,12]` → after `[15,37]`
