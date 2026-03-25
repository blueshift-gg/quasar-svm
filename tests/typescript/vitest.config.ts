import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    include: ["**/*.test.ts"],
  },
});
