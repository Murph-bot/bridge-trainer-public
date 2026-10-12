# Calibration report

Cache: 771 problems; deals per problem: mean 402, min 200, max 500; evaluation time 3592 s (sampling start 200, step 100, cap 500, seed 1).
Calibration runtime: 36.6 s (no DD; rules recomputed from the problems with data/lead-rules.json).

## Split

By the parity of the trailing integer of the problem id (nt-p20-q1 -> 1 -> odd): **411 odd problems** (fitting and cross-validation only), **360 even problems** (held-out report only; never used for any choice).

## Fitted values

- noiseK = **1.5** (grid 0, 0.5, 1, 1.5, 2, 2.5, 3).
- Family weights (units of sigma, the median paired SE): mpd = 0, nt = 1, suit = 0 (grid 0, 0.25, 0.5, 1, 2, 4).
- Objective: top-1 accuracy on the odd problems, IMP and MP items pooled (one set of weights for both scorings). Cross-validation: 5 folds inside the odd set.
- Accuracy on odd items (IMP+MP pooled): fitted 75.8% (623/822) in-sample, cross-validated 73.1% (601/822), DD-only 73.5% (604/822).

### DD bias corrections (kept only if they improve cross-validated accuracy)

| bias | fires on held-out items | CV gain (problems) | decision |
|---|---|---|---|
| B1 | 372 | -6 | off |
| B3 | 90 | -1 | off |
| B4 | 83 | -1 | off |
| B5 | 0 | 0 | off |

### Rule families

| family | fires on held-out items | CV gain (problems) | decision |
|---|---|---|---|
| mpd | 192 | 0 | dropped (weight 0) |
| nt | 348 | 7 | weight 1 |
| suit | 407 | 0 | dropped (weight 0) |

### Rules with their own weight (fire on at least 8 odd problems)

| rule | weight | odd problems | CV gain |
|---|---|---|---
| NT-001 | 0.25 | 21 | 1 |
| NT-011 | 0.5 | 8 | 1 |
| NT-012 | 1 | 37 | 1 |
| NT-050 | 1 | 10 | 2 |
| NT-065 | 1 | 13 | 2 |

### Dropped rules (no gain in held-out accuracy; 57, plus every rule of the dropped families mpd, suit)

NT-002 (fires 48, gain -1), NT-003 (fires 40, gain 0), NT-004 (fires 18, gain -1), NT-005 (fires 13, gain 0), NT-008 (fires 2, gain 0), NT-013 (fires 32, gain -1), NT-014 (fires 32, gain -2), NT-015 (fires 2, gain 0), NT-017 (fires 8, gain 0), NT-018 (fires 6, gain 0), NT-021 (fires 2, gain 0), NT-022 (fires 2, gain 0), NT-024 (fires 34, gain 0), NT-025 (fires 4, gain 0), NT-027 (fires 22, gain 0), NT-028 (fires 22, gain -1), NT-029 (fires 20, gain -1), NT-030 (fires 8, gain 0), NT-031 (fires 14, gain -2), NT-033 (fires 8, gain 0), NT-037 (fires 14, gain 0), NT-041 (fires 22, gain 0), NT-042 (fires 8, gain -1), NT-043 (fires 4, gain -1), NT-044 (fires 14, gain 0), NT-046 (fires 12, gain 0), NT-051 (fires 2, gain 0), NT-052 (fires 24, gain 0), NT-053 (fires 24, gain 0), NT-054 (fires 4, gain 0), NT-055 (fires 4, gain 0), NT-056 (fires 2, gain 0), NT-057 (fires 6, gain 0), NT-058 (fires 1, gain 0), NT-061 (fires 10, gain 0), NT-063 (fires 8, gain -1), NT-066 (fires 26, gain -1), NT-068 (fires 8, gain 0), NT-072 (fires 10, gain 0), NT-073 (fires 4, gain 0), NT-076 (fires 6, gain 0), NT-079 (fires 4, gain 0), NT-080 (fires 2, gain 0), NT-083 (fires 8, gain 0), NT-084 (fires 20, gain -1), NT-085 (fires 8, gain 0), NT-086 (fires 2, gain 0), NT-088 (fires 6, gain 0), NT-089 (fires 2, gain 0), NT-091 (fires 6, gain 0), NT-094 (fires 34, gain 0), NT-095 (fires 2, gain 0), NT-096 (fires 10, gain 0), NT-097 (fires 20, gain 0), NT-101 (fires 10, gain 0), NT-102 (fires 1, gain 0), NT-103 (fires 1, gain 0)

Rules that never fire on an odd problem (60 of 214) were not tested: they inherit their family weight (the "evidence-only" row shows the scheme without them).

## Held-out accuracy: even ids (not used for fitting or for any choice)

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| blend (old) | 65.8% (237/360) | 88.3% (318/360) | 57.5% (207/360) | 82.8% (298/360) |
| DD-only (P(defeat) / tricks) | 76.9% (277/360) | 95.3% (343/360) | 75.3% (271/360) | 93.1% (335/360) |
| rules-only | 56.9% (205/360) | 81.1% (292/360) | 49.4% (178/360) | 76.1% (274/360) |
| new (DD decides, rules tie-break) | 78.6% (283/360) | 95.0% (342/360) | 76.4% (275/360) | 93.3% (336/360) |
| new, evidence-only rules | 78.6% (283/360) | 95.3% (343/360) | 75.6% (272/360) | 93.1% (335/360) |
| DD-only by score (phase 5) | 78.1% (281/360) | 94.4% (340/360) | 67.2% (242/360) | 81.7% (294/360) |

## Odd ids (fitting set; the new scheme and DD-only use the fitted settings, so those rows are in-sample)

| mode | IMP top-1 | IMP top-3 | MP top-1 | MP top-3 |
|---|---|---|---|---|
| blend (old) | 63.3% (260/411) | 86.1% (354/411) | 56.7% (233/411) | 83.0% (341/411) |
| DD-only (P(defeat) / tricks) | 74.0% (304/411) | 93.2% (383/411) | 73.0% (300/411) | 93.4% (384/411) |
| rules-only | 55.7% (229/411) | 77.9% (320/411) | 47.2% (194/411) | 71.5% (294/411) |
| new (DD decides, rules tie-break) | 75.9% (312/411) | 93.7% (385/411) | 75.7% (311/411) | 93.7% (385/411) |
| new, evidence-only rules | 75.9% (312/411) | 93.7% (385/411) | 75.7% (311/411) | 93.7% (385/411) |
| DD-only by score (phase 5) | 74.9% (308/411) | 93.4% (384/411) | 64.7% (266/411) | 83.7% (344/411) |
