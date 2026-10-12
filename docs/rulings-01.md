# Bridge Matey rulings 01 (2026-10-04, 05:00 Athens)

Authoritative answers to the 7 open points from phase 1–2. Bridge Matey owns all bridge logic.

## 1. AK-proof filter
Reject a deal when ALL hold:
- The defenders (leader + partner, combined) hold A and K of some non-trump suit.
- Suit contract: declarer AND dummy each hold ≥2 cards in that suit (0–1 means the second round is ruffed, nothing cashes). NT: lengths don't matter.
- Partner holds at least one of the A/K. If the leader alone holds both, they're fixed in the problem hand, so skip that suit (otherwise every deal is rejected).
- Applies only when the contract is a small or grand slam AND the auction contains a control bid or keycard ask (see 2). Other slams use the book's "all slams" set.

## 2. Control-bid test (slam tries only)
Count as control bids:
- After a trump fit is agreed (explicitly, or implicitly via GF raise or splinter): a new-suit bid by the fit side above 3NT.
- Below 3NT: a new suit at the 3 level after a major fit agreed at the 2 or 3 level in a GF auction.
- 4NT keycard ask, 5NT king ask, queen ask, and their replies.
REMOVE: "bid of opponents' suit" (Michaels, unassuming cue raise and western cue are not control bids).
REMOVE: "any 5-level+ suit after 4NT". The keycard replies are counted via the ask; a 5-level suit after the replies counts only as a K/Q ask or an ask with a void.

## 3. Constraints: follow the spec
- The TS port is right to enforce hcpPlusLen, keycards, trumpQueen and kings.
- Conflicting ranges become SOFT constraints with softPenalty, per the spec.
- Update tools/ref_constraints.py to match, rerun the 5 worked examples plus the 400-auction differential, and send Bridge Matey any changed expected outputs for re-approval.

## 4. Card choice: the partnership table wins when the user is leading
- A vs K from AK, T from KJTx, 2nd highest from xxx/xxxx/Txxx, and T9xx/98xx/JTxx/Kxxxx are signalling agreements. A different card gets cardPenalty only vs the CC, never vs the book.
- Suit choice comes from book rules + DD.
- Exception: book rules on top vs low as a technical choice still apply (e.g. NT-023 AKxxxx no entry: low at IMPs; NT-029 AQJxx).
- The DD part always scores the card actually led.
- Reverse AK, Rusinow and 3rd/5th: OFF by default, optional settings only.
- G-LEAD-1/4 are still open, so keep the table as data.

## 5. Machine-readable holdings
- NT-001: two equal-length suits, one major and one minor, same honour mask (A/K/Q/J/T present) or HCP within 1. Prefer the major.
- NT-008: a minor of 5+ with K and J, no A or Q, and 2+ aces outside it. Lead 4th best.
- NT-019: 5+ suit headed by the Q (no A/K) and 1+ ace outside it. Lead 4th best.
- NT-023: 6+ suit with A and K, no Q, and no A/K outside it.
- NT-034: exactly AQxx (A, Q, no K, length 4) in both ♥ and ♠. Cash an ace.
- NT-045: a major of 5+ with A, Q and J, being the major declarer showed in the Stayman reply (auction feature stayman_major_shown == that suit). Lead low.
- NT-067: 6+ suit headed by KQJT in dummy's opened suit, no A/K outside it. NEGATIVE rule: avoid that suit.
- NT-101: compare suits with no honour above J. Prefer the longer; on equal length use the normal rules.
- MP-007: UI tip only, weight 0 (author advice, too vague to score).

## 6. Per-scoring fields (card.IMP/card.MP, weight.IMP/weight.MP)
- NT-005: doubleton beats the minor at MPs; tie at IMPs (weight.IMP = 0).
- NT-023: IMPs low, MPs top.
- NT-025: IMPs Q or 4th best both accepted with no penalty; MPs prefer Q.
- NT-029: IMPs low, MPs Q.
- NT-077: sequence preferred at MPs; IMPs half weight.

## 7. lead-config
- Keep weakMaxHcp 6 and strongMinHcp 10.
- Replace fewEntriesMaxHcp with an entry count: the leader's aces + kings outside the led suit (K counts only as Kx or longer). Few entries = 0 or 1.
- Mark the rest of the config approved, except bias sizes labelled "proposal", which stay proposals.

## Reporting
Send the full-eval disagreements to Bridge Matey grouped by rule id.
