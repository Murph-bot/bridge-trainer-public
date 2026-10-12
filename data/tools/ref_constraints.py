#!/usr/bin/env python3
"""Reference (non-production) implementation of auction-to-constraints + rejection sampler.
Used to generate and check the worked examples in auction-to-constraints.md. Javier's TS port must reproduce
examples/worked-examples.json (constraint sets exactly; acceptance rates within sampling noise)."""
import json, os, random, time, sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
SUITS = "SHDC"
SEATS = "NESW"
HCPV = {"A": 4, "K": 3, "Q": 2, "J": 1}
RANKS = "AKQJT98765432"


def load(fn):
    return json.load(open(os.path.join(ROOT, fn), encoding="utf-8"))


SYSTEMS = {"ss": load("system-stelios-sotos.json"), "opps": load("opponents-default-2over1.json")}
# App overlay (calls no system rule matches, read after the partner's `afterRule` call); the spec copy above is never edited.
OVERRIDES = load("system-overrides.json")["rules"]


# ------------------------------------------------------------ matching
def pattern_matches(tokens, prefix):
    toks = tokens[:-1]
    if toks and toks[0] == "P*":
        rest = toks[1:]
        k = len(prefix) - len(rest)
        if k < 0 or any(c != "P" for c in prefix[:k]):
            return False
        return prefix[k:] == rest
    return toks == prefix


def specificity(rule):
    t = rule["context"]["auction"]
    return (len([x for x in t if x not in ("P*", "?")]) + (0 if t[0] == "P*" else 1)
            + (1 if "seats" in rule["context"] else 0) + (1 if "actorPassedHand" in rule["context"] else 0))


def candidates(system, prefix, seat_no, passed):
    out = []
    for r in system["rules"]:
        c = r["context"]
        if not pattern_matches(c["auction"], prefix):
            continue
        if "seats" in c and seat_no not in c["seats"]:
            continue
        if "actorPassedHand" in c and c["actorPassedHand"] != passed:
            continue
        out.append(r)
    best = {}
    for r in out:
        k = r["call"]
        if k not in best or (specificity(r), r["priority"]) > (specificity(best[k]), best[k]["priority"]):
            best[k] = r
    return best


# ------------------------------------------------------------ constraint algebra
def empty_player():
    return {"hard": {"hcp": [0, 37], "len": {s: [0, 13] for s in SUITS}, "all": []},
            "soft": {"hcp": [0, 37], "len": {s: [0, 13] for s in SUITS}, "all": [], "none": []},
            "rules": [], "unmatched": [], "conflicts": []}


def narrow(rng, new):
    return [max(rng[0], new[0]), min(rng[1], new[1])]


def apply_shows(P, shows, slack, rule_id):
    hard, soft = P["hard"], P["soft"]
    if "hcp" in shows:
        h = shows["hcp"]
        hh = narrow(hard["hcp"], [max(0, h[0] - slack), min(37, h[1] + slack)])
        if hh[0] > hh[1]:
            P["conflicts"].append(f"{rule_id}: hcp {h} conflicts with {hard['hcp']}; kept as soft only")
            soft["hcp"] = list(h)
        else:
            hard["hcp"] = hh
            sh = narrow(soft["hcp"], h)
            soft["hcp"] = sh if sh[0] <= sh[1] else soft["hcp"]
    for s, rng in shows.get("len", {}).items():
        nl = narrow(hard["len"][s], rng)
        if nl[0] > nl[1]:
            P["conflicts"].append(f"{rule_id}: len {s} {rng} conflicts with {hard['len'][s]}; kept as soft only")
            soft["len"][s] = list(rng)
        else:
            hard["len"][s] = nl
            soft["len"][s] = narrow(soft["len"][s], rng)
    rest = {k: v for k, v in shows.items() if k not in ("hcp", "len")}
    if rest:
        hard["all"].append(rest)


def infer(auction, dealer, profiles, slack=1):
    players = {s: empty_player() for s in SEATS}
    d = SEATS.index(dealer)
    artificial = set()
    matched_ids = {}
    for i, call in enumerate(auction):
        seat = SEATS[(d + i) % 4]
        seat_no = i % 4 + 1
        passed = any(auction[j] == "P" for j in range(i - 4, -1, -4))
        prefix = auction[:i]
        system = SYSTEMS[profiles[seat]]
        cands = candidates(system, prefix, seat_no, passed)
        P = players[seat]
        matched_ids[i] = cands[call]["id"] if call in cands else None
        override = None if call in cands else next((o for o in OVERRIDES if o["call"] == call and matched_ids.get(i - 2) == o["afterRule"]), None)
        if override:
            apply_shows(P, override["shows"], slack, override["id"])
            P["rules"].append(override["id"])
        elif call in cands:
            r = cands[call]
            if r["id"].startswith("fourth-suit."):
                artificial.add(i)
            apply_shows(P, r["shows"], slack, r["id"])
            P["rules"].append(r["id"])
            higher = [c for k, c in cands.items() if k != call and c["inferable"] and c["priority"] > r["priority"] and c["shows"]]
            for c in higher:
                P["soft"]["none"].append({"from": c["id"], "shows": c["shows"]})
        else:
            fb = fallback(call, auction, i, artificial)
            if fb:
                apply_shows(P, fb, 0, f"fallback:{call}")
            P["unmatched"].append({"index": i, "call": call, "fallback": fb})
    return players


def fallback(call, auction, i, artificial=frozenset()):
    """Natural reading of an unmatched call. Raise of partner's suit = 3+; rebid of own suit = nothing new;
    new suit = 4+ at the 1-level, 5+ higher; NT up to 3NT = semibalanced; P/X/XX = nothing."""
    if call in ("P", "X", "XX"):
        return {}
    lvl, s = int(call[0]), call[1]
    if s == "N":
        return {"shape": "semibalanced"} if lvl <= 3 else {}
    own = {auction[j][1] for j in range(i - 4, -1, -4) if auction[j][0].isdigit() and j not in artificial}
    partner = {auction[j][1] for j in range(i - 2, -1, -4) if auction[j][0].isdigit() and j not in artificial}
    if s in own:
        return {}
    if s in partner:
        return {"len": {s: [3, 13]}}
    return {"len": {s: [4 if lvl == 1 else 5, 13]}}


# ------------------------------------------------------------ hand evaluation
def hand_info(hand):
    by = {s: [c[0] for c in hand if c[1] == s] for s in SUITS}
    for s in SUITS:
        by[s].sort(key=RANKS.index)
    hcp = sum(HCPV.get(c[0], 0) for c in hand)
    return by, hcp


def shape_class(lens):
    pat = "".join(str(x) for x in sorted(lens, reverse=True))
    if pat in ("4333", "4432", "5332"):
        return "balanced"
    if pat in ("5422", "6322"):
        return "semibalanced"
    return "unbalanced"


def feature_ok(f, by):
    if f == "noSingleton":
        return all(len(by[s]) != 1 for s in SUITS)
    if f.startswith("aces:"):
        return str(sum("A" in by[s] for s in SUITS)) in f[5:].split("|")
    kind, s = f.split(":")
    suits = SUITS if s == "any" else s
    test = {
        "single": lambda c: len(c) == 1, "void": lambda c: len(c) == 0, "short": lambda c: len(c) <= 1,
        "stopper": lambda c: ("A" in c) or ("K" in c and len(c) >= 2) or ("Q" in c and len(c) >= 3) or ("J" in c and len(c) >= 4),
        "noTopHonors": lambda c: not any(x in c for x in "AKQ"),
        "goodSuit": lambda c: sum(x in c for x in "AKQ") >= 2 or sum(x in c for x in "AKQJT") >= 3,
        "solidSuit": lambda c: all(x in c for x in "AKQ"),
        "topHonor": lambda c: "A" in c or "K" in c}[kind]
    return any(test(by[x]) for x in suits)


def cs_ok(cs, by, hcp):
    lens = {s: len(by[s]) for s in SUITS}
    if "hcp" in cs and not cs["hcp"][0] <= hcp <= cs["hcp"][1]:
        return False
    for s, (a, b) in cs.get("len", {}).items():
        if not a <= lens[s] <= b:
            return False
    sh = cs.get("shape")
    if sh and sh != "any":
        c = shape_class(lens.values())
        if sh == "semibalanced" and c == "unbalanced":
            return False
        if sh == "balanced" and c != "balanced":
            return False
        if sh == "unbalanced" and c != "unbalanced":
            return False
    for a, op, b in cs.get("lenCmp", []):
        if not {">": lens[a] > lens[b], ">=": lens[a] >= lens[b], "=": lens[a] == lens[b]}[op]:
            return False
    if not all(feature_ok(f, by) for f in cs.get("features", [])):
        return False
    if "hcpPlusLen" in cs and hcp + lens[cs["hcpPlusLen"]["suit"]] < cs["hcpPlusLen"]["min"]:
        return False
    if "keycards" in cs:
        t = cs["keycards"]["trump"]
        if sum("A" in by[x] for x in SUITS) + ("K" in by[t]) not in cs["keycards"]["oneOf"]:
            return False
        if "trumpQueen" in cs and ("Q" in by[t]) != cs["trumpQueen"]:
            return False
    if "kings" in cs and "oneOf" in cs["kings"] and sum("K" in by[x] for x in SUITS) not in cs["kings"]["oneOf"]:
        return False
    if "anyOf" in cs and not any(cs_ok(x, by, hcp) for x in cs["anyOf"]):
        return False
    if any(cs_ok(x, by, hcp) for x in cs.get("notAny", [])):
        return False
    return True


def player_check(P, hand):
    by, hcp = hand_info(hand)
    h = P["hard"]
    if not h["hcp"][0] <= hcp <= h["hcp"][1]:
        return False, 0
    for s in SUITS:
        if not h["len"][s][0] <= len(by[s]) <= h["len"][s][1]:
            return False, 0
    if not all(cs_ok(x, by, hcp) for x in h["all"]):
        return False, 0
    soft = P["soft"]
    v = 0
    if not soft["hcp"][0] <= hcp <= soft["hcp"][1]:
        v += 1
    v += sum(1 for s in SUITS if not soft["len"][s][0] <= len(by[s]) <= soft["len"][s][1])
    v += sum(1 for n in soft["none"] if cs_ok(n["shows"], by, hcp))
    return True, v


def sample(players, known_seat, known_hand, n_target=500, timeout_s=10.0, soft_penalty=0.3, seed=1):
    rng = random.Random(seed)
    deck = [r + s for s in SUITS for r in RANKS if r + s not in known_hand]
    others = [s for s in SEATS if s != known_seat]
    acc, tried, t0 = [], 0, time.time()
    while len(acc) < n_target and time.time() - t0 < timeout_s:
        tried += 1
        rng.shuffle(deck)
        hands = {others[k]: deck[13 * k:13 * k + 13] for k in range(3)}
        ok, viol = True, 0
        for s in others:
            good, v = player_check(players[s], hands[s])
            if not good:
                ok = False
                break
            viol += v
        if ok and rng.random() < soft_penalty ** viol:
            acc.append(hands)
    return {"accepted": len(acc), "tried": tried, "acceptanceRate": round(len(acc) / max(tried, 1), 5),
            "seconds": round(time.time() - t0, 2), "timedOut": len(acc) < n_target}


def summarize(P):
    def clean(x):
        return {"hcp": x["hcp"], "len": {s: v for s, v in x["len"].items() if v != [0, 13]}}
    out = {"hard": clean(P["hard"]), "soft": clean(P["soft"]), "rules": P["rules"]}
    if P["hard"]["all"]:
        out["hard"]["all"] = P["hard"]["all"]
    if P["soft"]["none"]:
        out["soft"]["notAnyFromSiblings"] = [n["from"] for n in P["soft"]["none"]]
    if P["unmatched"]:
        out["unmatched"] = P["unmatched"]
    if P["conflicts"]:
        out["conflicts"] = P["conflicts"]
    return out


EXAMPLES = [
    {"id": "ex1-1NT-3NT", "dealer": "N", "auction": "1N P 3N P P P", "leader": "E",
     "leaderHand": "QJ1095 ♠ K74 ♥ 852 ♦ 63 ♣", "profiles": {"N": "opps", "S": "opps", "E": "ss", "W": "ss"}},
    {"id": "ex2-1S-2S-4S", "dealer": "S", "auction": "1S P 2S P 4S P P P", "leader": "W",
     "leaderHand": "K73 ♠ AJ104 ♥ Q92 ♦ 853 ♣", "profiles": {"N": "opps", "S": "opps", "E": "ss", "W": "ss"}},
    {"id": "ex3-competitive-1H-2C-2H-P-4H", "dealer": "N", "auction": "1H 2C 2H P 4H P P P", "leader": "E",
     "leaderHand": "Q4 ♠ 853 ♥ A6 ♦ AQJ1072 ♣", "profiles": {"N": "opps", "S": "opps", "E": "ss", "W": "ss"}},
    {"id": "ex4-1NT-Stayman-4H", "dealer": "W", "auction": "P 1N P 2C P 2H P 4H P P P", "leader": "W",
     "leaderHand": "Q1083 ♠ 942 ♥ KJ5 ♦ A62 ♣", "profiles": {"N": "opps", "S": "opps", "E": "ss", "W": "ss"},
     "note": "Dealer W passes; N opens 1NT in 2nd seat; E is declarer's... (declarer N, W on lead)"},
    {"id": "ex5-weak2H-relay-same-system", "dealer": "E", "auction": "2H P 2S P 3D P 4H P P P", "leader": "S",
     "leaderHand": "AQ5 ♠ 7 ♥ KJ1084 ♦ Q963 ♣", "profiles": {"N": "ss", "S": "ss", "E": "ss", "W": "ss"},
     "note": "Option 'opponents play our system': E-W use Stelios–Sotos (Wild Aggressor weak twos)."},
]


def parse_hand(txt):
    parts = txt.split()
    cards = []
    for i in range(0, len(parts), 2):
        hold, sym = parts[i], parts[i + 1]
        s = {"♠": "S", "♥": "H", "♦": "D", "♣": "C"}[sym]
        hold = hold.replace("10", "T")
        cards += [r + s for r in hold if r != "-"]
    assert len(cards) == 13, (txt, len(cards))
    return cards


def run():
    results = []
    for ex in EXAMPLES:
        auc = ex["auction"].split()
        players = infer(auc, ex["dealer"], ex["profiles"])
        known = parse_hand(ex["leaderHand"])
        st = sample(players, ex["leader"], known)
        results.append({"id": ex["id"], "dealer": ex["dealer"], "auction": auc, "leader": ex["leader"],
                        "leaderHand": ex["leaderHand"], "profiles": ex["profiles"],
                        "constraints": {s: summarize(players[s]) for s in SEATS if s != ex["leader"]},
                        "sampling": st})
    out_dir = os.environ.get("REF_OUT_DIR", os.path.join(ROOT, "examples"))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "worked-examples.json"), "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=1)
    for r in results:
        print(r["id"], r["sampling"])


if __name__ == "__main__":
    run()
