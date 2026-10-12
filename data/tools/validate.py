#!/usr/bin/env python3
"""Validates every JSON file in trainer-spec: parse, schema, and bridge-legality checks on system files."""
import json, os, sys, glob, collections
from jsonschema import Draft202012Validator

ROOT = os.path.join(os.path.dirname(__file__), "..")
SUITS = "SHDC"
ORDER = {s: i for i, s in enumerate("CDHSN")}
errors = []


def bid_value(c):
    return (int(c[0]) - 1) * 5 + ORDER[c[1]]


def check_cs(cs, where):
    if "hcp" in cs and cs["hcp"][0] > cs["hcp"][1]:
        errors.append(f"{where}: hcp min > max")
    L = cs.get("len", {})
    for s, (a, b) in L.items():
        if a > b:
            errors.append(f"{where}: len {s} min > max")
    if sum(L.get(s, [0, 13])[0] for s in SUITS) > 13:
        errors.append(f"{where}: min lengths exceed 13")
    if sum(L.get(s, [0, 13])[1] for s in SUITS) < 13:
        errors.append(f"{where}: max lengths below 13")
    for k in ("anyOf", "notAny"):
        for i, sub in enumerate(cs.get(k, [])):
            check_cs(sub, f"{where}.{k}[{i}]")


def check_legal(rule):
    toks = rule["context"]["auction"]
    if toks[-1] != "?" or "?" in toks[:-1]:
        errors.append(f"{rule['id']}: auction must end with a single '?'")
        return
    if "P*" in toks[1:]:
        errors.append(f"{rule['id']}: 'P*' only allowed first")
    seq = [t for t in toks[:-1] if t != "P*"] + [rule["call"]]
    n = len(seq)
    last_bid, last_bid_side, doubled, redoubled, double_side = None, None, False, False, None
    for i, c in enumerate(seq):
        side = (n - 1 - i) % 2
        if c == "P":
            continue
        if c == "X":
            if last_bid is None or last_bid_side == side or doubled:
                errors.append(f"{rule['id']}: illegal X at {i} in {seq}")
            doubled, double_side = True, side
        elif c == "XX":
            # A redouble normally follows immediately from the side that
            # made the last bid; a forcing-pass convention can insert an
            # intervening pass, in which case it is by the side of the X.
            if not doubled or redoubled or (last_bid_side != side and double_side != side):
                errors.append(f"{rule['id']}: illegal XX at {i} in {seq}")
            redoubled = True
        else:
            if last_bid and bid_value(c) <= bid_value(last_bid):
                errors.append(f"{rule['id']}: insufficient bid {c} after {last_bid} in {seq}")
            last_bid, last_bid_side, doubled, redoubled, double_side = c, side, False, False, None


def main():
    schema = json.load(open(os.path.join(ROOT, "system.schema.json")))
    Draft202012Validator.check_schema(schema)
    v = Draft202012Validator(schema)
    for f in sorted(glob.glob(os.path.join(ROOT, "*.json"))):
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            errors.append(f"{os.path.basename(f)}: JSON parse error {e}")
            continue
        name = os.path.basename(f)
        if not (name.startswith("system-") or name.startswith("opponents-")):
            print(f"parsed OK  {os.path.basename(f)}")
            continue
        for e in v.iter_errors(data):
            errors.append(f"{os.path.basename(f)}: schema {list(e.path)} {e.message[:200]}")
        ids = collections.Counter(r["id"] for r in data["rules"])
        errors.extend(f"{os.path.basename(f)}: duplicate id {i}" for i, k in ids.items() if k > 1)
        keys = collections.Counter((tuple(r["context"]["auction"]), r["call"], tuple(r["context"].get("seats", [])), r["context"].get("actorPassedHand")) for r in data["rules"])
        errors.extend(f"{os.path.basename(f)}: duplicate context+call {k}" for k, n in keys.items() if n > 1)
        for r in data["rules"]:
            check_cs(r["shows"], r["id"])
            check_legal(r)
        ctx = collections.defaultdict(set)
        for r in data["rules"]:
            ctx[tuple(r["context"]["auction"])].add(r["call"])
        nopass = [c for c, calls in ctx.items() if "P" not in calls]
        print(f"validated  {os.path.basename(f)}: {len(data['rules'])} rules, {len(ctx)} contexts, {len(nopass)} contexts without an explicit Pass rule")
    if errors:
        print("\n".join(errors[:80]))
        print(f"{len(errors)} errors")
        sys.exit(1)
    print("ALL OK")


main()
