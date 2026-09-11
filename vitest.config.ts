import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const uiRoot = path.resolve(__dirname, "packages/ui");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(uiRoot, "./src"),
      "@assets": path.resolve(uiRoot, "./assets"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "packages/**/*.test.{ts,tsx}",
      "apps/server/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
  },
});
