import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const uiRoot = path.resolve(__dirname, "../../packages/ui");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(uiRoot, "./src"),
      "@assets": path.resolve(uiRoot, "./assets"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_"],
  build: {
    target: "es2022",
    minify: "esbuild",
  },
  optimizeDeps: {
    include: ["@tudu/shared", "@tudu/ui"],
  },
});
