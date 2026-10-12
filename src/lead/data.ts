import cardChoiceRaw from "../../data/lead-card-choice.json";
import baselineRaw from "../../data/lead-config.baseline.json";
import configRaw from "../../data/lead-config.json";
import overlaysRaw from "../../data/lead-rules-rulings-01.json";
import rulesRaw from "../../data/lead-rules.json";
import systemRaw from "../../data/system-stelios-sotos.json";
import { parseLeadRules, parseRuleOverlays } from "../rules/load.ts";
import { parseLeadConfig } from "./config.ts";

export const LEAD_CONFIG = parseLeadConfig(configRaw);
/** The phase-5 config: the legacy "blend" mode (and the evaluation baseline) read this. */
export const BASELINE_CONFIG = parseLeadConfig(baselineRaw);
export const LEAD_RULES = parseLeadRules(rulesRaw);
export const RULE_OVERLAYS = parseRuleOverlays(overlaysRaw, LEAD_RULES);
export const CARD_CHOICE_RAW: unknown = cardChoiceRaw;
export const PARTNERSHIP_CARDING_RAW: unknown = (systemRaw as { carding: unknown }).carding;
