#!/usr/bin/env python3
"""Regenerates src/engine/fixtures/ref-differential.json: random auctions built from rule contexts, run through
data/tools/ref_constraints.py (the arbiter). Read-only on data/. Usage: python3 scripts/gen_ref_differential.py [N]"""
import importlib.util, json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ref", os.path.join(HERE, "..", "data", "tools", "ref_constraints.py"))
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)

n_cases = int(sys.argv[1]) if len(sys.argv) > 1 else 250
rnd = random.Random(5)
rules = [r for name in ("ss", "opps") for r in ref.SYSTEMS[name]["rules"]]
out = []
fourth = [r for r in ref.SYSTEMS["ss"]["rules"] if r["id"].startswith("fourth-suit.")]
forced = [r for r in fourth for _ in range(3)]
by_id = {r["id"]: r for r in ref.SYSTEMS["ss"]["rules"]}
overridden = [o for o in ref.OVERRIDES for _ in range(3)]
while len(out) < n_cases:
    k = len(out)
    o = overridden[k - len(forced)] if len(forced) <= k < len(forced) + len(overridden) else None
    r = by_id[o["afterRule"]] if o else forced[k] if k < len(forced) else rnd.choice(rules)
    toks = r["context"]["auction"][:-1]
    pre = []
    if toks and toks[0] == "P*":
        pre = ["P"] * rnd.randint(0, 3)
        toks = toks[1:]
    auc = pre + toks + [r["call"]]
    if o:
        auc += ["P", o["call"]]
    for _ in range(0 if o else rnd.randint(0, 3)):
        sys_name = rnd.choice(["ss", "opps"])
        passed = any(auc[j] == "P" for j in range(len(auc) - 4, -1, -4))
        cands = ref.candidates(ref.SYSTEMS[sys_name], auc, len(auc) % 4 + 1, passed)
        auc.append(rnd.choice(list(cands.keys())) if cands else "P")
    dealer = rnd.choice("NESW")
    profiles = {s: rnd.choice(["ss", "opps"]) for s in "NESW"}
    if r in fourth or o:
        profiles = {s: "ss" for s in "NESW"}
    players = ref.infer(auc, dealer, profiles)
    out.append({"auction": auc, "dealer": dealer, "profiles": profiles, "result": {s: ref.summarize(players[s]) for s in "NESW"}})
with open(os.path.join(HERE, "..", "src", "engine", "fixtures", "ref-differential.json"), "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print(len(out), "cases")
