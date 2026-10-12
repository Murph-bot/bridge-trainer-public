import { build } from "esbuild";

const common = { bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "warning" };

await build({ ...common, entryPoints: ["src/dd/node-worker.ts"], outfile: "dist-node/dd-node-worker.mjs" });
await build({ ...common, entryPoints: ["scripts/eval-worker.ts"], outfile: "dist-node/eval-worker.mjs" });
