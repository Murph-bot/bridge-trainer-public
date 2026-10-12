# Auction → hand constraints → deals

Goal: turn a finished auction plus the leader's known hand into constraints on the three hidden hands, then deal 200–1000 random layouts that fit. The double-dummy solver and the scorer consume those layouts.

Reference implementation: `tools/ref_constraints.py` (Python, not production). It produced every example below (`examples/worked-examples.json`). The TypeScript port must reproduce the constraint sets exactly. Acceptance rates should agree within noise.

## 1. Inputs

- `auction`: calls from dealer, tokens `1C..7N`, `P`, `X`, `XX`.
- `dealer`, `vulnerability`, `scoring` (`IMP` | `MP`).
- `leader` seat and `leaderHand`.
- `profiles`: which system each seat uses. Default: the user's side = `system-stelios-sotos.json`; the declaring side = `opponents-default-2over1.json`. A UI switch "opponents play our system" sets all four to Stelios–Sotos.

## 2. Matching a call to a rule

For call `i` by seat `p` with prefix `auction[0..i-1]`:

1. Candidate rules = rules in `p`'s profile whose `context.auction` matches the prefix. `P*` (only as first token) matches zero or more leading passes; every other token must match exactly; the final `?` is the call being made.
2. Filter by `context.seats` (1 = dealer … 4) and `context.actorPassedHand` (true if `p` already passed in this auction).
3. Per call, keep the most specific rule. Specificity = number of concrete tokens, +1 if the pattern has no `P*`, +1 for `seats`, +1 for `actorPassedHand`. Ties break on higher `priority`.
4. The rule whose `call` equals the actual call is the **matched rule**. The other kept rules are its **siblings**.

## 3. What each call contributes

- **Positive**: the matched rule's `shows` is intersected into `p`'s constraints.
- **Negative (sibling negation)**: every sibling with `inferable: true`, non-empty `shows` and `priority` greater than the matched rule's priority goes into `p`'s soft `notAny` list. Meaning: "had the hand fitted that higher-priority call, the player would have made it." This one mechanism covers:
  - failure to open (pass rule priority 0 → denies every opening in that seat),
  - failure to respond or overcall (pass in `P* 1H ?` denies `1S`, `1N`, `X`, …),
  - limit bids as caps (2♠ raise denies the higher-priority 2NT / splinter / 4♠ hands),
  - choice between overlapping meanings (1♣ denies 1NT, 2NT and 2♣ hands).
  The same `priority` field drives the bidding engine later: choose the highest-priority rule whose `shows` the hand satisfies.
- **Pass with no sibling set** (an unmodelled context): contributes nothing.

### Hard vs soft

| Source | Hard (filter) | Soft (penalty) |
|---|---|---|
| `shows.hcp` | widened by `meta.constraintConventions.hcpSlack` (1: "not strict about HCP ranges") | exact range |
| `shows.len` | exact | exact |
| `shape`, `features`, `lenCmp`, `anyOf`, rule's own `notAny`, `keycards` | exact | |
| sibling negation | | each matched sibling counts 1 violation |
| fallback reading of unmatched calls | exact (they are already loose) | |

A deal passes when every hidden hand meets its hard constraints. It is then accepted with probability `softPenalty ^ violations` (default `softPenalty = 0.3`). Soft constraints therefore bend the sample without ever making a deal impossible.

### Intersection and conflicts

- `hcp`, `len[suit]`: interval intersection.
- Everything else: appended to an `all` list (conjunction). Evaluate lazily on the dealt hand.
- If an intersection becomes empty, keep the earlier hard value, record the new range as soft only, and log a `conflicts` entry. Show "auction inconsistent with system, constraints relaxed" in the UI. Never fail the problem.

### Unmatched calls: widen gracefully

No rule for a call → natural fallback (`fallback()` in the reference):

- `P`, `X`, `XX` → nothing.
- NT up to 3NT → semibalanced; 4NT+ → nothing.
- Suit bid in partner's suit → 3+ in that suit (raise).
- Suit bid in own previously bid suit → nothing new.
- New suit → 4+ at the 1-level, 5+ higher.

Every unmatched call is listed in `unmatched` so the UI can show "no system rule for 4♥ by North; read naturally".

### Opponents' unknown system

Use `opponents-default-2over1.json`: standard 2/1, 1NT 15–17, weak twos 6 cards 5–10, Jacoby 2NT, splinters, Michaels/Unusual 2NT, RKCB 1430, natural defence to 1NT. All its rules are `default-assumed`.

### Constraint evaluation (hand predicates)

- HCP 4-3-2-1. Balanced = 4333/4432/5332; semibalanced adds 5422/6322.
- `single:X` = exactly 1 card, `void:X` = 0, `short:X` ≤ 1 (`any` = in some suit). `noSingleton`.
- `stopper:X` = A, Kx+, Qxx+, or Jxxx+. `topHonor:X` = A or K.
- `goodSuit:X` = 2 of AKQ or 3 of AKQJ10. `solidSuit:X` = AKQ. `noTopHonors:X` = no A/K/Q.
- `hcpPlusLen {suit, min}` = HCP + length in that suit ≥ min (weak-two relay trigger).
- `keycards {trump, oneOf}` = aces + trump K; `trumpQueen`. `aces:0|4` for Gerber.
- `lenCmp [[a, op, b]]` with `>`, `>=`, `=`.

## 4. Dealer (deal generator)

1. **Known hand fixed.** Remove its 13 cards.
2. **Shape first.** For each hidden hand, enumerate suit-length vectors (s,h,d,c) allowed by its hard `len` ranges and shape flags. Sample one vector per hand, weighted by the number of card combinations (`C(remaining_s, s) · …`) so the shape distribution stays unbiased. Reject vector triples whose columns don't sum to the remaining suit lengths. This alone removes most of the rejection cost (shape constraints are the tight ones).
3. **Fill cards.** Shuffle each suit's remaining cards and deal them by the sampled lengths.
4. **Check** HCP, features, `all`, then the soft accept step.
5. **Targets.** Default 500 accepted deals; minimum 200 to show a rating; stop at 1000. Timeout 10 s (configurable). On timeout with < 200 deals: drop soft constraints, then widen `hcpSlack` to 2, then retry once. Report what was relaxed.
6. **Report** `accepted`, `tried`, `acceptanceRate`, `seconds`, `timedOut`, `relaxations[]`. Show acceptance rate in a "details" panel; under 0.05% warn "tight auction, sample may be biased".
7. Seeded RNG (e.g. a 32-bit PCG) so a problem is reproducible: same seed → same deals → same rating.

The reference uses plain shuffle-and-reject. Its acceptance rates (0.4–1.7% below) are the floor; shape-first dealing in TS should do far better.

## 5. Worked examples

Generated by `tools/ref_constraints.py` + `tools/render_examples.py`. The leader's seat is omitted (known hand). `hard` filters; `soft` penalises; `all` holds non-interval predicates; `notAnyFromSiblings` lists sibling rule ids whose `shows` the hand should not meet.

### ex1-1NT-3NT

Dealer N. Auction: `1N P 3N P P P`. Leader E holds QJ1095 ♠ K74 ♥ 852 ♦ 63 ♣. Profiles: N=opps, S=opps, E=ss, W=ss.

Uncontested NT game. North's 1NT denies 2♣/2NT hands (sibling negation). South's 3NT carries no 4-card major and denies Stayman, transfers, Gerber, Texas and quantitative 4NT. West's pass over 3NT has no rule in the user's system, so it adds nothing.

Sampling (reference, naive shuffle): 500 accepted of 34340 tried, acceptance 1.46%, 0.45 s.

```json
{
 "N": {
  "hard": {
   "hcp": [14, 18],
   "len": {},
   "all": [
    {
     "shape": "balanced"
    }
   ]
  },
  "soft": {
   "hcp": [15, 17],
   "len": {},
   "notAnyFromSiblings": ["open.2C", "open.2N"]
  },
  "rules": ["open.1N"],
  "unmatched": [
   {
    "index": 4,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "S": {
  "hard": {
   "hcp": [9, 16],
   "len": {"S": [0, 3], "H": [0, 3]}
  },
  "soft": {
   "hcp": [10, 15],
   "len": {"S": [0, 3], "H": [0, 3]},
   "notAnyFromSiblings": ["nt1.2C", "nt1.2D", "nt1.2H", "nt1.2S", "nt1.4C", "nt1.4D", "nt1.4H", "nt1.4N"]
  },
  "rules": ["nt1.3N"]
 },
 "W": {
  "hard": {
   "hcp": [0, 37],
   "len": {}
  },
  "soft": {
   "hcp": [0, 37],
   "len": {}
  },
  "rules": [],
  "unmatched": [
   {
    "index": 3,
    "call": "P",
    "fallback": {}
   }
  ]
 }
}
```

### ex2-1S-2S-4S

Dealer S. Auction: `1S P 2S P 4S P P P`. Leader W holds K73 ♠ AJ104 ♥ Q92 ♦ 853 ♣. Profiles: N=opps, S=opps, E=ss, W=ss.

North's simple raise (opponents' default: 6–10, 3–4 spades) is a cap: it denies the Jacoby 2NT, splinter and 4♠ hands. South's 4♠ rebid shows game values or shape.

Sampling (reference, naive shuffle): 500 accepted of 103809 tried, acceptance 0.48%, 1.65 s.

```json
{
 "N": {
  "hard": {
   "hcp": [5, 11],
   "len": {"S": [3, 4]}
  },
  "soft": {
   "hcp": [6, 10],
   "len": {"S": [3, 4]},
   "notAnyFromSiblings": ["resp.1S.4S", "resp.1S.2N", "resp.1S.3S", "resp.1S.4C", "resp.1S.4D", "resp.1S.4H"]
  },
  "rules": ["resp.1S.2S"],
  "unmatched": [
   {
    "index": 6,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "E": {
  "hard": {
   "hcp": [0, 37],
   "len": {}
  },
  "soft": {
   "hcp": [0, 37],
   "len": {}
  },
  "rules": [],
  "unmatched": [
   {
    "index": 3,
    "call": "P",
    "fallback": {}
   },
   {
    "index": 7,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "S": {
  "hard": {
   "hcp": [14, 23],
   "len": {"S": [5, 13]},
   "all": [
    {
     "lenCmp": [
      ["S", ">=", "H"],
      ["S", ">=", "D"],
      ["S", ">=", "C"]
     ]
    }
   ]
  },
  "soft": {
   "hcp": [15, 22],
   "len": {"S": [5, 13]},
   "notAnyFromSiblings": ["open.1N", "open.2C", "open.2N", "open.2D", "open.2H", "open.2S", "open.3S", "open.3H", "open.3D", "open.3C", "open.3N", "open.4S", "open.4H", "open.4D", "open.4C", "open.5C", "open.5D"]
  },
  "rules": ["open.1S", "rebid.1S2S.4S"]
 }
}
```

### ex3-competitive-1H-2C-2H-P-4H

Dealer N. Auction: `1H 2C 2H P 4H P P P`. Leader E holds Q4 ♠ 853 ♥ A6 ♦ AQJ1072 ♣. Profiles: N=opps, S=opps, E=ss, W=ss.

Competitive. The user (East) overcalled 2♣ and is on lead against 4♥. South's 2♥ matched `cr.1H.2C.raise` and denies the negative double and the cue-bid limit raise (soft). North's 4♥ is unmatched and read naturally (own suit, nothing new). West's pass after 2♥ is unmodelled, so it adds nothing.

Sampling (reference, naive shuffle): 500 accepted of 36876 tried, acceptance 1.36%, 0.47 s.

```json
{
 "N": {
  "hard": {
   "hcp": [10, 23],
   "len": {"H": [5, 13]},
   "all": [
    {
     "lenCmp": [
      ["H", ">", "S"],
      ["H", ">=", "D"],
      ["H", ">=", "C"]
     ]
    }
   ]
  },
  "soft": {
   "hcp": [11, 22],
   "len": {"H": [5, 13]},
   "notAnyFromSiblings": ["open.1S", "open.1N", "open.2C", "open.2N", "open.2D", "open.2H", "open.2S", "open.3S", "open.3H", "open.3D", "open.3C", "open.3N", "open.4S", "open.4H", "open.4D", "open.4C", "open.5C", "open.5D"]
  },
  "rules": ["open.1H"],
  "unmatched": [
   {
    "index": 4,
    "call": "4H",
    "fallback": {}
   }
  ]
 },
 "S": {
  "hard": {
   "hcp": [5, 11],
   "len": {"H": [3, 13]}
  },
  "soft": {
   "hcp": [6, 10],
   "len": {"H": [3, 13]},
   "notAnyFromSiblings": ["cr.1H.2C.X", "cr.1H.2C.cue"]
  },
  "rules": ["cr.1H.2C.raise"],
  "unmatched": [
   {
    "index": 6,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "W": {
  "hard": {
   "hcp": [0, 37],
   "len": {}
  },
  "soft": {
   "hcp": [0, 37],
   "len": {}
  },
  "rules": [],
  "unmatched": [
   {
    "index": 3,
    "call": "P",
    "fallback": {}
   },
   {
    "index": 7,
    "call": "P",
    "fallback": {}
   }
  ]
 }
}
```

### ex4-1NT-Stayman-4H

Dealer W. Auction: `P 1N P 2C P 2H P 4H P P P`. Leader W holds Q1083 ♠ 942 ♥ KJ5 ♦ A62 ♣. Profiles: N=opps, S=opps, E=ss, W=ss.

Stayman auction. North's 1NT then 2♥ = 4+♥. South's 2♣ keeps the Stayman disjunction. South's 4♥ is unmatched and read as a raise of partner's suit (3+♥). East's direct pass over 1NT matched the user's own `vs1n.direct.P` and denies the user's defence-to-1NT calls.

Sampling (reference, naive shuffle): 500 accepted of 119788 tried, acceptance 0.42%, 1.43 s.

```json
{
 "N": {
  "hard": {
   "hcp": [14, 18],
   "len": {"H": [4, 13]},
   "all": [
    {
     "shape": "balanced"
    }
   ]
  },
  "soft": {
   "hcp": [15, 17],
   "len": {"H": [4, 13]},
   "notAnyFromSiblings": ["open.2C", "open.2N"]
  },
  "rules": ["open.1N", "nt1.2C.2H"],
  "unmatched": [
   {
    "index": 9,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "E": {
  "hard": {
   "hcp": [0, 15],
   "len": {}
  },
  "soft": {
   "hcp": [0, 14],
   "len": {},
   "notAnyFromSiblings": ["vs1n.direct.X", "vs1n.direct.2C", "vs1n.direct.2D", "vs1n.direct.2H", "vs1n.direct.2S", "vs1n.direct.2N", "vs1n.direct.3C", "vs1n.direct.3D"]
  },
  "rules": ["vs1n.direct.P"],
  "unmatched": [
   {
    "index": 6,
    "call": "P",
    "fallback": {}
   },
   {
    "index": 10,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "S": {
  "hard": {
   "hcp": [0, 37],
   "len": {"H": [3, 13]},
   "all": [
    {
     "anyOf": [
      {
       "hcp": [8, 37],
       "anyOf": [
        {
         "len": {"H": [4, 13]}
        },
        {
         "len": {"S": [4, 13]}
        }
       ]
      },
      {
       "hcp": [0, 7],
       "len": {"S": [4, 5], "H": [4, 5], "C": [0, 1]}
      }
     ]
    }
   ]
  },
  "soft": {
   "hcp": [0, 37],
   "len": {"H": [3, 13]},
   "notAnyFromSiblings": ["nt1.2D", "nt1.2H", "nt1.2S", "nt1.4D", "nt1.4H"]
  },
  "rules": ["nt1.2C"],
  "unmatched": [
   {
    "index": 7,
    "call": "4H",
    "fallback": {
     "len": {"H": [3, 13]}
    }
   }
  ]
 }
}
```

### ex5-weak2H-relay-same-system

Dealer E. Auction: `2H P 2S P 3D P 4H P P P`. Leader S holds AQ5 ♠ 7 ♥ KJ1084 ♦ Q963 ♣. Profiles: N=ss, S=ss, E=ss, W=ss.

Option 'opponents play our system'. East's 1st-seat 2♥ = 5+♥ 6–11; the relay answer 3♦ = step 3 = minimum with 6♥. West's 2♠ relay needs HCP + heart length ≥ 18 and denies PMKC (soft). West's 4♥ is read as a raise.

Sampling (reference, naive shuffle): 500 accepted of 29585 tried, acceptance 1.69%, 0.51 s.

```json
{
 "N": {
  "hard": {
   "hcp": [0, 37],
   "len": {}
  },
  "soft": {
   "hcp": [0, 37],
   "len": {}
  },
  "rules": [],
  "unmatched": [
   {
    "index": 3,
    "call": "P",
    "fallback": {}
   },
   {
    "index": 7,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "E": {
  "hard": {
   "hcp": [5, 9],
   "len": {"H": [6, 6]},
   "all": [
    {
     "notAny": [
      {
       "len": {"S": [5, 13]}
      }
     ]
    }
   ]
  },
  "soft": {
   "hcp": [6, 8],
   "len": {"H": [6, 6]},
   "notAnyFromSiblings": ["open.1N", "open.2C", "open.2N", "w2.2H.relay.step5", "w2.2H.relay.4C", "w2.2H.relay.4D"]
  },
  "rules": ["open.2H.seat12", "w2.2H.relay.step3"],
  "unmatched": [
   {
    "index": 8,
    "call": "P",
    "fallback": {}
   }
  ]
 },
 "W": {
  "hard": {
   "hcp": [0, 37],
   "len": {"H": [3, 13]},
   "all": [
    {
     "hcpPlusLen": {
      "suit": "H",
      "min": 18
     }
    }
   ]
  },
  "soft": {
   "hcp": [0, 37],
   "len": {"H": [3, 13]},
   "notAnyFromSiblings": ["w2.2H.4C"]
  },
  "rules": ["w2.2H.relay"],
  "unmatched": [
   {
    "index": 6,
    "call": "4H",
    "fallback": {
     "len": {"H": [3, 13]}
    }
   }
  ]
 }
}
```
