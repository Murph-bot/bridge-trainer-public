# Bridge trainer: bridge-logic spec (v1 = opening-lead trainer)

For Javier, coding a local-only TypeScript web app in this repository. The user gets a hand and a finished auction (typed in or random), picks an opening lead, and sees a rating % and P(defeat) from Monte Carlo deals solved double dummy. Later versions add bidding practice (the app bids for partner and opponents) and a bidding quiz (4 candidate bids rated 1–10). The system files are built to drive those too: the `priority` field picks a bid, `shows` describes it.

No cloud services, no runtime AI. Everything is deterministic given a seed.

## Files

| File | What it is | Owner |
|---|---|---|
| `system-stelios-sotos.json` | The user's partnership system as 863 rules + CC carding table. | this spec |
| `opponents-default-2over1.json` | Standard 2/1 for opponents whose system is unknown (662 rules, all `default-assumed`). | this spec |
| `system.schema.json` | JSON Schema (2020-12) for both system files. | this spec |
| `auction-to-constraints.md` | Matching calls to rules, negative inference, hard/soft constraints, the dealer, 5 worked examples. | this spec |
| `examples/worked-examples.json` | Expected constraint sets for the 5 examples (golden test data). | this spec |
| `lead-scoring.md` | DD + rules blend, formulas, defaults, IMP vs MP. | this spec |
| `gaps.md` | Open questions for Sotirios (IDs referenced from rule `notes`). | this spec |
| `i18n-glossary.json` | Greek/English UI terms with sources and a `verified` flag. | this spec |
| `tools/build_system.py` | Generates both system JSON files. Edit rules here, not in the JSON. | this spec |
| `tools/validate.py` | Parses every JSON file, checks the schema, ids, call legality, length sums. | this spec |
| `tools/ref_constraints.py` | Python reference of auction→constraints + naive sampler. Regenerates the examples. | this spec |
| `tools/render_examples.py` | Rewrites the examples section of `auction-to-constraints.md` from the JSON. | this spec |
| `lead-rules.json`, `lead-rules.schema.json`, `lead-card-choice.json`, `lead-weights.md`, `lead-books-summary.md`, `lead-test-problems.json` | Book-derived lead rules, card choice, weights and test problems. | separate lead-books job |

Rebuild and check: `python3 tools/build_system.py && python3 tools/validate.py && python3 tools/ref_constraints.py && python3 tools/render_examples.py` (needs `jsonschema`).

## Rule shape (summary; the schema is authoritative)

```ts
type Call = `${1|2|3|4|5|6|7}${"C"|"D"|"H"|"S"|"N"}` | "P" | "X" | "XX";
type Suit = "S" | "H" | "D" | "C";
interface ConstraintSet {
  hcp?: [number, number];
  len?: Partial<Record<Suit, [number, number]>>;
  shape?: "balanced" | "semibalanced" | "unbalanced" | "any";
  lenCmp?: [Suit, ">" | ">=" | "=", Suit][];
  features?: string[];            // single:S, void:any, short:H, stopper:D, goodSuit:S, solidSuit:H, noTopHonors:S, topHonor:C, noSingleton, aces:0|4
  hcpPlusLen?: { suit: Suit; min: number };
  keycards?: { trump: Suit; oneOf: number[] }; trumpQueen?: boolean;
  anyOf?: ConstraintSet[];        // disjunction
  notAny?: ConstraintSet[];       // must match none
}
interface Rule {
  id: string; category: string;
  context: { auction: string[]; seats?: number[]; actorPassedHand?: boolean; vul?: string }; // auction tokens end with "?", "P*" = leading passes
  call: Call; meaning: { en: string; el?: string }; shows: ConstraintSet;
  forcing: string; alertable: boolean; artificial: boolean;
  priority: number;               // higher wins among overlapping rules; also drives sibling negation
  inferable: boolean;
  source: { file: string; section: string };
  confidence: "source" | "source-interpreted" | "default-assumed";
  notes?: string;
}
```

## Module contracts

```ts
// 1. constraints
inferConstraints(input: { auction: Call[]; dealer: Seat; leader: Seat; profiles: Record<Seat, SystemFile> })
  : Record<Seat, { hard: Constraint; soft: SoftConstraint; rules: string[]; unmatched: Unmatched[]; conflicts: string[] }>;

// 2. dealer
deal(input: { known: { seat: Seat; cards: Card[] }; constraints: ...; target: number; max: number; timeoutMs: number; seed: number })
  : { deals: Deal[]; tried: number; acceptanceRate: number; timedOut: boolean; relaxations: string[] };

// 3. dd (worker pool around DDS)
solveLead(deal: Deal, contract: Contract, leader: Seat): Record<Card, number>; // defence tricks per legal card

// 4. scorer
rateLead(input: { deals: Deal[]; dd: Record<Card, number>[]; contract: Contract; vul: Vul; scoring: "IMP" | "MP";
                  userCard: Card; leaderHand: Card[]; ctx: LeadContext; weights: { dd: number; rules: number } })
  : { ratingPct: number; sDD: number; sR: number; pDefUser: number; pDefBest: number; eDefUser: number; eDefBest: number;
      top: { card: Card; pDef: number; eDef: number }[]; ruleHits: { ruleId: string; source: string }[]; equalBest: boolean };

// 5. UI: renders problem cards (Greek default, English toggle), labels from i18n-glossary.json
```

Pure functions everywhere except the worker pool. Seat = `"N"|"E"|"S"|"W"`. Card = rank + suit, `"TS"` for ♠10.

## DD solver (recommendation, not code)

- First choice: `bridge-dds` on npm (thin WASM wrapper over Bo Haglund / Soren Hein's DDS; exposes `SolveBoardPBN`, `CalcDDTablePBN`). Its README says to run it in a Web Worker because the calls block.
- Alternative: `@bridge-tools/dd` (WASM DDS wrapper, part of the `@bridge-tools` suite).
- Fallback: compile DDS yourself with Emscripten, following Graham Hazel's "Double-Dummy Analysis in a Web Browser" (2023).
- Use `SolveBoardPBN` with `solutions = 3` for the lead (one call per deal gives every card). Check licences before bundling. Pin the version.

## Acceptance tests Javier should write

1. **Schema.** Both system files validate against `system.schema.json`. Every rule's call is legal after its pattern (port `tools/validate.py`).
2. **Matcher.** `P* 1N P ?` matches `["1N","P"]` and `["P","P","1N","P"]` but not `["1N","X"]`. A rule with `actorPassedHand: true` beats a `P*` rule for the same call.
3. **Golden constraints.** For each item in `examples/worked-examples.json`, `inferConstraints` returns the same `hard`, `soft`, `rules` and `unmatched` (deep equal).
4. **Sibling negation.** After a `1C` opening, a 16-count 4-3-3-3 hand with 4♣ scores one soft violation (it matches `open.1N`). A 12-count 4-3-3-3 with 4♣ scores zero.
5. **Hand predicates.** Literal hands → `stopper:S` true for `Kx`, false for `Qx`. `goodSuit:H` true for `KQ987`. `balanced` false for 5422. `hcpPlusLen` 15 HCP + 3 hearts passes 18.
6. **Dealer.** Same seed gives identical deals. 1NT–3NT with a fixed leader hand reaches 500 deals in under 3 s on the Mac. Every accepted deal satisfies the hard constraints (property test over 1,000 deals).
7. **Impossible constraints.** Dealer N, `1N P 2D P 2H P 4H P P P`, leader East holding six hearts: responder shows 6+♥ and opener 2+♥, so 14+ hearts. The dealer must return `timedOut: true`, a non-empty `relaxations`, and the UI message, never hang.
8. **DD wiring.** A fixed full deal with a known DD result (e.g. compute once with the native DDS or BBO's handviewer and freeze it) gives the same per-card tricks.
9. **Scoring.** Hand-built 3-deal fixture: check `Pdef`, `Edef`, IMP loss and MP % by hand, and assert literal numbers.
10. **Known lead problems.** For each item in `lead-test-problems.json` (lead-books job), the expected best lead is in the app's top-2 options and the textbook verdict cites the expected rule.
11. **Card choice.** From `KQJ4` vs a suit the agreed card is K. From `J109` J. From `K1094` (interior sequence) the 10. From `8642` the 6 (2nd highest). From `K852` the 2 (4th best). From `Q73` the 3.
12. **i18n.** Every UI label key exists in `i18n-glossary.json`. Unverified terms render with a dev-mode marker.

## Defaults and where they live

| Setting | Default | Where |
|---|---|---|
| hcpSlack | 1 | `system-*.json` → `meta.constraintConventions` |
| softPenalty | 0.3 | settings |
| deals | target 500, min 200, max 1000, timeout 10 s | settings |
| wDD / wR | 0.7 / 0.3 | settings (`lead-weights.md` may override) |
| L_IMP / L_MP | 3 IMPs / 0.25 | settings |
| cardPenalty | 0.8 | settings |
| opponents' system | `opponents-default-2over1.json` | per problem |
