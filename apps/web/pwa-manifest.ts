export const pwaManifest = {
  name: "Tudu",
  short_name: "Tudu",
  description: "Tudu",
  display: "standalone" as const,
  start_url: "/",
  scope: "/",
  theme_color: "#201e1d",
  background_color: "#f3f2f2",
  icons: [
    {
      src: "/pwa-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/pwa-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/pwa-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/pwa-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
