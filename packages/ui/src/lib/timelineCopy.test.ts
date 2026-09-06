import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@tudu/shared";
import { formatTimelineEvent } from "./timelineCopy.js";

const ctx = {
  viewerName: "You",
  isToday: true,
  selectedDate: "2026-09-06",
};

describe("formatTimelineEvent", () => {
  const base: TimelineEvent = {
    id: "11111111-1111-4111-8111-111111111111",
    taskId: "22222222-2222-4222-8222-222222222222",
    actorId: "user-1",
    type: "created",
    data: {},
    createdAt: "2026-09-06T10:30:00.000Z",
  };

  it("formats created as a system line", () => {
    const copy = formatTimelineEvent(base, ctx);
    expect(copy.isSystem).toBe(true);
    expect(copy.parts[0]?.kind).toBe("text");
    if (copy.parts[0]?.kind === "text") {
      expect(copy.parts[0].text).toBe("Created by you");
    }
  });

  it("formats renamed", () => {
    const copy = formatTimelineEvent({ ...base, type: "renamed", data: {} }, ctx);
    expect(copy.parts.some((part) => part.kind === "text" && part.text === "You")).toBe(true);
  });

  it("formats completed", () => {
    const copy = formatTimelineEvent({ ...base, type: "completed", data: {} }, ctx);
    expect(copy.parts.some((part) => part.kind === "text" && part.text.includes("completed"))).toBe(
      true,
    );
  });

  it("formats moved with bucket labels", () => {
    const copy = formatTimelineEvent(
      { ...base, type: "moved", data: { from: "next", to: "now" } },
      ctx,
    );
    expect(copy.parts.some((part) => part.kind === "text" && part.text === "Now")).toBe(true);
  });

  it("formats commented", () => {
    const copy = formatTimelineEvent({ ...base, type: "commented", data: {} }, ctx);
    expect(copy.parts.some((part) => part.kind === "text" && part.text.includes("commented"))).toBe(
      true,
    );
  });

  it("formats deadline_changed with mono time", () => {
    const copy = formatTimelineEvent(
      {
        ...base,
        type: "deadline_changed",
        data: { to: "2026-09-06T18:00:00.000Z" },
      },
      ctx,
    );
    expect(copy.parts.some((part) => part.kind === "mono")).toBe(true);
  });
});
