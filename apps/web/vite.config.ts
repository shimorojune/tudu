import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaManifest } from "./pwa-manifest";

const uiRoot = path.resolve(__dirname, "../../packages/ui");

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["tudu-mark-32.png", "apple-touch-icon.png"],
      manifest: pwaManifest,
      devOptions: {
        enabled: false,
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webmanifest}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
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
    include: ["@tudu/ui"],
    exclude: ["@tudu/store", "@tudu/shared"],
  },
});
