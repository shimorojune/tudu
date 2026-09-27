import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.db.test.ts"],
    exclude: [],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["./vitest.db.setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      "@tudu/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@tudu/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
});
