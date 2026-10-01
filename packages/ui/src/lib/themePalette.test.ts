import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPaletteToDocument,
  buildThemeTokens,
  contrastForeground,
  deriveElevatedSurface,
  mergeCustomColors,
  readStoredPaletteId,
  PALETTE_STORAGE_KEY,
} from "@/lib/themePalette";
import { getPresetTokens } from "@/lib/themePalettes";

describe("themePalette", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("style");
    window.localStorage.removeItem(PALETTE_STORAGE_KEY);
  });

  it("defaults to neutral when nothing is stored", () => {
    expect(readStoredPaletteId()).toBe("neutral");
    const tokens = buildThemeTokens("neutral", "dark", {});
    expect(tokens["--background"]).toBe("#171717");
  });

  it("picks light or dark text from primary luminance", () => {
    expect(contrastForeground("#ec3013")).toBe("#fafaf9");
    expect(contrastForeground("#f3f2f2")).toBe("#201e1d");
  });

  it("merges custom hex colors onto preset base", () => {
    const base = getPresetTokens("current", "light");
    const merged = mergeCustomColors(
      base,
      {
        primary: "#0000ff",
        background: "#eeeeee",
      },
      "light",
    );
    expect(merged["--primary"]).toBe("#0000ff");
    expect(merged["--background"]).toBe("#eeeeee");
    expect(merged["--card"]).toBe(deriveElevatedSurface("#eeeeee"));
    expect(merged["--popover"]).toBe(merged["--card"]);
    expect(merged["--primary-foreground"]).toBe("#fafaf9");
    expect(merged["--hair"]).toMatch(/rgba|oklch/);
  });

  it("elevates card surface from custom background", () => {
    expect(deriveElevatedSurface("#302d2a")).toBe("#3a3734");
    expect(deriveElevatedSurface("#111111")).toBe("#242424");
  });

  it("only applies stored custom colors when palette is custom", () => {
    const withCustom = buildThemeTokens("modernist", "light", {
      primary: "#00ff00",
    });
    expect(withCustom["--primary"]).not.toBe("#00ff00");

    const customPalette = buildThemeTokens("custom", "light", {
      primary: "#00ff00",
    });
    expect(customPalette["--primary"]).toBe("#00ff00");
  });

  it("maps faint to muted-foreground and sets primary-text on modernist", () => {
    const tokens = buildThemeTokens("modernist", "light", {});
    expect(tokens["--faint"]).toBe(tokens["--muted-foreground"]);
    expect(tokens["--primary-text"]).toBe("#ae1800");
    expect(tokens["--primary"]).toBe("#ec3013");
  });

  it("github light uses its own background", () => {
    const modernist = getPresetTokens("modernist", "light");
    const github = getPresetTokens("github", "light");
    expect(github["--background"]).toBe("#f0f1f0");
    expect(github["--background"]).not.toBe(modernist["--background"]);
  });

  it("applies modernist tokens and font to the document", () => {
    document.documentElement.style.setProperty("--primary", "#ff0000");
    applyPaletteToDocument("modernist", "light", {}, "system");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "#ec3013",
    );
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(
      "system-ui, sans-serif",
    );
  });

  it("applies modernist tokens to the document", () => {
    applyPaletteToDocument("modernist", "dark", {}, "ar-one-sans");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "#ec3013",
    );
    expect(document.documentElement.style.getPropertyValue("--background")).toBe(
      "#302d2a",
    );
  });
});
