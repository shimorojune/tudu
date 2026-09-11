import { describe, expect, it } from "vitest";
import { pwaManifest } from "./pwa-manifest";

describe("pwaManifest", () => {
  it("is a standalone Home Screen app named Tudu", () => {
    expect(pwaManifest.name).toBe("Tudu");
    expect(pwaManifest.short_name).toBe("Tudu");
    expect(pwaManifest.display).toBe("standalone");
    expect(pwaManifest.start_url).toBe("/");
    expect(pwaManifest.scope).toBe("/");
  });

  it("uses brand plate and page background colors", () => {
    expect(pwaManifest.theme_color).toBe("#201e1d");
    expect(pwaManifest.background_color).toBe("#f3f2f2");
  });

  it("lists square any and maskable icons", () => {
    expect(pwaManifest.icons).toEqual([
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
    ]);
  });
});
