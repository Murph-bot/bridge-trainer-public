import { describe, expect, it } from "vitest";
import { validateAgainstSchema, validateSystem } from "./validate.ts";
import { OPPS, readJson, SS } from "./test-data.ts";
import { parseSystemFile } from "./load.ts";

const schema = readJson("system.schema.json") as Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const withRule = (patch: (r: any) => void, idx = 0) => {
  const d = clone(readJson("system-stelios-sotos.json")) as any;
  patch(d.rules[idx]);
  return validateSystem(schema, d).errors;
};

describe("acceptance: T1 schema and validate", () => {
  it("both system files validate, with the same counts as tools/validate.py", () => {
    const ss = validateSystem(schema, readJson("system-stelios-sotos.json"));
    const opps = validateSystem(schema, readJson("opponents-default-2over1.json"));
    expect(ss).toEqual({ errors: [], contexts: 182, contextsWithoutPass: 90 });
    expect(opps).toEqual({ errors: [], contexts: 126, contextsWithoutPass: 39 });
    expect(SS.rules).toHaveLength(896);
    expect(OPPS.rules).toHaveLength(662);
  });
  it("detects schema violations", () => {
    expect(withRule((r) => (r.call = "8C"))[0]).toMatch(/does not match/);
    expect(withRule((r) => (r.bogus = 1))[0]).toMatch(/unexpected property "bogus"/);
    expect(withRule((r) => delete r.priority)[0]).toMatch(/missing required "priority"/);
    expect(withRule((r) => (r.shows = { hcp: [10] }))[0]).toMatch(/fewer than 2/);
    expect(withRule((r) => (r.shows = { features: ["stopper:Z"] }))[0]).toMatch(/does not match/);
    expect(withRule((r) => (r.forcing = "maybe"))[0]).toMatch(/not in enum/);
    expect(withRule((r) => (r.shows = { lenCmp: [["S", "<", "H"]] }))[0]).toMatch(/not in enum/);
  });
  it("detects bridge-level errors", () => {
    const id = SS.rules[0]!.id;
    expect(withRule((r) => (r.shows = { hcp: [12, 10] }))).toEqual([`${id}: hcp min > max`]);
    expect(withRule((r) => (r.shows = { len: { S: [7, 13], H: [7, 13] } }))).toEqual([`${id}: min lengths exceed 13`]);
    expect(withRule((r) => (r.shows = { len: { S: [0, 3], H: [0, 3], D: [0, 3], C: [0, 3] } }))).toEqual([`${id}: max lengths below 13`]);
    expect(withRule((r) => (r.shows = { anyOf: [{ hcp: [9, 3] }] }))).toEqual([`${id}.anyOf[0]: hcp min > max`]);
    expect(
      withRule((r) => {
        r.context.auction = ["1H", "?"];
        r.call = "1C";
      }),
    ).toEqual([`${id}: insufficient bid 1C after 1H in 1H 1C`]);
    expect(
      withRule((r) => {
        r.context.auction = ["?"];
        r.call = "X";
      }),
    ).toEqual([`${id}: illegal X at 0 in X`]);
    expect(
      withRule((r) => {
        r.context.auction = ["1H", "X", "?"];
        r.call = "X";
      }),
    ).toEqual([`${id}: illegal X at 2 in 1H X X`]);
    expect(
      withRule((r) => {
        r.context.auction = ["1H", "P", "XX", "?"];
        r.call = "P";
      }),
    ).toEqual([`${id}: illegal XX at 2 in 1H P XX P`]);
    expect(withRule((r) => (r.context.auction = ["1H", "P"]))).toEqual([`${id}: auction must end with a single '?'`]);
    expect(
      withRule((r) => {
        r.context.auction = ["1H", "P*", "?"];
        r.call = "2H";
      }),
    ).toEqual([`${id}: 'P*' only allowed first`]);
  });
  it("detects duplicate ids and duplicate context+call", () => {
    const d = clone(readJson("system-stelios-sotos.json")) as any;
    d.rules[1].id = d.rules[0].id;
    expect(validateSystem(schema, d).errors).toEqual([`duplicate id ${d.rules[0].id}`]);
    const e = clone(readJson("system-stelios-sotos.json")) as any;
    e.rules.push({ ...clone(e.rules[0]), id: "dup.extra" });
    expect(validateSystem(schema, e).errors[0]).toMatch(/^duplicate context\+call/);
  });
  it("validateAgainstSchema resolves $ref and checks types", () => {
    expect(validateAgainstSchema(schema, { meta: { name: "n", version: "1", profile: "p", constraintConventions: {} }, rules: "x" })).toEqual(["$.rules: expected array, got string"]);
    expect(validateAgainstSchema(schema, [])).toEqual(["$: expected object, got array"]);
  });
  it("parseSystemFile rejects malformed input at the boundary", () => {
    expect(() => parseSystemFile(null)).toThrow(/must be an object/);
    expect(() => parseSystemFile({ meta: { name: "x", profile: "y", constraintConventions: {} }, rules: [] })).toThrow(/hcpSlack/);
    expect(() => parseSystemFile({ meta: { name: "x", profile: "y", constraintConventions: { hcpSlack: 1 } }, rules: [{ id: 1 }] })).toThrow(/string id/);
  });
});
