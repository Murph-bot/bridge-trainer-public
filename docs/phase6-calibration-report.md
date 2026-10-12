# Calibration report

Cache: 771 problems; deals per problem: mean 402, min 200, max 500; evaluation time 3592 s (sampling start 200, step 100, cap 500, seed 1).
Calibration runtime: 56.8 s (no DD; rules recomputed from the problems with data/lead-rules.json).

## Split

By the parity of the trailing integer of the problem id (nt-p20-q1 -> 1 -> odd): **411 odd problems** (fitting and cross-validation only), **360 even problems** (held-out report only; never used for any choice).

## Fitted values

- noiseK = **1.5** (grid 0, 0.5, 1, 1.5, 2, 2.5, 3).
- Family weights (units of sigma, the median paired SE): mpd = 0, nt = 1, suit = 0 (grid 0, 0.25, 0.5, 1, 2, 4).
- Objective: top-1 accuracy on the odd problems, IMP and MP items pooled (joint fit: one set of weights for both scorings; the per-form fits are below). Cross-validation: 5 folds inside the odd set.
- Accuracy on odd items (IMP+MP pooled): fitted 76.9% (632/822) in-sample, cross-validated 73.4% (603/822), DD-only 74.8% (615/822).

### DD bias corrections (kept only if they improve cross-validated accuracy)

| bias | fires on held-out items | CV gain (problems) | decision |
|---|---|---|---|
| B1 | 352 | -15 | off |
| B3 | 87 | -1 | off |
| B4 | 69 | 1 | kept |
| B5 | 0 | 0 | off |

### Rule families

| family | fires on held-out items | CV gain (problems) | decision |
|---|---|---|---|
| mpd | 192 | 0 | dropped (weight 0) |
| nt | 348 | 4 | weight 1 |
| suit | 407 | -5 | dropped (weight 0) |

### Rules with their own weight (fire on at least 8 odd problems)

| rule | weight | odd problems | CV gain |
|---|---|---|---
| NT-011 | 1 | 8 | 1 |
| NT-012 | 0 | 37 | 1 |
| NT-024 | 2 | 17 | 1 |
| NT-050 | 1 | 10 | 1 |
| NT-065 | 0.5 | 13 | 5 |

### Dropped rules (no gain in held-out accuracy; 59, plus every rule of the dropped families mpd, suit)

NT-001 (fires 42, gain 0), NT-002 (fires 48, gain 0), NT-003 (fires 40, gain 0), NT-004 (fires 18, gain -1), NT-005 (fires 13, gain 0), NT-008 (fires 2, gain 0), NT-013 (fires 32, gain -1), NT-014 (fires 32, gain 0), NT-015 (fires 2, gain 0), NT-016 (fires 14, gain 0), NT-017 (fires 8, gain 0), NT-018 (fires 6, gain 0), NT-021 (fires 2, gain 0), NT-022 (fires 2, gain 0), NT-025 (fires 4, gain 0), NT-027 (fires 22, gain -2), NT-028 (fires 22, gain -3), NT-029 (fires 20, gain 0), NT-030 (fires 8, gain 0), NT-031 (fires 14, gain 0), NT-033 (fires 8, gain -1), NT-037 (fires 14, gain 0), NT-040 (fires 2, gain 0), NT-041 (fires 22, gain 0), NT-042 (fires 8, gain -1), NT-043 (fires 4, gain -1), NT-044 (fires 14, gain 0), NT-046 (fires 12, gain 0), NT-051 (fires 2, gain 0), NT-052 (fires 24, gain 0), NT-053 (fires 24, gain 0), NT-054 (fires 4, gain 0), NT-055 (fires 4, gain 0), NT-056 (fires 2, gain 0), NT-057 (fires 6, gain 0), NT-058 (fires 1, gain 0), NT-063 (fires 8, gain -2), NT-066 (fires 26, gain -2), NT-068 (fires 8, gain 0), NT-072 (fires 10, gain 0), NT-073 (fires 4, gain 0), NT-076 (fires 6, gain 0), NT-077 (fires 2, gain 0), NT-079 (fires 4, gain 0), NT-080 (fires 2, gain 0), NT-083 (fires 8, gain 0), NT-084 (fires 20, gain 0), NT-085 (fires 8, gain 0), NT-086 (fires 2, gain 0), NT-088 (fires 6, gain 0), NT-089 (fires 2, gain 0), NT-091 (fires 6, gain 0), NT-094 (fires 34, gain 0), NT-095 (fires 2, gain 0), NT-096 (fires 10, gain 0), NT-097 (fires 20, gain 0), NT-101 (fires 10, gain 0), NT-102 (fires 1, gain 0), NT-103 (fires 1, gain 0)

### Per scoring form (separate fits, shared noiseK)

Each form is fitted on its own odd items with noiseK fixed at 1.5 (its own rule, family and DD bias decisions, each by 5-fold cross-validation inside the odd items of the form). Whether the separate fit replaces the joint one is decided by an outer 5-fold cross-validation on the odd ids (the whole joint and the whole separate procedure refitted on 4/5 and scored on the remaining fifth of that form's items); it is kept only if it is strictly better. The even ids play no part.

| form | outer CV joint | outer CV separate | kept | weights used | biases on |
|---|---|---|---|---|---|
| IMP | 76.4% (314/411) | 76.4% (314/411) | joint | mpd = 0, nt = 1, suit = 0, NT-011 = 1, NT-012 = 0, NT-024 = 2, NT-050 = 1, NT-065 = 0.5 | B4 |
| MP | 73.0% (300/411) | 73.2% (301/411) | separate | mpd = 0, nt = 1, suit = 0, NT-011 = 0.5, NT-050 = 1, NT-065 = 0.5 | none |

Separate fits (whether kept or not): DD bias decisions by inner cross-validation.

| form | weights | B1 CV gain | B3 CV gain | B4 CV gain | B5 CV gain | biases on | dropped families |
|---|---|---|---|---|---|---|---|
| IMP | mpd = 0, nt = 1, suit = 0, NT-028 = 0.25, NT-053 = 1, NT-097 = 0.5 | -13 | -1 | 2 | 0 | B4 | mpd, suit |
| MP | mpd = 0, nt = 1, suit = 0, NT-011 = 0.5, NT-050 = 1, NT-065 = 0.5 | -4 | 0 | 0 | 0 | none | mpd, suit |

Rules that never fire on an odd problem (60 of 214) were not tested: they inherit their family weight (the "evidence-only" row shows the scheme without them).

## Held-out accuracy: even ids (not used for fitting or for any choice)

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| blend (old) | 65.8% (237/360) | 88.3% (318/360) | 57.5% (207/360) | 82.8% (298/360) |
| DD-only (IMP score at IMPs / tricks at MPs) | 78.6% (283/360) | 94.4% (340/360) | 75.3% (271/360) | 93.1% (335/360) |
| rules-only | 56.9% (205/360) | 81.1% (292/360) | 49.4% (178/360) | 76.1% (274/360) |
| new (DD decides, rules tie-break; per-form weights) | 80.0% (288/360) | 95.3% (343/360) | 75.8% (273/360) | 93.3% (336/360) |
| new, joint weights (both forms) | 80.0% (288/360) | 95.3% (343/360) | 75.6% (272/360) | 93.3% (336/360) |
| new, evidence-only rules | 79.4% (286/360) | 95.3% (343/360) | 75.0% (270/360) | 93.1% (335/360) |
| DD-only by score (phase 5) | 78.1% (281/360) | 94.4% (340/360) | 67.2% (242/360) | 81.7% (294/360) |

## Odd ids (fitting set; the new scheme and DD-only use the fitted settings, so those rows are in-sample)

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| blend (old) | 63.3% (260/411) | 86.1% (354/411) | 56.7% (233/411) | 83.0% (341/411) |
| DD-only (IMP score at IMPs / tricks at MPs) | 76.6% (315/411) | 94.2% (387/411) | 73.0% (300/411) | 93.4% (384/411) |
| rules-only | 55.7% (229/411) | 77.9% (320/411) | 47.2% (194/411) | 71.5% (294/411) |
| new (DD decides, rules tie-break; per-form weights) | 77.9% (320/411) | 95.1% (391/411) | 75.4% (310/411) | 93.7% (385/411) |
| new, joint weights (both forms) | 77.9% (320/411) | 95.1% (391/411) | 75.9% (312/411) | 93.7% (385/411) |
| new, evidence-only rules | 77.9% (320/411) | 95.1% (391/411) | 75.4% (310/411) | 93.7% (385/411) |
| DD-only by score (phase 5) | 74.9% (308/411) | 93.4% (384/411) | 64.7% (266/411) | 83.7% (344/411) |
