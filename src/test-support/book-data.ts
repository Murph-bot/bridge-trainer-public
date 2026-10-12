import { existsSync } from "node:fs";
import { LEAD_RULES } from "../lead/data.ts";

/**
 * The public snapshot ships without the book test problems and with a small sample rule set
 * (data/lead-rules.json). Tests that need the full private data are skipped when it is absent.
 */
export const PROBLEMS_URL = new URL("../../data/lead-test-problems.json", import.meta.url);
export const HAS_BOOK_PROBLEMS = existsSync(PROBLEMS_URL);
export const HAS_FULL_RULES = LEAD_RULES.length > 100;
