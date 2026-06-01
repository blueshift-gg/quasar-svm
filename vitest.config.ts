import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@blueshift-gg/quasar-svm/web3.js": path.join(repoRoot, "bindings/node/src/web3.js/index.ts"),
      "@blueshift-gg/quasar-svm/kit": path.join(repoRoot, "bindings/node/src/kit/index.ts"),
    },
  },
  test: {
    pool: "forks",
    include: ["tests/**/*.test.ts"],
  },
});
