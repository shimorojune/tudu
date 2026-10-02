import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const uiRoot = path.resolve(__dirname, "packages/ui");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/components/tiptap-templates/simple/simple-editor",
        replacement: path.resolve(uiRoot, "./src/test/mocks/simple-editor.tsx"),
      },
      { find: "@assets", replacement: path.resolve(uiRoot, "./assets") },
      { find: "@", replacement: path.resolve(uiRoot, "./src") },
      {
        find: "react",
        replacement: path.resolve(__dirname, "node_modules/react"),
      },
      {
        find: "react-dom",
        replacement: path.resolve(__dirname, "node_modules/react-dom"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    env: {
      VITE_API_URL: "http://localhost:3456",
    },
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@/components/tiptap-templates/simple/simple-editor": path.resolve(
        uiRoot,
        "./src/test/mocks/simple-editor.tsx",
      ),
    },
    include: [
      "packages/*/src/**/*.test.{ts,tsx}",
      "apps/desktop/src/**/*.test.ts",
      "apps/server/src/**/*.test.ts",
      "apps/mcp/src/**/*.test.ts",
      "apps/web/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.db.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "packages/*/src/**/*.{ts,tsx}",
        "apps/server/src/**/*.ts",
        "apps/desktop/src/**/*.ts",
        "apps/web/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.db.test.ts",
        "packages/ui/src/components/tiptap-**/**",
        "packages/ui/src/components/ui/**",
      ],
      thresholds: {
        lines: 14,
        functions: 12,
        branches: 10,
        statements: 14,
      },
    },
  },
});
