#!/usr/bin/env python3
"""Generates system-stelios-sotos.json and opponents-default-2over1.json.
Edit the rules here, re-run, then run validate.py. The JSON files are what the app loads."""
import json, os

OUT = os.path.join(os.path.dirname(__file__), "..")
SUITS = ["S", "H", "D", "C"]
MAJ, MIN = ["H", "S"], ["C", "D"]
SYM = {"S": "♠", "H": "♥", "D": "♦", "C": "♣", "N": "NT"}
RANK = {"C": 0, "D": 1, "H": 2, "S": 3, "N": 4}

CC = "SS/Stelios_Sotos_CC.pdf"
NOTES = "SS/Stelios_Sotos_Convention_Card_with_Notes.pdf"
SYSMD = "bridge-matey/system-2over1.md"
STD = "standard 2/1 (default)"


def src(file, section):
    return {"file": file, "section": section}


def cs(hcp=None, shape=None, feat=None, anyOf=None, notAny=None, cmp=None, hpl=None, keycards=None, tq=None, kings=None, **lens):
    d = {}
    if hcp: d["hcp"] = list(hcp)
    L = {s: list(lens[s]) for s in SUITS if s in lens}
    if L: d["len"] = L
    if shape: d["shape"] = shape
    if cmp: d["lenCmp"] = [list(c) for c in cmp]
    if feat: d["features"] = list(feat)
    if hpl: d["hcpPlusLen"] = {"suit": hpl[0], "min": hpl[1]}
    if keycards: d["keycards"] = {"trump": keycards[0], "oneOf": list(keycards[1])}
    if tq is not None: d["trumpQueen"] = tq
    if kings: d["kings"] = {"oneOf": list(kings)}
    if anyOf: d["anyOf"] = anyOf
    if notAny: d["notAny"] = notAny
    return d


class Book:
    def __init__(self, profile):
        self.p = profile
        self.rules = []

    def add(self, id, cat, auction, call, en, shows=None, forcing="NF", alert=False, art=False, pri=50,
            source=None, conf="source", seats=None, ph=None, vul=None, notes=None, inferable=True):
        if self.p == "opps":
            conf = "default-assumed"
            source = src(STD, "opponents' default system")
        r = {"id": id, "category": cat, "context": {"auction": auction.split()}, "call": call,
             "meaning": {"en": en}, "shows": shows or {}, "forcing": forcing, "alertable": alert,
             "artificial": art, "priority": pri, "inferable": inferable,
             "source": source or src(STD, "plain standard 2/1"), "confidence": conf}
        if seats: r["context"]["seats"] = seats
        if ph is not None: r["context"]["actorPassedHand"] = ph
        if vul: r["context"]["vul"] = vul
        if notes: r["notes"] = notes
        self.rules.append(r)


def ss(B):
    return B.p == "ss"


# ---------------------------------------------------------------- openings
def openings(B):
    o = "opening"
    s1 = src(CC, "p.2 Openings table") if ss(B) else None
    for seats, cap in (([1, 2], 12), ([3], 10), ([4], 12)):
        B.add(f"open.pass.seat{seats[0]}", o, "P* ?", "P", "No opening bid", cs(hcp=(0, cap)), pri=0,
              seats=seats, conf="default-assumed",
              notes="Negative inference: denies every inferable opening in this seat (sibling negation).")
    if ss(B):
        # The 1-level suit openings are 11+ in seats 1, 2 and 4, but may be
        # light (9+) in 3rd seat.  Keep the ordinary ids for the non-3rd seats
        # so existing references remain stable.
        B.add("open.1C", o, "P* ?", "1C", "3+♣, 11-22, natural (longer minor; 3-3 minors)",
              cs(hcp=(11, 22), C=(3, 13), anyOf=[cs(cmp=[("C", ">", "D")]), cs(C=(3, 3), D=(3, 3))]),
              pri=50, source=s1, seats=[1, 2, 4])
        B.add("open.1D", o, "P* ?", "1D", "3+♦, 11-22, natural (longer minor; 4-4 / 5-5 minors)",
              cs(hcp=(11, 22), D=(3, 13), anyOf=[cs(cmp=[("D", ">", "C")]), cs(cmp=[("D", "=", "C")], D=(4, 13))]),
              pri=51, source=s1, seats=[1, 2, 4], notes="Minor choice with equal length is default-assumed (gap G-OPEN-2).")
        B.add("open.1H", o, "P* ?", "1H", "5+♥, 11-22",
              cs(hcp=(11, 22), H=(5, 13), cmp=[("H", ">", "S"), ("H", ">=", "D"), ("H", ">=", "C")]), pri=60, source=s1, seats=[1, 2, 4])
        B.add("open.1S", o, "P* ?", "1S", "5+♠, 11-22",
              cs(hcp=(11, 22), S=(5, 13), cmp=[("S", ">=", "H"), ("S", ">=", "D"), ("S", ">=", "C")]), pri=61, source=s1, seats=[1, 2, 4])
        B.add("open.1C.seat3", o, "P* ?", "1C", "3+♣, 9-22, light 3rd-seat opening",
              cs(hcp=(9, 22), C=(3, 13), anyOf=[cs(cmp=[("C", ">", "D")]), cs(C=(3, 3), D=(3, 3))]),
              pri=50, source=s1, seats=[3], notes="Answered G-OPEN-4: 3rd seat 9+ HCP; seats 1, 2 and 4 remain 11+.")
        B.add("open.1D.seat3", o, "P* ?", "1D", "3+♦, 9-22, light 3rd-seat opening",
              cs(hcp=(9, 22), D=(3, 13), anyOf=[cs(cmp=[("D", ">", "C")]), cs(cmp=[("D", "=", "C")], D=(4, 13))]),
              pri=51, source=s1, seats=[3], notes="Answered G-OPEN-4: 3rd seat 9+ HCP; seats 1, 2 and 4 remain 11+.")
        B.add("open.1H.seat3", o, "P* ?", "1H", "5+♥, 9-22, light 3rd-seat opening",
              cs(hcp=(9, 22), H=(5, 13), cmp=[("H", ">", "S"), ("H", ">=", "D"), ("H", ">=", "C")]), pri=60, source=s1, seats=[3],
              notes="Answered G-OPEN-4: 3rd seat 9+ HCP; seats 1, 2 and 4 remain 11+.")
        B.add("open.1S.seat3", o, "P* ?", "1S", "5+♠, 9-22, light 3rd-seat opening",
              cs(hcp=(9, 22), S=(5, 13), cmp=[("S", ">=", "H"), ("S", ">=", "D"), ("S", ">=", "C")]), pri=61, source=s1, seats=[3],
              notes="Answered G-OPEN-4: 3rd seat 9+ HCP; seats 1, 2 and 4 remain 11+.")
    else:
        B.add("open.1C", o, "P* ?", "1C", "3+♣, 11-22, natural (longer minor; 3-3 minors)",
              cs(hcp=(11, 22), C=(3, 13), anyOf=[cs(cmp=[("C", ">", "D")]), cs(C=(3, 3), D=(3, 3))]), pri=50, source=s1)
        B.add("open.1D", o, "P* ?", "1D", "3+♦, 11-22, natural (longer minor; 4-4 / 5-5 minors)",
              cs(hcp=(11, 22), D=(3, 13), anyOf=[cs(cmp=[("D", ">", "C")]), cs(cmp=[("D", "=", "C")], D=(4, 13))]),
              pri=51, source=s1, notes="Minor choice with equal length is default-assumed (gap G-OPEN-2).")
        B.add("open.1H", o, "P* ?", "1H", "5+♥, 11-22",
              cs(hcp=(11, 22), H=(5, 13), cmp=[("H", ">", "S"), ("H", ">=", "D"), ("H", ">=", "C")]), pri=60, source=s1)
        B.add("open.1S", o, "P* ?", "1S", "5+♠, 11-22",
              cs(hcp=(11, 22), S=(5, 13), cmp=[("S", ">=", "H"), ("S", ">=", "D"), ("S", ">=", "C")]), pri=61, source=s1)
    B.add("open.1N", o, "P* ?", "1N", "15-17 balanced (5-card major allowed: default)", cs(hcp=(15, 17), shape="balanced"), pri=80,
          source=src(SYSMD, "header: confirmed by Sotirios 2026-10-01; CC p.2 shows (14)15-17") if ss(B) else None,
          notes="CC prints (14)15-17; Sotirios confirmed 15-17. Hard range 14-18 via hcpSlack. 5-card major in 1NT: gap G-OPEN-1.")
    B.add("open.2C", o, "P* ?", "2C", "22+ balanced, or any game-forcing hand",
          cs(anyOf=[cs(hcp=(22, 37), shape="balanced"), cs(hcp=(22, 37), shape="unbalanced")]),
          forcing="GF", alert=True, art=True, pri=90,
          source=src(CC, "p.1 General approach; p.2 2♣ row") if ss(B) else None,
          conf="source-interpreted", notes="'Any GF' approximated as 22+ HCP unbalanced so 1-level openings keep their 11-22 range; strong playing-trick hands with fewer HCP are missed.")
    B.add("open.2N", o, "P* ?", "2N", "20-21 balanced", cs(hcp=(20, 21), shape="balanced"), pri=85,
          source=src(SYSMD, "header: confirmed 2026-10-01; CC p.2") if ss(B) else None)
    if ss(B):
        w = src(NOTES, "p.9 Wild Aggressor: 1st/2nd seat spec; CC p.1-2")
        for s in ["D", "H", "S"]:
            others = [x for x in MAJ if x != s] if s != "D" else []
            sh = cs(hcp=(5, 11), **{s: (5, 13)}, notAny=[cs(**{o2: (5, 13)}) for o2 in others] or None)
            B.add(f"open.2{s}.seat12", o, "P* ?", f"2{s}", f"Weak, 5+{SYM[s]}, 5-11 (frisky)", sh, pri=70,
                  seats=[1, 2, 3], source=w, alert=True,
                  notes="Answered G-OPEN-3 (Sotirios 2026-10-04): 5-11 HCP and 5+ cards in seats 1-3. No honour requirement.")
            B.add(f"open.2{s}.seat34", o, "P* ?", f"2{s}", f"Weak, exactly 6{SYM[s]}, 12-14 (4th seat)",
                  cs(hcp=(12, 14), **{s: (6, 6)}), pri=70, seats=[4], source=w, alert=True,
                  notes="Answered G-OPEN-3 (Sotirios 2026-10-04): 12-14 HCP and exactly 6 cards in 4th seat.")
    else:
        for s in ["D", "H", "S"]:
            B.add(f"open.2{s}", o, "P* ?", f"2{s}", f"Weak two, 6{SYM[s]}, 5-10",
                  cs(hcp=(5, 10), **{s: (6, 6)}), pri=70)
    for s in SUITS:
        B.add(f"open.3{s}", o, "P* ?", f"3{s}", f"Preemptive, 6+{SYM[s]} (7 allowed)",
              cs(hcp=(5, 10), **{s: (6, 7)}), pri=65, source=s1,
              conf="source-interpreted", notes="Length from card; HCP 5-10 assumed.")
    if ss(B):
        B.add("open.3N", o, "P* ?", "3N", "Weak, 5-5+ minors, no major ονέρ, below opening strength",
              cs(hcp=(5, 10), C=(5, 13), D=(5, 13), feat=["noTopHonors:H", "noTopHonors:S"]), pri=66, alert=True,
              art=True, source=src(SYSMD, "header: confirmed 2026-10-01; CC p.2 3NT row"),
              conf="source-interpreted", notes="HCP 5-10 inferred from 'below opening strength'. 'No major honours' read as no A/K/Q in ♥/♠.")
    else:
        B.add("open.3N", o, "P* ?", "3N", "Gambling: solid 7+ minor, no outside A/K",
              cs(hcp=(10, 16), anyOf=[cs(C=(7, 13), feat=["solidSuit:C"]), cs(D=(7, 13), feat=["solidSuit:D"])]),
              pri=66, alert=True, art=True)
    for s in SUITS:
        B.add(f"open.4{s}", o, "P* ?", f"4{s}", f"Preemptive, 7+{SYM[s]}", cs(hcp=(5, 12), **{s: (7, 13)}), pri=64,
              source=s1, conf="source-interpreted")
    for s in MIN:
        B.add(f"open.5{s}", o, "P* ?", f"5{s}", f"Preemptive, 8+{SYM[s]}", cs(hcp=(5, 12), **{s: (8, 13)}), pri=63,
              source=s1, conf="source-interpreted")


# ---------------------------------------------------------------- 1m responses and rebids
def minor_responses(B):
    r = "response"
    for m in MIN:
        a = f"P* 1{m} P ?"
        B.add(f"resp.1{m}.pass", r, a, "P", "Too weak to respond", cs(hcp=(0, 6)), pri=0, conf="default-assumed")
        if m == "C":
            B.add("resp.1C.1D", r, a, "1D", "4+♦, 6+, no 4-card major unless longer diamonds (up the line)",
                  cs(hcp=(6, 37), D=(4, 13), cmp=[("D", ">=", "C")]), forcing="F1", pri=40, conf="default-assumed",
                  notes="Up-the-line vs Walsh: gap G-RESP-6.")
        B.add(f"resp.1{m}.1H", r, a, "1H", "4+♥, 6+ (with 4-4 majors bid 1♥)",
              cs(hcp=(6, 37), H=(4, 13), anyOf=[cs(cmp=[("H", ">", "S")]), cs(H=(4, 4), S=(4, 4))]), forcing="F1", pri=45,
              source=src(CC, "p.2 1♣/1♦ rows: responses natural") if ss(B) else None, conf="source-interpreted")
        B.add(f"resp.1{m}.1S", r, a, "1S", "4+♠, 6+",
              cs(hcp=(6, 37), S=(4, 13), anyOf=[cs(cmp=[("S", ">", "H")]), cs(cmp=[("S", "=", "H")], S=(5, 13))]),
              forcing="F1", pri=46, source=src(CC, "p.2 1♣/1♦ rows: responses natural") if ss(B) else None, conf="source-interpreted")
        B.add(f"resp.1{m}.1N", r, a, "1N", "6-10, no 4-card major, balanced-ish",
              cs(hcp=(6, 10), H=(0, 3), S=(0, 3), shape="semibalanced"), pri=30, conf="default-assumed")
        B.add(f"resp.1{m}.2{m}", r, a, f"2{m}", f"Simple raise 6-10, {5 if m=='C' else 4}+{SYM[m]}, no 4-card major",
              cs(hcp=(6, 10), H=(0, 3), S=(0, 3), **{m: (5 if m == "C" else 4, 13)}), pri=32, conf="default-assumed",
              notes="Card says 'natural' only. Inverted minors? Gap G-RESP-1.")
        B.add(f"resp.1{m}.3{m}", r, a, f"3{m}", "Limit raise 10-12, no 4-card major",
              cs(hcp=(10, 12), H=(0, 3), S=(0, 3), **{m: (5 if m == "C" else 4, 13)}), forcing="invite", pri=33, conf="default-assumed")
        B.add(f"resp.1{m}.2N", r, a, "2N", "11-12 balanced, no 4-card major, invitational",
              cs(hcp=(11, 12), shape="balanced", H=(0, 3), S=(0, 3)), forcing="invite", pri=31, conf="default-assumed",
              notes="Gap G-RESP-2 (many 2/1 pairs play 1m-2NT as GF).")
        B.add(f"resp.1{m}.3N", r, a, "3N", "13-15 balanced, no 4-card major",
              cs(hcp=(13, 15), shape="balanced", H=(0, 3), S=(0, 3)), pri=31, conf="default-assumed")
        if m == "D":
            B.add("resp.1D.2C", r, a, "2C", "Game forcing, 4+♣ (usually 5+)",
                  cs(hcp=(12, 37), C=(4, 13)), forcing="GF", pri=44,
                  source=src(CC, "p.1 '2 over 1 is GF'") if ss(B) else None, conf="source-interpreted")
        if not ss(B):
            for s in MAJ:
                B.add(f"resp.1{m}.2{s}.jump", r, a, f"2{s}", f"Weak jump shift: 6+{SYM[s]}, 2-6",
                      cs(hcp=(2, 6), **{s: (6, 13)}), pri=35, conf="default-assumed", notes="Gap G-RESP-3.")


def minor_rebids(B):
    r = "opener-rebid"
    for m, y in [("C", "D"), ("C", "H"), ("C", "S"), ("D", "H"), ("D", "S")]:
        a = f"P* 1{m} P 1{y} P ?"
        p = f"rebid.1{m}1{y}"
        d = "default-assumed"
        B.add(f"{p}.1N", r, a, "1N", "12-14 balanced", cs(hcp=(11, 14), shape="balanced", **({y: (0, 3)} if y in MAJ else {})), pri=40, conf=d)
        B.add(f"{p}.2N", r, a, "2N", "18-19 balanced", cs(hcp=(18, 19), shape="balanced"), forcing="invite", pri=42, conf=d)
        B.add(f"{p}.2{m}", r, a, f"2{m}", f"6+{SYM[m]}, minimum", cs(hcp=(11, 15), **{m: (6, 13)}), pri=35, conf=d)
        B.add(f"{p}.3{m}", r, a, f"3{m}", f"6+{SYM[m]}, 15-17", cs(hcp=(15, 17), **{m: (6, 13)}), forcing="invite", pri=36, conf=d)
        if y in MAJ:
            B.add(f"{p}.2{y}", r, a, f"2{y}", f"4{SYM[y]} support, minimum", cs(hcp=(11, 14), **{y: (4, 13)}), pri=45, conf=d)
            B.add(f"{p}.3{y}", r, a, f"3{y}", f"4{SYM[y]} support, 15-17", cs(hcp=(15, 17), **{y: (4, 13)}), forcing="invite", pri=46, conf=d)
            B.add(f"{p}.4{y}", r, a, f"4{y}", f"4{SYM[y]} support, 18+", cs(hcp=(18, 21), **{y: (4, 13)}), pri=47, conf=d)
        for z in SUITS:
            if z in (m, y):
                continue
            if RANK[z] > RANK[y]:
                B.add(f"{p}.1{z}", r, a, f"1{z}", f"4+{SYM[z]}, natural", cs(hcp=(11, 18), **{z: (4, 13)}), pri=44, conf=d)
            elif RANK[z] < RANK[m]:
                B.add(f"{p}.2{z}", r, a, f"2{z}", f"4+{SYM[z]}, non-reverse, 11-17", cs(hcp=(11, 17), **{z: (4, 13)}), pri=38, conf=d)
            else:
                B.add(f"{p}.2{z}.rev", r, a, f"2{z}", f"Reverse: 17+, 4+{SYM[z]}, longer {SYM[m]}",
                      cs(hcp=(17, 22), **{z: (4, 13)}, cmp=[(m, ">", z)]), forcing="F1", pri=39, conf=d)
    for m in MIN:
        for y in MAJ:
            a = f"P* 1{m} P 1{y} P 1N P ?"
            B.add(f"resp2.1{m}1{y}1N.2C", "responder-rebid", a, "2C",
                  "Checkback Stayman: invitational+, asks 3-card support / other major", cs(hcp=(11, 37), **{y: (4, 13)}),
                  forcing="F1", alert=True, art=True, pri=60,
                  source=src(CC, "p.2 1♣ row: Checkback Stayman after 1m-1M-1NT") if ss(B) else None,
                  conf="source-interpreted", notes="Card names the convention only. Opener replies default (gap G-REBID-4).")


# ---------------------------------------------------------------- 1M responses
def major_responses(B):
    r = "response"
    sp = src(CC, "p.2 1♥/1♠ rows") if ss(B) else None
    spl = src(NOTES, "p.5 Splintering") if ss(B) else None
    for M in MAJ:
        a = f"P* 1{M} P ?"
        B.add(f"resp.1{M}.pass", r, a, "P", "Too weak", cs(hcp=(0, 5)), pri=0, conf="default-assumed")
        if M == "H":
            B.add("resp.1H.1S", r, a, "1S", "4+♠, 6+, forcing one round", cs(hcp=(6, 37), S=(4, 13)), forcing="F1",
                  pri=40, source=sp, notes="With a 4-card ♥ limit raise or better, raise instead (priority).")
        nt_main = cs(hcp=(5, 11), **{M: (0, 3)}, **({"S": (0, 3)} if M == "H" else {}))
        B.add(f"resp.1{M}.1N", r, a, "1N", "5-11, forcing one round (may be 3-7 with a 3-card fit)",
              cs(anyOf=[nt_main, cs(hcp=(3, 7), **{M: (3, 3)})]), forcing="F1", alert=ss(B), pri=30, source=sp)
        B.add(f"resp.1{M}.2C", r, a, "2C", "Game forcing, natural 4+♣",
              cs(hcp=(12, 37), C=(4, 13)), forcing="GF", pri=42, source=sp, conf="source-interpreted", notes="Length 4+ assumed.")
        B.add(f"resp.1{M}.2D", r, a, "2D", "Game forcing, natural 4+♦", cs(hcp=(12, 37), D=(4, 13), cmp=[("D", ">=", "C")]),
              forcing="GF", pri=43, source=sp, conf="source-interpreted", notes="Length 4+ assumed.")
        if M == "S":
            B.add("resp.1S.2H", r, a, "2H", "5+♥, game forcing", cs(hcp=(12, 37), H=(5, 13)), forcing="GF", pri=45, source=sp)
        B.add(f"resp.1{M}.2{M}", r, a, f"2{M}", f"Raise, 8-10 with 3/4 {SYM[M]}" if ss(B) else "Raise 6-10, 3+",
              cs(hcp=(8, 10) if ss(B) else (6, 10), **{M: (3, 4)}), pri=50, source=sp)
        B.add(f"resp.1{M}.4{M}", r, a, f"4{M}", "To play, 5+ trumps, weak/distributional", cs(hcp=(0, 9), **{M: (5, 13)}),
              pri=53, conf="default-assumed")
        if ss(B):
            B.add(f"resp.1{M}.2N", r, a, "2N", f"Balanced game force with 2-3 {SYM[M]}",
                  cs(hcp=(12, 37), shape="balanced", **{M: (2, 3)}), forcing="GF", alert=True, art=True, pri=48, source=sp)
            B.add(f"resp.1{M}.3C", r, a, "3C", "Game force with fit, asks for singleton/void",
                  cs(hcp=(12, 37), **{M: (4, 13)}), forcing="GF", alert=True, art=True, pri=55, source=sp,
                  conf="source-interpreted", notes="Fit length 4+ assumed. Opener's shortness replies are encoded below (G-RESP-5).")
            B.add(f"resp.1{M}.3D", r, a, "3D", "Limit raise, 4+ trumps",
                  cs(hcp=(10, 12), **{M: (4, 13)}), forcing="invite", alert=True, art=True, pri=54, source=sp)
            B.add(f"resp.1{M}.3{M}", r, a, f"3{M}", "Preemptive raise, 4+ trumps", cs(hcp=(0, 7), **{M: (4, 13)}), pri=52,
                  conf="default-assumed", notes="Gap G-RESP-4.")
            single = cs(hcp=(10, 16), **{M: (4, 13)}, feat=["single:any"])
            if M == "H":
                B.add("resp.1H.3S", r, a, "3S", "4+♥ and an unspecified singleton (3NT asks)", single, forcing="GF",
                      alert=True, art=True, pri=60, source=spl, conf="source-interpreted", notes="HCP 10-16 assumed ('slam hands without HCP strength').")
                B.add("resp.1H.3N", r, a, "3N", "4+♥, ♠ void", cs(hcp=(10, 16), H=(4, 13), S=(0, 0)), forcing="GF",
                      alert=True, art=True, pri=61, source=spl)
                for v in MIN:
                    B.add(f"resp.1H.4{v}", r, a, f"4{v}", f"4+♥, {SYM[v]} void", cs(hcp=(10, 16), H=(4, 13), **{v: (0, 0)}),
                          forcing="GF", alert=True, art=True, pri=61, source=spl)
                a2 = "P* 1H P 3S P 3N P ?"
                for call, v in (("4C", "C"), ("4D", "D"), ("4H", "S")):
                    B.add(f"resp2.1H3S3N.{call}", "responder-rebid", a2, call, f"Singleton {SYM[v]}", cs(**{v: (1, 1)}),
                          forcing="response", alert=True, art=True, pri=50, source=spl)
            else:
                B.add("resp.1S.3N", r, a, "3N", "4+♠ and an unspecified singleton (4♣ asks)", single, forcing="GF",
                      alert=True, art=True, pri=60, source=spl, conf="source-interpreted")
                for v in ["C", "D", "H"]:
                    B.add(f"resp.1S.4{v}", r, a, f"4{v}", f"4+♠, {SYM[v]} void", cs(hcp=(10, 16), S=(4, 13), **{v: (0, 0)}),
                          forcing="GF", alert=True, art=True, pri=61, source=spl)
                a2 = "P* 1S P 3N P 4C P ?"
                for call, v in (("4D", "D"), ("4H", "H"), ("4S", "C")):
                    B.add(f"resp2.1S3N4C.{call}", "responder-rebid", a2, call, f"Singleton {SYM[v]}", cs(**{v: (1, 1)}),
                          forcing="response", alert=True, art=True, pri=50, source=spl)
        else:
            B.add(f"resp.1{M}.2N", r, a, "2N", "Jacoby: 4+ trumps, game force", cs(hcp=(13, 37), **{M: (4, 13)}),
                  forcing="GF", alert=True, art=True, pri=55)
            B.add(f"resp.1{M}.3{M}", r, a, f"3{M}", "Limit raise, 4 trumps", cs(hcp=(10, 12), **{M: (4, 13)}),
                  forcing="invite", pri=54)
            spl_calls = {"H": [("3S", "S"), ("4C", "C"), ("4D", "D")], "S": [("4C", "C"), ("4D", "D"), ("4H", "H")]}[M]
            for call, v in spl_calls:
                B.add(f"resp.1{M}.{call}", r, a, call, f"Splinter: 4+ trumps, short {SYM[v]}",
                      cs(hcp=(10, 15), **{M: (4, 13)}, feat=[f"short:{v}"]), forcing="GF", alert=True, art=True, pri=60)
        for pat, k in ((f"P P 1{M} P ?", "s3"), (f"P P P 1{M} P ?", "s4")):
            B.add(f"resp.1{M}.ph.2C.{k}", r, pat, "2C", f"Reverse Drury: 3+{SYM[M]}, 10-11" if ss(B) else "Drury: 3+ support, 10-11",
                  cs(hcp=(10, 11), **{M: (3, 13)}), forcing="F1", alert=True, art=True, pri=58, ph=True,
                  source=src(CC, "p.1 Drury 3rd/4th seat; p.2 Reverse Drury") if ss(B) else None,
                  notes="Opener's replies: 2M = minimum, anything else = full opening (default).")


def major_fit_shortness(B):
    """Opener's replies to the artificial 1M-3C fit/shortness ask."""
    if not ss(B):
        return
    r = "opener-rebid"
    q = src(NOTES, "p.5 Splintering; Sotirios confirmation 2026-10-04")
    for M in MAJ:
        a = f"P* 1{M} P 3C P ?"
        side = [s for s in SUITS if s != M]
        for call, short in (("3D", "D"), ("3H", "H"), ("3S", "S"), ("3N", "C")):
            if short == M:
                continue
            B.add(f"rebid.1{M}3C.{call}.short{short}", r, a, call, f"Shortness in {SYM[short]} (0-1 card)",
                  cs(**{short: (0, 1)}), forcing="GF", alert=True, art=True, pri=57, source=q,
                  conf="source-interpreted", notes="G-RESP-5 answered: shortness means 0-1 cards.")
        B.add(f"rebid.1{M}3C.3{M}.no-short", r, a, f"3{M}", "No shortness (no side-suit singleton or void)",
              cs(notAny=[cs(**{s: (0, 1)}) for s in side]), forcing="GF", alert=True, art=True, pri=58, source=q,
              conf="source-interpreted", notes="G-RESP-5 answered: rebidding the major shows no shortness.")


def major_rebids(B):
    r = "opener-rebid"
    d = "default-assumed"
    a = "P* 1H P 1S P ?"
    for c, en, sh, pri, f in [
        ("1N", "11-14 balanced", cs(hcp=(11, 14), shape="balanced", S=(0, 3)), 40, "NF"),
        ("2H", "6+♥ minimum", cs(hcp=(11, 14), H=(6, 13), S=(0, 3)), 41, "NF"),
        ("2S", "4♠ minimum", cs(hcp=(11, 14), S=(4, 13)), 45, "NF"),
        ("3S", "4♠, 15-17", cs(hcp=(15, 17), S=(4, 13)), 46, "invite"),
        ("4S", "4♠, 18+", cs(hcp=(18, 22), S=(4, 13)), 47, "NF"),
        ("2C", "4+♣, 11-17", cs(hcp=(11, 17), C=(4, 13), S=(0, 3)), 39, "NF"),
        ("2D", "4+♦, 11-17", cs(hcp=(11, 17), D=(4, 13), S=(0, 3)), 39, "NF"),
        ("2N", "18-19 balanced", cs(hcp=(18, 19), shape="balanced"), 42, "invite"),
        ("3H", "6+♥, 15-17", cs(hcp=(15, 17), H=(6, 13)), 43, "invite")]:
        B.add(f"rebid.1H1S.{c}", r, a, c, en, sh, forcing=f, pri=pri, conf=d)
    gz = src(NOTES, "p.6 Gazzilli (bid72 sheet)")
    gi = "source-interpreted"
    for M in MAJ:
        a = f"P* 1{M} P 1N P ?"
        p = f"rebid.1{M}1N"
        if ss(B):
            B.add(f"{p}.2C", r, a, "2C", "Gazzilli: 11-15 natural/balanced, or any 16+",
                  cs(hcp=(11, 22), **{M: (5, 13)}), forcing="F1", alert=True, art=True, pri=40, source=gz,
                  conf=gi, notes="Gap G-GAZ-1: bid72 version assumed.")
            B.add(f"{p}.2D", r, a, "2D", "11-15, natural 4+♦", cs(hcp=(11, 15), D=(4, 13)), pri=45, source=gz, conf=gi)
            if M == "S":
                B.add(f"{p}.2H", r, a, "2H", "11-15, natural 4+♥", cs(hcp=(11, 15), H=(4, 13)), pri=46, source=gz, conf=gi)
                B.add(f"{p}.2S", r, a, "2S", "11-14, 6♠", cs(hcp=(11, 14), S=(6, 13)), pri=47, source=gz, conf=gi)
                B.add(f"{p}.2N", r, a, "2N", "GF, 5♠ + another 5-card suit", cs(hcp=(16, 22), S=(5, 13),
                      anyOf=[cs(H=(5, 13)), cs(D=(5, 13)), cs(C=(5, 13))]), forcing="GF", alert=True, art=True, pri=50, source=gz, conf=gi)
                B.add(f"{p}.3S", r, a, "3S", "GF, 6+♠", cs(hcp=(16, 22), S=(6, 13)), forcing="GF", pri=48, source=gz, conf=gi)
                B.add(f"{p}.3H", r, a, "3H", "Invitational, 5♠ + 5♥", cs(hcp=(14, 16), S=(5, 13), H=(5, 13)), forcing="invite", pri=49, source=gz, conf=gi)
            else:
                B.add(f"{p}.2H", r, a, "2H", "11-14, 6♥", cs(hcp=(11, 14), H=(6, 13)), pri=47, source=gz, conf=gi)
                B.add(f"{p}.2S", r, a, "2S", "18+, natural 4♠", cs(hcp=(18, 22), S=(4, 13)), forcing="F1", pri=46, source=gz, conf=gi)
                B.add(f"{p}.2N", r, a, "2N", "GF, 5♥ + 5-card minor", cs(hcp=(16, 22), H=(5, 13), anyOf=[cs(D=(5, 13)), cs(C=(5, 13))]),
                      forcing="GF", alert=True, art=True, pri=50, source=gz, conf=gi)
                B.add(f"{p}.3H", r, a, "3H", "GF, 6+♥", cs(hcp=(16, 22), H=(6, 13)), forcing="GF", pri=48, source=gz, conf=gi)
            for m in MIN:
                B.add(f"{p}.3{m}", r, a, f"3{m}", f"Invitational, 5{SYM[M]} + 5{SYM[m]}", cs(hcp=(14, 16), **{M: (5, 13)}, **{m: (5, 13)}),
                      forcing="invite", pri=49, source=gz, conf=gi)
            B.add(f"{p}.3N", r, a, "3N", f"6{SYM[M]} balanced, choice of games", cs(hcp=(16, 19), **{M: (6, 6)}, shape="semibalanced"),
                  pri=48, source=gz, conf=gi)
            a2 = f"P* 1{M} P 1N P 2C P ?"
            q = f"resp2.1{M}1N2C"
            rr = "responder-rebid"
            B.add(f"{q}.2D", rr, a2, "2D", "8+, any (game forcing opposite 16+)", cs(hcp=(8, 12)),
                  forcing="F1", alert=True, art=True, pri=50, source=gz, conf=gi)
            B.add(f"{q}.2{M}", rr, a2, f"2{M}", "5-7, no other descriptive bid", cs(hcp=(3, 7)), pri=30, source=gz, conf=gi)
            B.add(f"{q}.3{M}", rr, a2, f"3{M}", f"3-card {SYM[M]}, invitational opposite 11-15",
                  cs(hcp=(9, 11), **{M: (3, 3)}), forcing="invite", pri=45, source=gz, conf=gi)
            B.add(f"{q}.2N", rr, a2, "2N", "5-7, 5-5 minors", cs(hcp=(5, 7), C=(5, 13), D=(5, 13)), pri=44, source=gz, conf=gi)
            for m in MIN:
                B.add(f"{q}.3{m}", rr, a2, f"3{m}", f"5-7, 6+{SYM[m]}", cs(hcp=(5, 7), **{m: (6, 13)}), pri=40, source=gz, conf=gi)
            if M == "S":
                B.add(f"{q}.2H", rr, a2, "2H", "5-7, 5+♥", cs(hcp=(5, 7), H=(5, 13)), pri=41, source=gz, conf=gi)
                B.add(f"{q}.3H", rr, a2, "3H", "5-7, 6+♥", cs(hcp=(5, 7), H=(6, 13)), pri=42, source=gz, conf=gi)
            else:
                B.add(f"{q}.2S", rr, a2, "2S", "8+, 5-5 minors", cs(hcp=(8, 12), C=(5, 13), D=(5, 13)), pri=51, source=gz, conf=gi)
            a3 = f"P* 1{M} P 1N P 2C P 2D P ?"
            o3 = f"rebid3.1{M}1N2C2D"
            B.add(f"{o3}.2{M}", r, a3, f"2{M}", f"11-15, balanced or 5{SYM[M]}+4♣", cs(hcp=(11, 15)), pri=40, source=gz, conf=gi)
            B.add(f"{o3}.2N", r, a3, "2N", "16-17 balanced (or 18-19 per sheet layout)", cs(hcp=(16, 19), shape="balanced"),
                  forcing="GF", pri=45, source=gz, conf=gi)
            B.add(f"{o3}.3N", r, a3, "3N", "18-19 balanced", cs(hcp=(18, 19), shape="balanced"), pri=46, source=gz, conf=gi)
            B.add(f"{o3}.3{M}", r, a3, f"3{M}", f"15-17, 6{SYM[M]}", cs(hcp=(15, 17), **{M: (6, 13)}), pri=44, source=gz, conf=gi)
            if M == "H":
                B.add(f"{o3}.2S", r, a3, "2S", "16-17, 5♥4♠", cs(hcp=(16, 17), H=(5, 13), S=(4, 4)), forcing="GF", pri=47, source=gz, conf=gi)
            else:
                B.add(f"{o3}.2H", r, a3, "2H", "16+, 5♠4♥", cs(hcp=(16, 22), S=(5, 13), H=(4, 4)), forcing="GF", pri=47, source=gz, conf=gi)
            for m in MIN:
                B.add(f"{o3}.3{m}", r, a3, f"3{m}", f"16+, 5{SYM[M]}+4{SYM[m]}", cs(hcp=(16, 22), **{M: (5, 13)}, **{m: (4, 13)}),
                      forcing="GF", pri=46, source=gz, conf=gi)
        else:
            B.add(f"{p}.2C", r, a, "2C", "3+♣, natural", cs(hcp=(11, 18), C=(3, 13)), pri=40)
            B.add(f"{p}.2D", r, a, "2D", "3+♦, natural", cs(hcp=(11, 18), D=(3, 13)), pri=41)
            B.add(f"{p}.2{M}", r, a, f"2{M}", "6+, minimum", cs(hcp=(11, 14), **{M: (6, 13)}), pri=45)
            B.add(f"{p}.2N", r, a, "2N", "18-19 balanced", cs(hcp=(18, 19), shape="balanced"), forcing="invite", pri=46)
    for M in MAJ:
        a = f"P* 1{M} P 2{M} P ?"
        B.add(f"rebid.1{M}2{M}.P", r, a, "P", "Minimum", cs(hcp=(11, 15)), pri=0, conf=d)
        B.add(f"rebid.1{M}2{M}.3{M}", r, a, f"3{M}", "Invitational", cs(hcp=(15, 17), **{M: (5, 13)}), forcing="invite", pri=40, conf=d)
        B.add(f"rebid.1{M}2{M}.4{M}", r, a, f"4{M}", "To play: game values or shape", cs(hcp=(15, 22)), pri=42, conf=d)
        for s in SUITS:
            if s == M or (M == "H" and s == "S"):
                continue
            B.add(f"rebid.1{M}2{M}.3{s}", r, a, f"3{s}", f"Help-suit game try in {SYM[s]}",
                  cs(hcp=(15, 18), **{s: (3, 13)}), forcing="invite", pri=41, conf=d)
        if ss(B):
            a = f"P* 1{M} P 3D P ?"
            B.add(f"rebid.1{M}3D.3{M}", r, a, f"3{M}", "Declines the limit raise", cs(hcp=(11, 13)), pri=40, conf=d)
            B.add(f"rebid.1{M}3D.4{M}", r, a, f"4{M}", "Accepts", cs(hcp=(13, 22)), pri=41, conf=d)
        for s in ["C", "D"] + (["H"] if M == "S" else []):
            a = f"P* 1{M} P 2{s} P ?"
            p = f"rebid.1{M}2{s}"
            B.add(f"{p}.2{M}", r, a, f"2{M}", f"Default rebid (6+{SYM[M]} or minimum)", cs(hcp=(11, 22), **{M: (5, 13)}), forcing="GF", pri=35, conf=d)
            B.add(f"{p}.2N", r, a, "2N", "Balanced, stoppers in unbid suits", cs(hcp=(11, 22), shape="balanced"), forcing="GF", pri=36, conf=d)
            B.add(f"{p}.3{s}", r, a, f"3{s}", f"Support {SYM[s]}", cs(hcp=(11, 22), **{s: (3 if s == 'H' else 4, 13)}), forcing="GF", pri=40, conf=d)
            B.add(f"{p}.3{M}", r, a, f"3{M}", f"Solid/semi-solid 6+{SYM[M]}", cs(hcp=(14, 22), **{M: (6, 13)}, feat=[f"goodSuit:{M}"]), forcing="GF", pri=42, conf=d)
            for z in SUITS:
                if z in (M, s):
                    continue
                lvl = 2 if RANK[z] > RANK[s] else 3
                B.add(f"{p}.{lvl}{z}", r, a, f"{lvl}{z}", f"Natural, 4+{SYM[z]}", cs(hcp=(11, 22), **{z: (4, 13)}), forcing="GF", pri=38, conf=d)


def fourth_suit(B):
    """Encode the confirmed fourth-suit forcing convention in main 1m sequences."""
    if not ss(B):
        return
    c = "responder-rebid"
    q = src(SYSMD, "fourth-suit forcing; Sotirios confirmation 2026-10-04")
    rules = [
        ("1C1D1H1S", "P* 1C P 1D P 1H P ?", "1S", "F1"),
        ("1C1D1S2H", "P* 1C P 1D P 1S P ?", "2H", "F1"),
        ("1C1H1S2D", "P* 1C P 1H P 1S P ?", "2D", "F1"),
        ("1D1H1S2C", "P* 1D P 1H P 1S P ?", "2C", "F1"),
        ("1C1D1N2H", "P* 1C P 1D P 1N P ?", "2H", "F1"),
        ("1C1H1N2D", "P* 1C P 1H P 1N P ?", "2D", "F1"),
        ("1C1S1N2D", "P* 1C P 1S P 1N P ?", "2D", "F1"),
        ("1C1H2C2D", "P* 1C P 1H P 2C P ?", "2D", "GF"),
        ("1D1H2D2S", "P* 1D P 1H P 2D P ?", "2S", "GF"),
        ("1C1S2C2D", "P* 1C P 1S P 2C P ?", "2D", "GF"),
        ("1D1S2D2H", "P* 1D P 1S P 2D P ?", "2H", "GF"),
    ]
    for tag, a, call, forcing in rules:
        B.add(f"fourth-suit.{tag}", c, a, call,
              "Fourth suit forcing (artificial; no suit-length promise)", cs(), forcing=forcing, alert=True, art=True, pri=57,
              source=q, conf="source-interpreted",
              notes="G-REBID-5 answered: fourth suit is GF except when every previous bid was at level 1 (F1).")

    # Default responder meaning after opener's 2♠ rebid.
    for m in MIN:
        a = f"P* 1S P 2{m} P 2S P ?"
        B.add(f"resp2.1S2{m}2S.2N", "responder-rebid", a, "2N",
              "Natural, game forcing, balanced/semi-balanced, no 3-card ♠ support",
              cs(shape="semibalanced", S=(0, 2)), forcing="GF", pri=52, source=q, conf="source-interpreted",
              notes="Gap 14 default encoded; 2NT denies 3-card spade support.")


# ---------------------------------------------------------------- NT structures
def nt_structures(B):
    c = "nt-structure"
    d = "default-assumed"
    s1 = src(CC, "p.2 1NT row") if ss(B) else None
    a = "P* 1N P ?"
    B.add("nt1.pass", c, a, "P", "Weak, no action", cs(hcp=(0, 7)), pri=0, conf=d)
    B.add("nt1.2C", c, a, "2C", "Stayman, non-forcing (may be weak)",
          cs(anyOf=[cs(hcp=(8, 37), anyOf=[cs(H=(4, 13)), cs(S=(4, 13))]), cs(hcp=(0, 7), S=(4, 5), H=(4, 5), C=(0, 1))]),
          forcing="F1", art=True, pri=50, source=s1, conf="source-interpreted", notes="Weak (garbage) Stayman read from 'NF Stayman'.")
    B.add("nt1.2D", c, a, "2D", "Transfer, 5+♥", cs(H=(5, 13)), forcing="F1", alert=True, art=True, pri=55, source=s1)
    B.add("nt1.2H", c, a, "2H", "Transfer, 5+♠", cs(S=(5, 13), cmp=[("S", ">=", "H")]), forcing="F1", alert=True, art=True, pri=56, source=s1)
    B.add("nt1.2S", c, a, "2S", "Transfer to ♣ (6+♣)", cs(C=(6, 13), H=(0, 3), S=(0, 3)), forcing="F1",
          alert=True, art=True, pri=52, source=s1, conf="source-interpreted")
    if ss(B):
        B.add("nt1.2N", c, a, "2N", "Transfer to ♦ (6+♦)", cs(D=(6, 13), H=(0, 3), S=(0, 3)), forcing="F1", alert=True, art=True,
              pri=52, source=s1, conf="source-interpreted", notes="No natural 2NT invite: invite via 2♣ then 2NT (default).")
    else:
        B.add("nt1.2N", c, a, "2N", "Natural invite 8-9", cs(hcp=(8, 9), shape="balanced", H=(0, 3), S=(0, 3)), forcing="invite", pri=40)
    B.add("nt1.3N", c, a, "3N", "To play, no 4-card major", cs(hcp=(10, 15), H=(0, 3), S=(0, 3)), pri=40, conf=d)
    B.add("nt1.4C", c, a, "4C", "Gerber (aces)", cs(hcp=(16, 37)), forcing="asking", art=True, pri=45, source=s1, conf="source-interpreted")
    for s, t in (("D", "H"), ("H", "S")):
        B.add(f"nt1.4{s}", c, a, f"4{s}", f"Texas transfer, 6+{SYM[t]}, game values", cs(hcp=(9, 15), **{t: (6, 13)}),
              forcing="F1", alert=True, art=True, pri=57, conf=d)
    B.add("nt1.4N", c, a, "4N", "Quantitative slam invite", cs(hcp=(16, 17), shape="balanced", H=(0, 3), S=(0, 3)),
          forcing="invite", pri=41, conf=d)
    if ss(B):
        for s in SUITS:
            B.add(f"nt1.3{s}.slam", c, a, f"3{s}", f"Strong hand, 6+{SYM[s]}, slam interest",
                  cs(**{s: (6, 13)}), forcing="GF", pri=58, source=s1, conf="source-interpreted",
                  notes="G-NT-1 answered: strong 6+ suit, slam interest, game forcing.")
    if ss(B):
        # Runout after a double of 1NT: XX and 2-level bids are transfers; a
        # pass forces opener's redouble, followed by the lowest 4-card suit.
        a = "P* 1N X ?"
        B.add("nt1.ovX.XX", c, a, "XX", "Transfer to ♣, 5+♣", cs(C=(5, 13)), forcing="F1", alert=True, art=True, pri=58, source=s1, conf="source-interpreted", notes="G-NT-3 answered.")
        for call, suit in (("2C", "D"), ("2D", "H"), ("2H", "S")):
            B.add(f"nt1.ovX.{call}", c, a, call, f"Transfer to {SYM[suit]}, 5+{SYM[suit]}", cs(**{suit: (5, 13)}),
                  forcing="F1", alert=True, art=True, pri=58, source=s1, conf="source-interpreted", notes="G-NT-3 answered.")
        B.add("nt1.ovX.P", c, a, "P", "Forcing pass; opener must redouble", cs(), forcing="forcing-pass", pri=57, source=s1, conf="source-interpreted", notes="G-NT-3 answered.")
        a = "P* 1N X P ?"
        B.add("nt1.ovX.P.XX", c, a, "XX", "Forced redouble", cs(), forcing="response", pri=58, source=s1, conf="source-interpreted", notes="G-NT-3 answered.")
        a = "P* 1N X P XX P ?"
        escapes = [("2C", "C", {}), ("2D", "D", {"C": (0, 3)}), ("2H", "H", {"C": (0, 3), "D": (0, 3)}), ("2S", "S", {"C": (0, 3), "D": (0, 3), "H": (0, 3)})]
        for call, suit, lower in escapes:
            kw = {suit: (4, 13), **lower}
            B.add(f"nt1.ovX.escape.{call}", c, a, call, f"Lowest 4-card suit escape: 4+{SYM[suit]}", cs(**kw),
                  forcing="response", pri=55, source=s1, conf="source-interpreted", notes="G-NT-3 answered: lowest 4-card suit after forced redouble.")
    a = "P* 1N P 2C P ?"
    B.add("nt1.2C.2D", c, a, "2D", "No 4-card major", cs(H=(0, 3), S=(0, 3)), forcing="response", art=True, pri=50, conf=d)
    B.add("nt1.2C.2H", c, a, "2H", "4+♥ (may hold 4♠)", cs(H=(4, 13)), forcing="response", pri=52, conf=d)
    B.add("nt1.2C.2S", c, a, "2S", "4♠, not 4♥", cs(S=(4, 13), H=(0, 3)), forcing="response", pri=51, conf=d)
    a = "P* 1N P 2C P 2D P ?"
    for s, o2 in (("H", "S"), ("S", "H")):
        B.add(f"nt1.2C2D.3{s}", c, a, f"3{s}", f"Smolen: 4{SYM[s]} + 5{SYM[o2]}, game force", cs(hcp=(10, 37), **{s: (4, 4)}, **{o2: (5, 5)}),
              forcing="GF", alert=True, art=True, pri=55, source=s1, conf="source-interpreted")
    B.add("nt1.2C2D.2N", c, a, "2N", "Invitational, 4-card major", cs(hcp=(8, 9)), forcing="invite", pri=40, conf=d)
    B.add("nt1.2C2D.3N", c, a, "3N", "Game values, 4-card major", cs(hcp=(10, 15)), pri=41, conf=d)
    B.add("nt1.2C2D.P", c, a, "P", "Weak Stayman, diamonds", cs(hcp=(0, 7)), pri=0, conf=d)
    for t, x in (("H", "2D"), ("S", "2H")):
        a = f"P* 1N P {x} P ?"
        B.add(f"nt1.{x}.2{t}", c, a, f"2{t}", "Completes transfer", cs(), forcing="response", pri=40, conf=d)
        B.add(f"nt1.{x}.3{t}", c, a, f"3{t}", "Super-accept: 4-card support, maximum", cs(hcp=(17, 17), **{t: (4, 13)}),
              forcing="invite", pri=45, conf=d, notes="Gap G-NT-2.")
        a = f"P* 1N P {x} P 2{t} P ?"
        B.add(f"nt1.{x}2{t}.P", c, a, "P", "Weak, to play", cs(hcp=(0, 7)), pri=0, conf=d)
        B.add(f"nt1.{x}2{t}.2N", c, a, "2N", f"Invitational, exactly 5{SYM[t]}", cs(hcp=(8, 9), **{t: (5, 5)}), forcing="invite", pri=40, conf=d)
        B.add(f"nt1.{x}2{t}.3N", c, a, "3N", f"Choice of games, exactly 5{SYM[t]}", cs(hcp=(10, 15), **{t: (5, 5)}, shape="semibalanced"), pri=41, conf=d)
        B.add(f"nt1.{x}2{t}.3{t}", c, a, f"3{t}", f"Invitational, 6+{SYM[t]}", cs(hcp=(8, 9), **{t: (6, 13)}), forcing="invite", pri=42, conf=d)
        B.add(f"nt1.{x}2{t}.4{t}", c, a, f"4{t}", f"To play, 6+{SYM[t]}", cs(hcp=(10, 15), **{t: (6, 13)}), pri=43, conf=d)
    for s in ["D", "H", "S"]:
        a = f"P* 1N 2{s} ?"
        cr = "competitive-responder"
        B.add(f"nt1.ov2{s}.P", cr, a, "P", "No action", cs(hcp=(0, 7)), pri=0, conf=d)
        B.add(f"nt1.ov2{s}.X", cr, a, "X", "Takeout (card: double after an overcall = T/O)",
              cs(hcp=(8, 37), **{s: (0, 2)}), forcing="F1", pri=50, source=s1, conf="source-interpreted" if ss(B) else d)
        B.add(f"nt1.ov2{s}.2N", cr, a, "2N", "Lebensohl relay to 3♣ (weak sign-off or slow-shows sequences)",
              cs(), forcing="relay", alert=True, art=True, pri=45, source=src(CC, "p.1 special bids: Lebensohl after 1NT") if ss(B) else None,
              conf="source-interpreted")
        B.add(f"nt1.ov2{s}.3{s}", cr, a, f"3{s}", "Cue: Stayman-like, game values, no stopper (fast denies)",
              cs(hcp=(10, 37), anyOf=[cs(H=(4, 13)), cs(S=(4, 13))], notAny=[cs(feat=[f"stopper:{s}"])]),
              forcing="GF", alert=True, art=True, pri=48, conf=d)
        B.add(f"nt1.ov2{s}.3N", cr, a, "3N", "Fast 3NT: game values, no stopper", cs(hcp=(10, 15), notAny=[cs(feat=[f"stopper:{s}"])]), pri=46, conf=d)
    m = src(NOTES, "p.7-8 2NT Responses tree") if ss(B) else None
    a = "P* 2N P ?"
    B.add("nt2.pass", c, a, "P", "Weak", cs(hcp=(0, 3)), pri=0, conf=d)
    B.add("nt2.3N", c, a, "3N", "To play", cs(hcp=(4, 10), H=(0, 3), S=(0, 3)), pri=40, conf=d)
    if ss(B):
        B.add("nt2.3C", c, a, "3C", "Puppet Stayman (may hold 5♠4♥, not 5♥4♠)", cs(hcp=(4, 37), anyOf=[cs(H=(3, 4)), cs(S=(3, 5))],
              notAny=[cs(H=(5, 13), S=(4, 13))]), forcing="F1", art=True, pri=50, source=m)
        B.add("nt2.3D", c, a, "3D", "Transfer, 5+♥ (may hold 4♠)", cs(H=(5, 13)), forcing="F1", alert=True, art=True, pri=55, source=m)
        B.add("nt2.3H", c, a, "3H", "Transfer, 5+♠, denies ♥", cs(S=(5, 13), H=(0, 3)), forcing="F1", alert=True, art=True, pri=55, source=m)
        B.add("nt2.3S", c, a, "3S", "Slam try in the minors", cs(hcp=(11, 37), H=(0, 3), S=(0, 3)), forcing="GF", alert=True, art=True, pri=45, source=m)
        B.add("nt2.4C", c, a, "4C", "Texas: 6+♥", cs(H=(6, 13)), forcing="F1", alert=True, art=True, pri=56, source=m)
        B.add("nt2.4D", c, a, "4D", "Texas: 6+♠", cs(S=(6, 13)), forcing="F1", alert=True, art=True, pri=56, source=m)
        B.add("nt2.4H", c, a, "4H", "6+♥ slam try", cs(hcp=(10, 37), H=(6, 13)), forcing="GF", alert=True, art=True, pri=46, source=m,
              conf="source-interpreted", notes="Source error corrected per Sotirios 2026-10-04.")
        B.add("nt2.4S", c, a, "4S", "6+♦ slam try", cs(hcp=(10, 37), D=(6, 13)), forcing="GF", alert=True, art=True, pri=46, source=m,
              conf="source-interpreted", notes="Source error corrected per Sotirios 2026-10-04.")
        a = "P* 2N P 3C P ?"
        B.add("nt2.3C.3D", c, a, "3D", "One or both 4-card majors", cs(anyOf=[cs(H=(4, 4)), cs(S=(4, 4))]),
              forcing="response", alert=True, art=True, pri=50, source=m)
        B.add("nt2.3C.3H", c, a, "3H", "No 4- or 5-card major", cs(H=(0, 3), S=(0, 3)), forcing="response", alert=True, art=True, pri=49, source=m)
        B.add("nt2.3C.3S", c, a, "3S", "5♠", cs(S=(5, 5)), forcing="response", pri=51, source=m)
        B.add("nt2.3C.3N", c, a, "3N", "5♥", cs(H=(5, 5)), forcing="response", alert=True, art=True, pri=51, source=m)
        for x, t in (("3D", "H"), ("3H", "S")):
            a = f"P* 2N P {x} P ?"
            B.add(f"nt2.{x}.3{t}", c, a, f"3{t}", f"Exactly 3{SYM[t]}", cs(**{t: (3, 3)}), forcing="response", pri=50, source=m,
                  notes="CC p.2: '3M after 3M-1 shows 3-card fit'.")
            B.add(f"nt2.{x}.3N", c, a, "3N", f"Fewer than 3{SYM[t]}" + (", no 4♠" if t == "H" else ""),
                  cs(**{t: (2, 2)}, **({"S": (0, 3)} if t == "H" else {})), forcing="response", pri=48, source=m)
            if t == "H":
                B.add("nt2.3D.3S", c, a, "3S", "4+♠, not 3♥", cs(S=(4, 13), H=(2, 2)), forcing="response", pri=49, source=m)
    else:
        B.add("nt2.3C", c, a, "3C", "Stayman", cs(hcp=(4, 37), anyOf=[cs(H=(4, 13)), cs(S=(4, 13))]), forcing="F1", art=True, pri=50)
        B.add("nt2.3D", c, a, "3D", "Transfer, 5+♥", cs(H=(5, 13)), forcing="F1", alert=True, art=True, pri=55)
        B.add("nt2.3H", c, a, "3H", "Transfer, 5+♠", cs(S=(5, 13)), forcing="F1", alert=True, art=True, pri=55)


def strong_2c(B):
    c = "strong-2c"
    s1 = src(CC, "p.2 2♣ row") if ss(B) else None
    k = src(NOTES, "p.4 Kokish") if ss(B) else None
    a = "P* 2C P ?"
    B.add("2c.2D", c, a, "2D", "Waiting (no good 5-card major / 6-card minor positive)", cs(), forcing="GF", alert=True, art=True, pri=40, source=s1)
    for M in MAJ:
        B.add(f"2c.2{M}", c, a, f"2{M}", f"Positive, good 5+{SYM[M]}", cs(hcp=(6, 37), **{M: (5, 13)}, feat=[f"goodSuit:{M}"]), forcing="GF", pri=50,
              source=s1, conf="source-interpreted", notes="HCP floor 6 assumed.")
    for m in MIN:
        B.add(f"2c.3{m}", c, a, f"3{m}", f"Positive, good 6+{SYM[m]}", cs(hcp=(6, 37), **{m: (6, 13)}, feat=[f"goodSuit:{m}"]), forcing="GF", pri=50,
              source=s1, conf="source-interpreted")
    a = "P* 2C P 2D P ?"
    B.add("2c2d.2N", c, a, "2N", "22-23 balanced", cs(hcp=(22, 23), shape="balanced"), pri=60, source=s1)
    if ss(B):
        B.add("2c2d.2H", c, a, "2H", "Kokish: hearts, or 24+ balanced (forces 2♠)", cs(anyOf=[cs(hcp=(19, 37), H=(5, 13)), cs(hcp=(24, 37), shape="balanced")]),
              forcing="relay", alert=True, art=True, pri=55, source=k)
        B.add("2c2d.2S", c, a, "2S", "Natural, 5+♠", cs(hcp=(19, 37), S=(5, 13)), forcing="GF", pri=54, conf="default-assumed")
        B.add("2c2d.3C", c, a, "3C", "5+♣, may hold a 4-card major", cs(hcp=(19, 37), C=(5, 13)), forcing="GF", pri=53, source=k)
        B.add("2c2d.3D", c, a, "3D", "5+♦, denies a 4-card major", cs(hcp=(19, 37), D=(5, 13), H=(0, 3), S=(0, 3)), forcing="GF", pri=53, source=k)
        for M in MAJ:
            B.add(f"2c2d.3{M}", c, a, f"3{M}", f"Exactly 4{SYM[M]} + 5+♦", cs(hcp=(19, 37), D=(5, 13), **{M: (4, 4)}), forcing="GF", alert=True, art=True, pri=56, source=k)
        a = "P* 2C P 2D P 2H P 2S P ?"
        B.add("2c2d2h2s.2N", c, a, "2N", "24+ balanced", cs(hcp=(24, 37), shape="balanced"), pri=60, source=k)
        B.add("2c2d2h2s.3H", c, a, "3H", "6+♥, forcing", cs(hcp=(19, 37), H=(6, 13)), forcing="GF", pri=58, source=k)
        a = "P* 2C P 2D P 2N P ?"
        B.add("2c2d2n.3C", c, a, "3C", "Muppet (as over 2NT): asks majors", cs(hcp=(2, 37)), forcing="F1", art=True, pri=50, source=s1)
    else:
        for s in MAJ:
            B.add(f"2c2d.2{s}", c, a, f"2{s}", f"Natural 5+{SYM[s]}", cs(hcp=(19, 37), **{s: (5, 13)}), forcing="GF", pri=55)
        for s in MIN:
            B.add(f"2c2d.3{s}", c, a, f"3{s}", f"Natural 5+{SYM[s]}", cs(hcp=(19, 37), **{s: (5, 13)}), forcing="GF", pri=54)


def weak_twos(B):
    c = "weak-two"
    if not ss(B):
        for s in ["D", "H", "S"]:
            a = f"P* 2{s} P ?"
            B.add(f"w2.2{s}.P", c, a, "P", "No game interest", cs(hcp=(0, 14)), pri=0)
            B.add(f"w2.2{s}.2N", c, a, "2N", "Feature/Ogust ask, game interest", cs(hcp=(15, 37)), forcing="F1", alert=True, art=True, pri=50)
            B.add(f"w2.2{s}.3{s}", c, a, f"3{s}", "Preemptive raise", cs(hcp=(0, 13), **{s: (3, 13)}), pri=40)
            B.add(f"w2.2{s}.game", c, a, f"4{s}" if s != "D" else "5D", "To play / preemptive", cs(**{s: (3, 13)}), pri=41)
        return
    w = lambda pg: src(NOTES, f"Wild Aggressor {pg}")
    relay = {"D": "2N", "H": "2S", "S": "2N"}
    for s in ["D", "H", "S"]:
        a = f"P* 2{s} P ?"
        B.add(f"w2.2{s}.P", c, a, "P", "No reason to act", cs(), pri=0, source=w("p.11"))
        B.add(f"w2.2{s}.relay", c, a, relay[s], "Forcing relay (HCP + trumps >= 18)" + (": singleton ask" if s == "D" else ": Martens steps"),
              cs(hpl=(s, 18)), forcing="relay", alert=True, art=True, pri=60, source=w("p.10-11; CC p.2"))
        B.add(f"w2.2{s}.4C", c, a, "4C", "Poor Man's Keycard (01122)", cs(hcp=(14, 37), **{s: (3, 13)}), forcing="asking", art=True,
              pri=62, source=w("p.14; CC p.2"))
        B.add(f"w2.2{s}.3{s}", c, a, f"3{s}", "Preemptive raise (LOTT)", cs(hcp=(0, 12), **{s: (3 if s != "D" else 4, 13)}), pri=40, source=w("p.11, p.15"))
        B.add(f"w2.2{s}.3N", c, a, "3N", "To play", cs(hcp=(15, 37)), pri=45, source=w("p.11"))
        if s != "D":
            B.add(f"w2.2{s}.4{s}", c, a, f"4{s}", "Preemptive raise, 4+ trumps, or to make", cs(**{s: (4, 13)}), pri=41, source=w("p.11"))
        else:
            B.add("w2.2D.4D", c, a, "4D", "Preemptive raise, 5+♦, very weak", cs(hcp=(0, 9), D=(5, 13)), pri=41, source=w("p.11"))
    a = "P* 2D P ?"
    for t in MAJ:
        B.add(f"w2.2D.2{t}", c, a, f"2{t}", f"NF correction: 5{SYM[t]}, short ♦", cs(hcp=(0, 15), **{t: (5, 13)}, D=(0, 1)), pri=35, source=w("p.11; CC p.2"))
        B.add(f"w2.2D.3{t}", c, a, f"3{t}", f"Forcing jump: strong {SYM[t]} suit, GF", cs(hcp=(14, 37), **{t: (6, 13)}, feat=[f"goodSuit:{t}"]),
              forcing="GF", pri=50, source=w("p.11"), notes="CC silent; Notes p.11 says GF (system-2over1.md A.8).")
    B.add("w2.2D.3C", c, a, "3C", "NF correction: 6♣", cs(hcp=(0, 15), C=(6, 13), D=(0, 1)), pri=35, source=w("p.11; CC p.2"))
    a = "P* 2H P ?"
    B.add("w2.2H.2N", c, a, "2N", "NF: own 5+♠ (2♠ is the relay)", cs(hcp=(0, 15), S=(5, 13), H=(0, 1)), alert=True, art=True, pri=35, source=w("p.10-11; CC p.2"))
    B.add("w2.2H.3S", c, a, "3S", "Game forcing, strong ♠ suit", cs(hcp=(14, 37), S=(6, 13), feat=["goodSuit:S"]), forcing="GF", pri=50, source=w("p.11"))
    for m in MIN:
        B.add(f"w2.2H.3{m}", c, a, f"3{m}", f"NF correction, 5+{SYM[m]}", cs(hcp=(0, 15), **{m: (5, 13)}, H=(0, 1)), pri=35, source=w("p.11"))
    a = "P* 2S P ?"
    for t in ["C", "D", "H"]:
        B.add(f"w2.2S.3{t}", c, a, f"3{t}", f"NF to play, long {SYM[t]}, short ♠", cs(hcp=(0, 15), **{t: (5, 13)}, S=(0, 1)), pri=35, source=w("p.11; CC p.2"))
    steps = ["2N", "3C", "3D", "3H", "3S", "3N"]
    desc = [("Max 9-11, 6 cards", (9, 11), (6, 6)), ("Max 9-11, 5 cards", (9, 11), (5, 5)),
            ("Min 6-8, 6 cards", (6, 8), (6, 6)), ("Min 6-8, 5 cards", (6, 8), (5, 5)),
            ("Solid 6-card suit (AKQxxx+)", (6, 11), (6, 6))]
    for s in MAJ:
        a = f"P* 2{s} P {relay[s]} P ?"
        start = 0 if s == "H" else 1
        for i, (en, h, ln) in enumerate(desc):
            ft = [f"solidSuit:{s}"] if i == 4 else None
            B.add(f"w2.2{s}.relay.step{i+1}", c, a, steps[start + i], f"Step {i+1}: {en}", cs(hcp=h, **{s: ln}, feat=ft), forcing="response",
                  alert=True, art=True, pri=50 + (5 if i == 4 else 0), source=w("p.12; CC p.2"))
        for m in MIN:
            B.add(f"w2.2{s}.relay.4{m}", c, a, f"4{m}", f"5{SYM[s]} + 5{SYM[m]}", cs(**{s: (5, 5)}, **{m: (5, 5)}), forcing="response",
                  alert=True, art=True, pri=56, source=w("p.12"))
    a = "P* 2D P 2N P ?"
    for t, call in (("C", "3C"), ("H", "3H"), ("S", "3S")):
        B.add(f"w2.2D.relay.{call}", c, a, call, f"Singleton {SYM[t]}", cs(**{t: (1, 1)}), forcing="response", alert=True, art=True, pri=52, source=w("p.12"))
    B.add("w2.2D.relay.3D", c, a, "3D", "Minimum 6-8, no singleton", cs(hcp=(6, 8), feat=["noSingleton"]), forcing="response", pri=50, source=w("p.12"))
    B.add("w2.2D.relay.3N", c, a, "3N", "Maximum 9-11, no singleton", cs(hcp=(9, 11), feat=["noSingleton"]), forcing="response", pri=51, source=w("p.12"))
    B.add("w2.2D.relay.4C", c, a, "4C", "5♦ + 5♣", cs(D=(5, 5), C=(5, 13)), forcing="response", alert=True, art=True, pri=55, source=w("p.12; CC p.2"))
    for s in ["D", "H", "S"]:
        for lvl in ("2", "3"):
            a = f"P* {lvl}{s} P 4C P ?"
            for call, kc, q in (("4D", [0], None), ("4H", [1], False), ("4S", [1], True), ("4N", [2], False), ("5C", [2], True)):
                B.add(f"pmkc.{lvl}{s}.{call}", "slam", a, call,
                      f"PMKC reply: {kc[0]} keycard(s)" + ("" if q is None else (" with trump Q" if q else " without trump Q")),
                      cs(keycards=(s, kc), tq=q), forcing="response", art=True, pri=50, source=w("p.14"),
                      conf="source-interpreted", notes="Keycard-based (Wild Aggressor) vs ace-based (vault): gap G-SLAM-1. Disclosed after the auction, not alerted (ΕΟΜ §6.7.5).")


def preempt_responses(B):
    c = "preempt"
    for s in SUITS:
        a = f"P* 3{s} P ?"
        B.add(f"pre.3{s}.P", c, a, "P", "No game interest", cs(hcp=(0, 15)), pri=0, conf="default-assumed")
        for t in SUITS:
            if RANK[t] > RANK[s]:
                B.add(f"pre.3{s}.3{t}", c, a, f"3{t}", f"New suit forcing, 5+{SYM[t]}", cs(hcp=(14, 37), **{t: (5, 13)}), forcing="F1", pri=40,
                      source=src(CC, "p.2 3-level rows") if ss(B) else None, conf="source-interpreted" if ss(B) else "default-assumed")
        B.add(f"pre.3{s}.3N", c, a, "3N", "To play", cs(hcp=(15, 37)), pri=42, conf="default-assumed")
        if s in MAJ:
            B.add(f"pre.3{s}.4{s}", c, a, f"4{s}", "To play / preemptive raise", cs(**{s: (2, 13)}), pri=41, conf="default-assumed")
        if ss(B):
            if s == "C":
                B.add("pre.3C.4D", c, a, "4D", "Forcing raise (4♣ is not PMKC over 3♣)", cs(hcp=(14, 37), C=(3, 13)), forcing="F1", pri=45, source=src(NOTES, "Wild Aggressor p.14"))
            else:
                B.add(f"pre.3{s}.4C", c, a, "4C", "Poor Man's Keycard", cs(hcp=(15, 37), **{s: (2, 13)}), forcing="asking", art=True, pri=48, source=src(NOTES, "Wild Aggressor p.14"))
    if ss(B):
        a = "P* 3N P ?"
        B.add("pre.3N.4C", c, a, "4C", "Pass or correct: choose your minor", cs(), forcing="pass-or-correct", pri=40, source=src(CC, "p.2 3NT row"))
        for M in MAJ:
            B.add(f"pre.3N.4{M}", c, a, f"4{M}", "To play", cs(**{M: (6, 13)}), pri=45, source=src(CC, "p.2 3NT row"))
        B.add("pre.3N.P", c, a, "P", "To play (rare)", cs(hcp=(16, 37)), pri=0, conf="default-assumed")


def cheapest(after_lvl, after_suit, suit):
    return after_lvl if RANK[suit] > RANK[after_suit] else after_lvl + 1


# ---------------------------------------------------------------- competition
def competition(B):
    d = "default-assumed"
    co = "competitive-overcall"
    s_ov = src(CC, "p.1 Overcalls / Jump overcalls / Cue bids / 1NT overcall") if ss(B) else None
    for x in SUITS:
        a = f"P* 1{x} ?"
        B.add(f"ov.1{x}.P", co, a, "P", "No suitable action", cs(hcp=(0, 15)), pri=0, conf=d)
        B.add(f"ov.1{x}.X", co, a, "X", "Takeout: short in their suit, support for the unbid suits, or 17+ any",
              cs(anyOf=[cs(hcp=(12, 37), **{x: (0, 2)}, notAny=[cs(**{s: (0, 2)}) for s in SUITS if s != x]), cs(hcp=(17, 37))]),
              forcing="F1", pri=45, conf=d)
        B.add(f"ov.1{x}.1N", co, a, "1N", "15-18 balanced, stopper, system on", cs(hcp=(15, 18), shape="balanced", feat=[f"stopper:{x}"]),
              pri=55, source=s_ov)
        for s in SUITS:
            if s == x:
                continue
            lvl = cheapest(1, x, s)
            B.add(f"ov.1{x}.{lvl}{s}", co, a, f"{lvl}{s}", f"Παρεμβολή: natural 5+{SYM[s]}, {'8-16' if lvl == 1 else '10-16'}",
                  cs(hcp=(8, 16) if lvl == 1 else (10, 16), **{s: (5, 13)}), pri=40, conf=d)
            jl = lvl + 1
            if ss(B) and ((x in MIN and s == "D" and jl == 2) or (x in MAJ and s == "C" and jl == 3)):
                continue
            B.add(f"ov.1{x}.{jl}{s}.jump", co, a, f"{jl}{s}", f"Preemptive jump Παρεμβολή, 6+{SYM[s]}",
                  cs(hcp=(4, 10), **{s: (6, 13)}), pri=42, source=s_ov, conf="source-interpreted" if ss(B) else d)
        if ss(B):
            if x == "C":
                B.add("ov.1C.2C", co, a, "2C", "Natural (clubs)", cs(hcp=(10, 16), C=(5, 13)), pri=41, source=s_ov)
            if x in MIN:
                B.add(f"ov.1{x}.2D.majors", co, a, "2D", "Both majors, 5-5", cs(hcp=(6, 37), H=(5, 13), S=(5, 13)), alert=True, art=True, pri=50, source=s_ov)
                lo = [s for s in ["C", "D", "H"] if s != x][:2]
                B.add(f"ov.1{x}.2N", co, a, "2N", f"Two lowest unbid ({SYM[lo[0]]}+{SYM[lo[1]]}), 5-5", cs(hcp=(6, 37), **{lo[0]: (5, 13)}, **{lo[1]: (5, 13)}),
                      alert=True, art=True, pri=49, conf=d, notes="Gap G-COMP-2.")
            else:
                oM = "S" if x == "H" else "H"
                gh = src(CC, "p.1 Cue bids: (1M)-2M = Ghestem")
                gi = "source-interpreted"
                B.add(f"ov.1{x}.2N", co, a, "2N", "Ghestem: ♣+♦ 5-5", cs(hcp=(6, 37), C=(5, 13), D=(5, 13)), alert=True, art=True, pri=50, source=gh, conf=gi)
                B.add(f"ov.1{x}.3C.ghestem", co, a, "3C", f"Ghestem: {SYM[oM]}+♦ 5-5 (two highest)", cs(hcp=(6, 37), **{oM: (5, 13)}, D=(5, 13)),
                      alert=True, art=True, pri=50, source=gh, conf=gi, notes="Exact Ghestem variant: gap G-COMP-1.")
                B.add(f"ov.1{x}.2{x}", co, a, f"2{x}", f"Ghestem cue: {SYM[oM]}+♣ 5-5 (extremes)", cs(hcp=(6, 37), **{oM: (5, 13)}, C=(5, 13)),
                      alert=True, art=True, pri=50, source=gh, conf=gi)
        else:
            if x in MIN:
                B.add(f"ov.1{x}.2{x}", co, a, f"2{x}", "Michaels: both majors 5-5", cs(hcp=(6, 37), H=(5, 13), S=(5, 13)), alert=True, art=True, pri=50)
                B.add(f"ov.1{x}.2N", co, a, "2N", "Unusual: two lowest unbid", cs(hcp=(6, 37), **{("D" if x == "C" else "C"): (5, 13)}, H=(5, 13)), alert=True, art=True, pri=49)
            else:
                oM = "S" if x == "H" else "H"
                B.add(f"ov.1{x}.2{x}", co, a, f"2{x}", f"Michaels: {SYM[oM]} + a minor 5-5", cs(hcp=(6, 37), **{oM: (5, 13)}, anyOf=[cs(C=(5, 13)), cs(D=(5, 13))]), alert=True, art=True, pri=50)
                B.add(f"ov.1{x}.2N", co, a, "2N", "Unusual: both minors 5-5", cs(hcp=(6, 37), C=(5, 13), D=(5, 13)), alert=True, art=True, pri=49)
    cb = "competitive-balancing"
    for x in SUITS:
        a = f"P* 1{x} P P ?"
        rng = (12, 15) if x in MAJ else (11, 14)
        B.add(f"bal.1{x}.P", cb, a, "P", "Passes out", cs(hcp=(0, 10)), pri=0, conf=d)
        B.add(f"bal.1{x}.1N", cb, a, "1N", f"Balancing 1NT {rng[0]}-{rng[1]}, system on", cs(hcp=rng, shape="balanced"), pri=55,
              source=src(CC, "p.1 1NT overcall (4th seat)") if ss(B) else None)
        B.add(f"bal.1{x}.X", cb, a, "X", "Balancing takeout double (or 15-18 balanced planning 1NT)", cs(hcp=(9, 37), **{x: (0, 3)}), forcing="F1", pri=45, conf=d)
        for s in SUITS:
            if s == x:
                continue
            lvl = cheapest(1, x, s)
            B.add(f"bal.1{x}.{lvl}{s}", cb, a, f"{lvl}{s}", f"Natural, 5+{SYM[s]}", cs(hcp=(7, 15), **{s: (5, 13)}), pri=40, conf=d)
        if ss(B):
            for M in MAJ:
                if M != x and cheapest(1, x, M) == 1:
                    B.add(f"bal.1{x}.2{M}", cb, a, f"2{M}", f"Reopening jump: 5+{SYM[M]}, 10-13", cs(hcp=(10, 13), **{M: (5, 13)}), pri=50,
                          source=src(CC, "p.1 Reopen: 2M 5+M, 10-13"))
            B.add(f"bal.1{x}.2N", cb, a, "2N", "Reopening 2NT: 20-21 balanced, system on", cs(hcp=(20, 21), shape="balanced"), pri=56,
                  source=src(CC, "p.1 Reopen: 2NT 20-21"))
    cv = "competitive-vs-1nt"
    sv = src(CC, "p.1 Vs NT") if ss(B) else None
    for a, tag in (("P* 1N ?", "direct"), ("P* 1N P P ?", "bal")):
        B.add(f"vs1n.{tag}.P", cv, a, "P", "No action", cs(hcp=(0, 14)), pri=0, conf=d)
        if ss(B):
            B.add(f"vs1n.{tag}.X", cv, a, "X", "Penalty", cs(hcp=(15, 37)), pri=50, source=sv, conf="source-interpreted", notes="Strength 15+ assumed.")
            B.add(f"vs1n.{tag}.2C", cv, a, "2C", "Both majors (5-4+)", cs(hcp=(8, 37), H=(4, 13), S=(4, 13), anyOf=[cs(H=(5, 13)), cs(S=(5, 13))]), alert=True, art=True, pri=52, source=sv, conf="source-interpreted")
            B.add(f"vs1n.{tag}.2D", cv, a, "2D", "One major, 6 (5) cards", cs(hcp=(8, 37), anyOf=[cs(H=(5, 13), S=(0, 3)), cs(S=(5, 13), H=(0, 3))]), alert=True, art=True, pri=51, source=sv)
            for M in MAJ:
                B.add(f"vs1n.{tag}.2{M}", cv, a, f"2{M}", f"5{SYM[M]} + 4+ minor", cs(hcp=(8, 37), **{M: (5, 13)}, anyOf=[cs(C=(4, 13)), cs(D=(4, 13))]), alert=True, pri=53, source=sv)
            B.add(f"vs1n.{tag}.2N", cv, a, "2N", "4♥ + 5+ minor", cs(hcp=(8, 37), H=(4, 4), anyOf=[cs(C=(5, 13)), cs(D=(5, 13))]), alert=True, art=True, pri=53, source=sv)
            for m in MIN:
                B.add(f"vs1n.{tag}.3{m}", cv, a, f"3{m}", f"5+{SYM[m]} + 4♠", cs(hcp=(8, 37), **{m: (5, 13)}, S=(4, 4)), alert=True, art=True, pri=54, source=sv)
        else:
            B.add(f"vs1n.{tag}.X", cv, a, "X", "Penalty", cs(hcp=(15, 37)), pri=50)
            for s in SUITS:
                B.add(f"vs1n.{tag}.2{s}", cv, a, f"2{s}", f"Natural, 6+{SYM[s]} (or good 5)", cs(hcp=(8, 16), **{s: (5, 13)}), pri=45)
            B.add(f"vs1n.{tag}.2N", cv, a, "2N", "Both minors 5-5", cs(hcp=(8, 37), C=(5, 13), D=(5, 13)), alert=True, art=True, pri=46)
    if ss(B):
        for pat, tg in (("P P P 1N ?", "direct"), ("P 1N P P ?", "bal")):
            B.add(f"vs1n.ph.{tg}.X", cv, pat, "X", "Passed hand: 4-card major + 5+ minor",
                  cs(anyOf=[cs(H=(4, 4)), cs(S=(4, 4))], notAny=[cs(C=(0, 4), D=(0, 4))]), ph=True, alert=True, art=True, pri=51, source=sv)
    cp = "competitive-vs-preempt"
    sp = src(CC, "p.1 Vs preempts") if ss(B) else None
    for s in ["D", "H", "S"]:
        a = f"P* 2{s} ?"
        B.add(f"vsw2.2{s}.P", cp, a, "P", "No action", cs(hcp=(0, 15)), pri=0, conf=d)
        B.add(f"vsw2.2{s}.X", cp, a, "X", "Takeout", cs(hcp=(13, 37), **{s: (0, 2)}), forcing="F1", pri=45, source=sp)
        B.add(f"vsw2.2{s}.2N", cp, a, "2N", "15-18 balanced, stopper, system on", cs(hcp=(15, 18), shape="balanced", feat=[f"stopper:{s}"]), pri=50, source=sp)
        for t in SUITS:
            if t == s:
                continue
            lvl = cheapest(2, s, t)
            B.add(f"vsw2.2{s}.{lvl}{t}", cp, a, f"{lvl}{t}", f"Natural Παρεμβολή, good {5 if lvl == 2 else 6}+{SYM[t]}", cs(hcp=(11, 17), **{t: (5 if lvl == 2 else 6, 13)}), pri=40, conf=d)
        B.add(f"vsw2.2{s}.3N", cp, a, "3N", "To play: stopper, running suit or 19+", cs(hcp=(16, 22), feat=[f"stopper:{s}"]), pri=48, conf=d)
    for s in SUITS:
        a = f"P* 3{s} ?"
        B.add(f"vs3.3{s}.P", cp, a, "P", "No action", cs(hcp=(0, 16)), pri=0, conf=d)
        B.add(f"vs3.3{s}.X", cp, a, "X", "Takeout", cs(hcp=(13, 37), **{s: (0, 2)}), forcing="F1", pri=45, source=sp)
        B.add(f"vs3.3{s}.3N", cp, a, "3N", "To play, stopper", cs(hcp=(15, 22), feat=[f"stopper:{s}"]), pri=48, conf=d)
    cr = "competitive-responder"
    for m in SUITS:
        for x in SUITS:
            if x == m:
                continue
            lvl = cheapest(1, m, x)
            a = f"P* 1{m} {lvl}{x} ?"
            p = f"cr.1{m}.{lvl}{x}"
            B.add(f"{p}.P", cr, a, "P", "No action (may be a trap pass)", cs(), pri=0, conf=d)
            unbidM = [M for M in MAJ if M not in (m, x)]
            if unbidM:
                B.add(f"{p}.X", cr, a, "X", "Negative double: 4+ in the unbid major(s)",
                      cs(hcp=(6 if lvl == 1 else 8, 37), anyOf=[cs(**{M: (4, 13)}) for M in unbidM]), forcing="F1", pri=50,
                      source=src(CC, "p.1-2 Negative double through 4♥") if ss(B) else None, conf="source-interpreted" if ss(B) else d)
            if m in MAJ:
                rl = cheapest(lvl, x, m)
                B.add(f"{p}.raise", cr, a, f"{rl}{m}", f"Raise, 3+{SYM[m]}", cs(hcp=(6, 10), **{m: (3, 13)}), pri=45, conf=d)
                B.add(f"{p}.cue", cr, a, f"{lvl+1}{x}", f"Cue bid: limit raise or better in {SYM[m]}", cs(hcp=(10, 37), **{m: (3, 13)}),
                      forcing="F1", art=True, pri=48, conf=d)
            B.add(f"{p}.NT", cr, a, f"{lvl}N", "Natural, stopper", cs(hcp=(8, 10) if lvl == 1 else (11, 12), feat=[f"stopper:{x}"]), pri=40, conf=d)
            for s in SUITS:
                if s in (m, x):
                    continue
                sl = cheapest(lvl, x, s)
                if sl == 1:
                    B.add(f"{p}.1{s}", cr, a, f"1{s}", f"New suit, 4+{SYM[s]}, forcing", cs(hcp=(6, 37), **{s: (4, 13)}), forcing="F1", pri=44, conf=d)
                elif sl == 2:
                    B.add(f"{p}.2{s}", cr, a, f"2{s}", f"New suit, 5+{SYM[s]}, 10+, forcing", cs(hcp=(10, 37), **{s: (5, 13)}), forcing="F1", pri=44, conf=d)
    so = src(CC, "p.1 Over opponents' takeout double") if ss(B) else None
    for m in SUITS:
        a = f"P* 1{m} X ?"
        B.add(f"cr.1{m}X.P", cr, a, "P", "Weak", cs(hcp=(0, 9)), pri=0, conf=d)
        B.add(f"cr.1{m}X.XX", cr, a, "XX", "10+ HCP", cs(hcp=(10, 37)), forcing="F1", pri=50, source=so)
        if m in MAJ:
            B.add(f"cr.1{m}X.2N", cr, a, "2N", f"Jordan: limit raise+ with 4+{SYM[m]}", cs(hcp=(10, 37), **{m: (4, 13)}), forcing="F1", alert=True, art=True, pri=55, source=so)
            B.add(f"cr.1{m}X.2{m}", cr, a, f"2{m}", "Weak raise", cs(hcp=(4, 9), **{m: (3, 13)}), pri=45, conf=d)
            B.add(f"cr.1{m}X.3{m}", cr, a, f"3{m}", "Preemptive raise, 4+", cs(hcp=(0, 8), **{m: (4, 13)}), pri=46, conf=d)
        for s in SUITS:
            if RANK[s] > RANK[m]:
                B.add(f"cr.1{m}X.1{s}", cr, a, f"1{s}", f"New suit forcing one round, 4+{SYM[s]}", cs(hcp=(6, 37), **{s: (4, 13)}), forcing="F1", pri=44, source=so)
    co2 = "competitive-opener"
    for m, y in (("C", "D"), ("C", "H"), ("C", "S"), ("D", "H"), ("D", "S"), ("H", "S")):
        for x in SUITS:
            if x in (m, y):
                continue
            lvl = cheapest(1, y, x)
            a = f"P* 1{m} P 1{y} {lvl}{x} ?"
            B.add(f"co.1{m}1{y}.{lvl}{x}.X", co2, a, "X", f"Support double: exactly 3{SYM[y]}", cs(**{y: (3, 3)}), forcing="F1", alert=True, art=True,
                  pri=55, source=src(CC, "p.1 Supp Dbl") if ss(B) else None)
            if y in MAJ:
                B.add(f"co.1{m}1{y}.{lvl}{x}.raise", co2, a, f"{cheapest(lvl, x, y)}{y}", "4-card raise, minimum", cs(hcp=(11, 14), **{y: (4, 13)}), pri=54, conf=d)
            B.add(f"co.1{m}1{y}.{lvl}{x}.P", co2, a, "P", "Minimum, nothing to show", cs(hcp=(11, 15), **{y: (0, 2)}), pri=0, conf=d)
        a = f"P* 1{m} P 1{y} X ?"
        B.add(f"co.1{m}1{y}.X.XX", co2, a, "XX", f"Support redouble: exactly 3{SYM[y]}", cs(**{y: (3, 3)}), forcing="F1", alert=True, art=True,
              pri=55, source=src(CC, "p.1 Supp Rdbl") if ss(B) else None)
    ca = "competitive-advance"
    for x in SUITS:
        for s in SUITS:
            if s == x:
                continue
            lvl = cheapest(1, x, s)
            a = f"P* 1{x} {lvl}{s} P ?"
            p = f"adv.1{x}.{lvl}{s}"
            B.add(f"{p}.P", ca, a, "P", "No action", cs(hcp=(0, 10), **{s: (0, 3)}), pri=0, conf=d)
            B.add(f"{p}.raise", ca, a, f"{lvl+1}{s}", f"Simple raise, 3+{SYM[s]}", cs(hcp=(6, 10), **{s: (3, 13)}), pri=45, conf=d)
            cl = cheapest(lvl, s, x)
            if cl == 2:
                B.add(f"{p}.cue", ca, a, f"2{x}", "Cue bid at the 2-level: good hand, forcing", cs(hcp=(11, 37)), forcing="F1", art=True,
                      pri=48, source=src(CC, "p.1 Overcalls: cuebid at level 2 by advancer") if ss(B) else None)
            else:
                B.add(f"{p}.cue", ca, a, f"3{x}", f"Cue bid at the 3-level: 4+{SYM[s]}, limit raise or better", cs(hcp=(10, 37), **{s: (4, 13)}), forcing="F1", art=True,
                      pri=48, source=src(CC, "p.1 Overcalls: cuebid at the 3 level, fit 4+ limit+") if ss(B) else None)
            B.add(f"{p}.jumpraise", ca, a, f"{lvl+2}{s}", f"Preemptive jump raise, 4+{SYM[s]}", cs(hcp=(0, 9), **{s: (4, 13)}), pri=46, conf=d)
            B.add(f"{p}.NT", ca, a, f"{lvl}N", "Natural with stopper", cs(hcp=(8, 11) if lvl == 1 else (11, 13), feat=[f"stopper:{x}"]), pri=40, conf=d)
            for t in SUITS:
                if t in (x, s):
                    continue
                tl = cheapest(lvl, s, t)
                if tl <= 2:
                    B.add(f"{p}.{tl}{t}", ca, a, f"{tl}{t}", f"New suit, 5+{SYM[t]}" + (", forcing one round" if ss(B) and lvl == 1 and tl == 1 else ""),
                          cs(hcp=(8, 16), **{t: (5, 13)}), forcing="F1" if (ss(B) and lvl == 1 and tl == 1) else "NF", pri=42,
                          source=src(CC, "p.1 Overcalls: 1 over 1 is forcing") if (ss(B) and lvl == 1 and tl == 1) else None,
                          conf="source-interpreted" if (ss(B) and lvl == 1 and tl == 1) else d)
            if ss(B):
                B.add(f"{p}.XX", ca, f"P* 1{x} {lvl}{s} X ?", "XX", f"Shows A or K in {SYM[s]}", cs(feat=[f"topHonor:{s}"]), alert=True, art=True,
                      pri=50, source=src(CC, "p.1 Doubles: after our overcall is doubled, XX = A or K"))
    for x in SUITS:
        a = f"P* 1{x} X P ?"
        for s in SUITS:
            if s == x:
                continue
            lvl = cheapest(1, x, s)
            B.add(f"adv.1{x}X.{lvl}{s}", ca, a, f"{lvl}{s}", f"Minimum, 4+{SYM[s]}", cs(hcp=(0, 8), **{s: (4, 13)}), forcing="response", pri=40, conf=d)
            B.add(f"adv.1{x}X.{lvl+1}{s}", ca, a, f"{lvl+1}{s}", f"Jump: 9-11, 4+{SYM[s]}", cs(hcp=(9, 11), **{s: (4, 13)}), forcing="invite", pri=42, conf=d)
        B.add(f"adv.1{x}X.1N", ca, a, "1N", "6-9, stopper", cs(hcp=(6, 9), feat=[f"stopper:{x}"]), pri=41, conf=d)
        B.add(f"adv.1{x}X.cue", ca, a, f"2{x}", "Cue bid: 12+, forcing", cs(hcp=(12, 37)), forcing="F1", art=True, pri=45, conf=d)
        B.add(f"adv.1{x}X.P", ca, a, "P", "Penalty pass: long strong trumps", cs(hcp=(6, 37), **{x: (5, 13)}, feat=[f"goodSuit:{x}"]), pri=1, conf=d)
    if ss(B):
        w15 = src(NOTES, "Wild Aggressor p.15")
        for s in ["D", "H", "S"]:
            a = f"P* 2{s} X ?"
            B.add(f"w2X.2{s}.P", "weak-two", a, "P", "No action", cs(hcp=(0, 9)), pri=0, conf=d)
            B.add(f"w2X.2{s}.XX", "weak-two", a, "XX", "10+ HCP, creates a forcing pass", cs(hcp=(10, 37)), forcing="forcing-pass", pri=50, source=w15)
            B.add(f"w2X.2{s}.2N", "weak-two", a, "2N", "Only constructive forcing bid (16+); relay applies", cs(hcp=(16, 37)), forcing="relay", alert=True, art=True, pri=52, source=w15)
            B.add(f"w2X.2{s}.3{s}", "weak-two", a, f"3{s}", "Preemptive raise (LOTT)", cs(hcp=(0, 12), **{s: (3, 13)}), pri=45, source=w15)


# ---------------------------------------------------------------- slam and lead-directing doubles
def slam(B):
    c = "slam"
    sr = src(CC, "p.2 High level bidding") if ss(B) else None
    auctions = []
    for t in MAJ:
        auctions += [(t, f"P* 1{t} P 2{t} P 4N P ?"), (t, f"P* 1{t} P 3D P 4N P ?" if ss(B) else f"P* 1{t} P 3{t} P 4N P ?")]
    auctions += [("C", "P* 1C P 3C P 4N P ?"), ("D", "P* 1D P 3D P 4N P ?")]
    for t, lead in auctions:
        tag = "".join(lead.split()[1:4:2])
        resp = (("5C", [0, 3]), ("5D", [1, 4])) if ss(B) else (("5C", [1, 4]), ("5D", [0, 3]))
        for call, kc in resp:
            B.add(f"rkc.{tag}.{call}", c, lead, call, f"RKCB {'3014' if ss(B) else '1430'}: {kc[0]} or {kc[1]} keycards", cs(keycards=(t, kc)),
                  forcing="response", art=True, pri=50, source=sr)
        B.add(f"rkc.{tag}.5H", c, lead, "5H", "2 keycards without trump Q", cs(keycards=(t, [2]), tq=False), forcing="response", art=True, pri=50, source=sr)
        B.add(f"rkc.{tag}.5S", c, lead, "5S", "2 keycards with trump Q", cs(keycards=(t, [2]), tq=True), forcing="response", art=True, pri=50, source=sr)
        if ss(B):
            B.add(f"rkc.{tag}.5N", c, lead, "5N", "1 keycard + a useful void", cs(keycards=(t, [1]), feat=["void:any"]), forcing="response", art=True, pri=55,
                  source=sr, conf="source-interpreted", notes="Card says 'Aces'; keycards assumed. 6x below trumps = 2 + void in x; 6 trumps = 2 + void in a higher suit.")
    B.add("slam.4N.quant.P", c, "P* 1N P 4N P ?", "P", "Declines quantitative invite", cs(hcp=(15, 16)), pri=0, conf="default-assumed")
    B.add("slam.4N.quant.6N", c, "P* 1N P 4N P ?", "6N", "Accepts quantitative invite", cs(hcp=(17, 17)), pri=40, conf="default-assumed")
    sg = src(CC, "p.2 1NT row: Gerber") if ss(B) else None
    for call, n in (("4D", [0, 4]), ("4H", [1]), ("4S", [2]), ("4N", [3])):
        B.add(f"gerber.1N.{call}", c, "P* 1N P 4C P ?", call, f"Gerber reply: {'/'.join(map(str, n))} aces", cs(feat=[f"aces:{'|'.join(map(str, n))}"]),
              forcing="response", art=True, pri=50, source=sg, conf="source-interpreted" if ss(B) else "default-assumed",
              notes="Step replies 0/4,1,2,3 assumed.")
    dd = "defensive-doubles"
    sl = src(CC, "p.1 Doubles: Lead-directing dbl; Lightner") if ss(B) else None
    for art_call, suit, en in (("2C", "C", "Stayman"), ("2D", "D", "transfer"), ("2H", "H", "transfer")):
        a = f"P* 1N P {art_call} ?"
        B.add(f"ld.1N{art_call}.X", dd, a, "X", f"Lead-directing double of {en}: lead {SYM[suit]}", cs(**{suit: (4, 13)}, feat=[f"goodSuit:{suit}"]),
              pri=50, art=True, source=sl, conf="source-interpreted" if ss(B) else "default-assumed")
        B.add(f"ld.1N{art_call}.P", dd, a, "P", "No action", cs(), pri=0, conf="default-assumed")


def carding(profile):
    if profile != "ss":
        return None
    return {
        "source": src(CC, "p.1 Leads and signals"),
        "leadStyle": {"suit": "2nd/4th", "nt": "2nd/4th", "inPartnersSuit": "2nd/4th", "subsequent": "2nd from 3, high from 2"},
        "honourLeads": {
            "suit": {"A": "AKx(x) or A without K", "K": "AK doubleton or KQ+", "Q": "AQJ10(+), QJx", "J": "J109(+)", "10": "H10x(x), 10x", "9": "109x(x), 9x, 9"},
            "nt": {"A": "AK+ and count", "K": "AK for attitude", "Q": "QJ(x)", "J": "J10(+)", "10": "H10(x), 10x", "9": "109x(+), 109"}},
        "spotLeads": {"hiX": {"suit": "xXx(x), 10xxx (2nd)", "nt": "xXx(x)"}, "loX": {"suit": "HxX, HxxX", "nt": "HxX, HxxX"}},
        "signals": {"suit": {"partnersLead": ["attitude", "count"], "declarersLead": ["count", "preference"], "discards": ["attitude", "preference"]},
                    "nt": {"partnersLead": ["attitude", "preference", "count"], "declarersLead": ["count", "preference"], "discards": ["attitude", "preference"]},
                    "lowEncourages": True},
        "leadDirecting": ["Lightner double of slam", "lead-directing doubles of artificial bids",
                          "advancer's redouble = A or K in partner's suit", "after our overcall is doubled, XX = A or K"],
        "cardChoiceTable": [
            {"order": 1, "contract": "any", "holding": "singleton", "card": "the card", "confidence": "default-assumed"},
            {"order": 2, "contract": "any", "holding": "doubleton", "card": "top (10x -> 10, 9x -> 9)", "confidence": "source"},
            {"order": 3, "contract": "suit", "holding": "AK (doubleton)", "card": "K", "confidence": "source-interpreted", "gap": "G-LEAD-1"},
            {"order": 4, "contract": "suit", "holding": "AKx(x) (3+ cards)", "card": "A", "confidence": "source-interpreted", "gap": "G-LEAD-1"},
            {"order": 5, "contract": "nt", "holding": "AK + 5 or more cards (strong suit)", "card": "A, asks count/unblock", "confidence": "source-interpreted"},
            {"order": 6, "contract": "nt", "holding": "AK, AKx, AKxx", "card": "K, asks attitude", "confidence": "source-interpreted"},
            {"order": 7, "contract": "suit", "holding": "A without K", "card": "A", "confidence": "source-interpreted"},
            {"order": 8, "contract": "any", "holding": "KQ(+)", "card": "K", "confidence": "default-assumed", "gap": "G-LEAD-2"},
            {"order": 8, "contract": "suit", "holding": "AQJ10(+)", "card": "Q", "confidence": "source"},
            {"order": 9, "contract": "any", "holding": "QJ(x)", "card": "Q", "confidence": "source"},
            {"order": 10, "contract": "any", "holding": "J10(9)(x)", "card": "J", "confidence": "source"},
            {"order": 11, "contract": "any", "holding": "honour + 10 interior (KJ10x, AJ10x, K109x, Q109x, A109x)", "card": "10", "confidence": "source-interpreted", "gap": "G-LEAD-3"},
            {"order": 12, "contract": "any", "holding": "109x(x), no higher honour", "card": "9", "confidence": "source"},
            {"order": 13, "contract": "any", "holding": "Hxx (one honour, 3 cards)", "card": "lowest", "confidence": "source"},
            {"order": 14, "contract": "any", "holding": "honour + 3 or more others (Hxxx, Hxxxx)", "card": "4th best", "confidence": "source"},
            {"order": 15, "contract": "any", "holding": "no honour above 10 (xxx, xxxx, 10xxx)", "card": "2nd highest", "confidence": "source"}],
        "notes": "Rows are a reading of the CC lead table (H = A/K/Q/J). Book-derived card choice lives in lead-card-choice.json (separate job). For the user's own leads, this partnership table wins where they conflict."}


def conventions(profile):
    if profile != "ss":
        return []
    c2 = src(CC, "p.1-2")
    return [{"name": n, "source": c2, "status": s} for n, s in (
        ("Josephine (5NT grand slam force)", "listed on card; no pattern rules (rare in lead problems)"),
        ("Exclusion RKCB", "listed on card; jump to 5-level new suit = void there, asks keycards outside it (default details)"),
        ("P0D1 over interference to 4NT", "listed on card; pass = 0, double = 1, then steps"),
        ("5NT king ask: steps 0-3 / 1 / 2", "listed on card"),
        ("Queen ask after 5♣/5♦: steps", "listed on card; step details not given"),
        ("Maximal double", "listed on card; default meaning: game try when no room below 3M"),
        ("Responsive double", "listed on card; default meaning: takeout after partner's double/overcall is raised"),
        ("Lebensohl after their weak two (when partner doubles)", "listed on card; interpretation: 2NT relay by advancer"),
        ("Fourth suit forcing", "not on card; default-assumed game forcing at the 2-level"))]


def meta(profile):
    m = {"version": "0.1.0", "generated": "2026-10-04", "profile": profile,
         "constraintConventions": {"hcpSlack": 1, "shapeDefs": {
             "balanced": ["4333", "4432", "5332"], "semibalanced": ["4333", "4432", "5332", "5422", "6322"],
             "unbalanced": "not semibalanced"}, "suitOrder": ["S", "H", "D", "C"]}}
    if profile == "ss":
        m.update({"name": "Stelios–Sotos 2/1 (July 2026)",
                  "authority": "Stelios–Sotos CC (10 Jul 2026) + Notes PDF (8 Jul 2026) + Sotirios confirmations 2026-10-01",
                  "style": {"fiveCardMajors": True, "twoOverOneGF": True, "oneNTForcing": True, "notStrictAboutHcp": True, "psychics": "almost never"}})
    else:
        m.update({"name": "Opponents' default: standard 2/1, natural",
                  "authority": "plain standard 2/1, assumed for opponents whose system is unknown",
                  "style": {"fiveCardMajors": True, "twoOverOneGF": True, "oneNTForcing": True}})
    return m


def build(profile):
    B = Book(profile)
    for f in (openings, minor_responses, minor_rebids, major_responses, major_fit_shortness, major_rebids, fourth_suit, nt_structures, strong_2c,
              weak_twos, preempt_responses, competition, slam):
        f(B)
    out = {"$schema": "./system.schema.json", "meta": meta(profile), "rules": B.rules}
    if profile == "ss":
        out["carding"] = carding(profile)
        out["conventionsWithoutPatterns"] = conventions(profile)
    return out


if __name__ == "__main__":
    for prof, fn in (("ss", "system-stelios-sotos.json"), ("opps", "opponents-default-2over1.json")):
        d = build(prof)
        with open(os.path.join(OUT, fn), "w", encoding="utf-8") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=1)
        print(fn, len(d["rules"]), "rules")
