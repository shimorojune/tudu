import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@tudu/shared";
import { formatTimelineEvent, withSyntheticCreated } from "./timelineCopy.js";

const ctx = {
  viewerName: "You",
  viewerId: "user-1",
  isToday: true,
  selectedDate: "2026-09-06",
};

const marcus = {
  id: "marcus",
  name: "Marcus Chen",
  email: "marcus@egain.com",
};

describe("formatTimelineEvent", () => {
  const base: TimelineEvent = {
    id: "11111111-1111-4111-8111-111111111111",
    taskId: "22222222-2222-4222-8222-222222222222",
    actorId: "user-1",
    actor: { id: "user-1", name: "You", email: "you@example.com" },
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

  it("names a different creator", () => {
    const copy = formatTimelineEvent(
      { ...base, actorId: marcus.id, actor: marcus },
      ctx,
    );
    expect(copy.parts[0]).toMatchObject({
      kind: "text",
      text: "Created by Marcus Chen",
    });
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

  it("formats rolled_over as system line", () => {
    const copy = formatTimelineEvent(
      {
        ...base,
        actorId: null,
        actor: null,
        type: "rolled_over",
        data: { from: "2026-09-05", to: "2026-09-06", carriedDays: 1 },
      },
      ctx,
    );
    expect(copy.isSystem).toBe(true);
    expect(copy.parts[0]).toMatchObject({
      kind: "text",
      text: expect.stringContaining("Rolled over from"),
      muted: true,
    });
    if (copy.parts[0]?.kind === "text") {
      expect(copy.parts[0].text).toContain("first day carried");
    }
  });

  it("formats inbox_sent, inbox_accepted, and inbox_declined", () => {
    const sent = formatTimelineEvent(
      { ...base, type: "inbox_sent", actorId: marcus.id, actor: marcus, data: {} },
      ctx,
    );
    expect(sent.parts.some((part) => part.kind === "text" && part.text === "Marcus Chen")).toBe(
      true,
    );
    expect(sent.parts.some((part) => part.kind === "text" && part.text.includes("Inbox"))).toBe(
      true,
    );

    const accepted = formatTimelineEvent(
      { ...base, type: "inbox_accepted", data: { bucket: "next" } },
      ctx,
    );
    expect(accepted.parts.some((part) => part.kind === "text" && part.text === "Next")).toBe(
      true,
    );

    const declined = formatTimelineEvent(
      { ...base, type: "inbox_declined", data: { reason: "Next week" } },
      ctx,
    );
    expect(
      declined.parts.some((part) => part.kind === "text" && part.text.includes("declined")),
    ).toBe(true);
  });
});

describe("withSyntheticCreated", () => {
  const sent: TimelineEvent = {
    id: "11111111-1111-4111-8111-111111111111",
    taskId: "22222222-2222-4222-8222-222222222222",
    actorId: "marcus",
    actor: marcus,
    type: "inbox_sent",
    data: {},
    createdAt: "2026-09-06T10:30:00.000Z",
  };

  it("skips a fake created line when the task was sent to Inbox", () => {
    const events = withSyntheticCreated(sent.taskId, sent.createdAt, [sent]);
    expect(events).toEqual([sent]);
    expect(events.some((event) => event.type === "created")).toBe(false);
  });
});
