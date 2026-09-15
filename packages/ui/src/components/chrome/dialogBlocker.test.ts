import { describe, expect, it, afterEach } from "vitest";
import { isCommandPaletteBlocked } from "./dialogBlocker";

describe("isCommandPaletteBlocked", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is not blocked when a closed TipTap search panel is mounted", () => {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.className = "tiptap-search-replace";
    panel.setAttribute("data-open", "false");
    document.body.append(panel);

    expect(isCommandPaletteBlocked()).toBe(false);
  });

  it("is blocked when the TipTap search panel is open", () => {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.className = "tiptap-search-replace";
    panel.setAttribute("data-open", "true");
    document.body.append(panel);

    expect(isCommandPaletteBlocked()).toBe(true);
  });

  it("is blocked when a Radix dialog content is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-slot", "dialog-content");
    dialog.setAttribute("data-state", "open");
    document.body.append(dialog);

    expect(isCommandPaletteBlocked()).toBe(true);
  });

  it("is not blocked when a Radix dialog content is closed", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-slot", "dialog-content");
    dialog.setAttribute("data-state", "closed");
    document.body.append(dialog);

    expect(isCommandPaletteBlocked()).toBe(false);
  });
});
