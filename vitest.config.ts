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
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "@/components/tiptap-templates/simple/simple-editor": path.resolve(
        uiRoot,
        "./src/test/mocks/simple-editor.tsx",
      ),
    },
    include: [
      "packages/**/*.test.{ts,tsx}",
      "apps/desktop/**/*.test.ts",
      "apps/server/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
  },
});
