import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60000,
    globalSetup: ["./scripts/vitest-global-setup.ts"],
    // bridge-dds imports "./lib/dds" without an extension; inlining lets Vite resolve it under Node.
    server: { deps: { inline: ["bridge-dds"] } },
  },
});
