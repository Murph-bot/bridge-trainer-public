import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dataPath } from "../../scripts/data-pack.mjs";
import { LEAD_RULES } from "../lead/data.ts";

/**
 * Without the private data pack (data/private/ or BRIDGE_DATA_DIR) the public snapshot has no book test problems and
 * only a small sample rule set. Tests that need the full data skip themselves then.
 */
export const PROBLEMS_URL = pathToFileURL(dataPath("lead-test-problems.json"));
export const HAS_BOOK_PROBLEMS = existsSync(PROBLEMS_URL);
export const HAS_FULL_RULES = LEAD_RULES.length > 100;
