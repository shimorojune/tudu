import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  applyTheme,
  resolveTheme,
} from "./theme";

describe("resolveTheme", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark") ? false : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns light or dark for explicit preferences", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("follows prefers-color-scheme when preference is system", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-color-scheme: dark"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(resolveTheme("system")).toBe("dark");

    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = "";
  });

  it("toggles html.dark and color-scheme", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("updates theme-color meta when present", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", THEME_COLOR_LIGHT);
    document.head.append(meta);

    applyTheme("dark");
    expect(meta.getAttribute("content")).toBe(THEME_COLOR_DARK);

    applyTheme("light");
    expect(meta.getAttribute("content")).toBe(THEME_COLOR_LIGHT);
  });
});
