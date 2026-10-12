import { build } from "esbuild";
import { dataPackEsbuild } from "./data-pack.mjs";

const common = { bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "warning", plugins: [dataPackEsbuild] };

await build({ ...common, entryPoints: ["src/dd/node-worker.ts"], outfile: "dist-node/dd-node-worker.mjs" });
await build({ ...common, entryPoints: ["scripts/eval-worker.ts"], outfile: "dist-node/eval-worker.mjs" });
