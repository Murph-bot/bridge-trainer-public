// Node module hook (tsx --import ./scripts/data-pack-hook.mjs): redirects data/ imports to the private pack.
import { register } from "node:module";
register("./data-pack-resolve.mjs", import.meta.url);
