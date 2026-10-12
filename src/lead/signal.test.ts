import { describe, expect, it } from "vitest";
import { calls, parseSymbolHand } from "../engine/test-data.ts";
import type { Card, Rank } from "../engine/types.ts";
import { resolve, TABLE } from "../i18n/i18n.ts";
import { agreedCard, parseBookTable, parsePartnershipTable } from "../rules/carding.ts";
import { deriveContext } from "../rules/context.ts";
import { CARD_CHOICE_RAW, LEAD_CONFIG, PARTNERSHIP_CARDING_RAW } from "./data.ts";
import { leadSignal } from "./explain.ts";

const HAND = parseSymbolHand("AK72 ♠ 9863 ♥ 1052 ♦ 84 ♣");
const ctx = (auction: string) => deriveContext({ hand: HAND, auction: calls(auction), dealer: "N", vul: "none", scoring: "IMP", disciplined: false }, LEAD_CONFIG);
const text = (key: string | undefined, lang: "el" | "en"): string => resolve(TABLE, key!, { lang, dev: false });

describe("notrump A/K signal of the lead", () => {
  it("the ace from AK asks partner to unblock or give count", () => {
    const sig = leadSignal(ctx("1N P 3N P P P"), "AS" as Card);
    expect(sig).toEqual({ key: "explain.signal.ntAce" });
    expect(text(sig?.key, "en")).toBe("Against notrump the ace asks partner to unblock (play an honour) or give count.");
    expect(text(sig?.key, "el")).toBe("Εναντίον Χωρίς Ατού ο άσος ζητά από τον συμπαίκτη ξεμπλοκάρισμα (να ρίξει ονέρ) ή μέτρημα.");
  });
  it("the king from AK asks partner for attitude", () => {
    const sig = leadSignal(ctx("1N P 3N P P P"), "KS" as Card);
    expect(sig).toEqual({ key: "explain.signal.ntKing" });
    expect(text(sig?.key, "en")).toBe("Against notrump the king asks partner for attitude (encouraging or discouraging).");
    expect(text(sig?.key, "el")).toBe("Εναντίον Χωρίς Ατού ο ρήγας ζητά από τον συμπαίκτη ενθάρρυνση ή απογοήτευση.");
  });
  it("no signal against a suit contract, from a non-AK holding, or for a low card", () => {
    expect(leadSignal(ctx("1S P 4S P P P"), "AS" as Card)).toBeNull();
    expect(leadSignal(ctx("1N P 3N P P P"), "9H" as Card)).toBeNull();
    expect(leadSignal(ctx("1N P 3N P P P"), "2S" as Card)).toBeNull();
  });
});

describe("card selection is unchanged", () => {
  const tables = { partnership: parsePartnershipTable(PARTNERSHIP_CARDING_RAW), book: parseBookTable(CARD_CHOICE_RAW) };
  const card = (holding: string, type: "NT" | "suit"): string => agreedCard(tables, [...holding] as Rank[], type, "IMP", "side")!.ranks.join("");
  it.each([
    ["AK", "suit", "K"],
    ["AK2", "suit", "A"],
    ["AK72", "suit", "A"],
    ["AK", "NT", "A"],
    ["AK2", "NT", "K"],
    ["AK752", "NT", "A"],
  ])("%s against %s leads %s", (holding, type, want) => {
    expect(card(holding, type as "NT" | "suit")).toBe(want);
  });
});
