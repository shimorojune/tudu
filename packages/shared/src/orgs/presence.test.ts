import { describe, expect, it } from "vitest";
import {
  formatLastSeenSubtitle,
  lastSeenPhrase,
} from "./presence.js";

describe("lastSeenPhrase", () => {
  const now = new Date("2026-09-27T15:30:00");

  it("marks never when last seen is null", () => {
    expect(lastSeenPhrase(null, now)).toEqual({
      kind: "never",
      timeLabel: null,
    });
  });

  it("formats today and yesterday", () => {
    expect(lastSeenPhrase(new Date("2026-09-27T09:05:00"), now).kind).toBe(
      "today",
    );
    expect(lastSeenPhrase(new Date("2026-09-26T18:40:00"), now).kind).toBe(
      "yesterday",
    );
  });
});

describe("formatLastSeenSubtitle", () => {
  it("prefers now title when present", () => {
    expect(
      formatLastSeenSubtitle({ kind: "never", timeLabel: null }, "Ship docs"),
    ).toBe("now: Ship docs");
  });

  it("describes yesterday copy", () => {
    expect(
      formatLastSeenSubtitle(
        { kind: "yesterday", timeLabel: "18:40" },
        null,
      ),
    ).toContain("18:40 yesterday");
  });
});
