import { describe, expect, it } from "vitest";
import {
  acceptScheduledDate,
  canDeclineInboxCard,
  declineInboxRequestSchema,
  sendInboxTaskRequestSchema,
  DEFAULT_MANAGER_PERMISSIONS,
  inboxCardKind,
  normalizeInviteEmail,
  permitManagerAction,
  personFirstName,
  personInitials,
} from "./manager.js";

describe("acceptScheduledDate", () => {
  it("uses startDate when the manager set one", () => {
    expect(acceptScheduledDate("2026-09-12", "2026-09-10")).toBe("2026-09-12");
  });

  it("falls back to today when start is empty", () => {
    expect(acceptScheduledDate(null, "2026-09-10")).toBe("2026-09-10");
  });
});

describe("normalizeInviteEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeInviteEmail("  Priya@eGain.com ")).toBe("priya@egain.com");
  });
});

describe("inboxCardKind", () => {
  it("is assigned when the sender is your manager", () => {
    expect(
      inboxCardKind({ fromUserId: "marcus", actorManagerId: "marcus" }),
    ).toBe("assigned");
  });

  it("is returned when the sender is not your manager", () => {
    expect(
      inboxCardKind({ fromUserId: "priya", actorManagerId: "marcus" }),
    ).toBe("returned");
  });
});

describe("canDeclineInboxCard", () => {
  it("allows decline on assigned cards only", () => {
    expect(canDeclineInboxCard("assigned")).toBe(true);
    expect(canDeclineInboxCard("returned")).toBe(false);
  });
});

describe("declineInboxRequestSchema", () => {
  it("requires a non-empty reason", () => {
    expect(() => declineInboxRequestSchema.parse({ reason: "  " })).toThrow();
    expect(declineInboxRequestSchema.parse({ reason: " Next week " }).reason).toBe(
      "Next week",
    );
  });
});

describe("personFirstName", () => {
  it("uses the first word", () => {
    expect(personFirstName("Marcus Bell")).toBe("Marcus");
    expect(personFirstName("")).toBe("Someone");
  });
});

describe("personInitials", () => {
  it("uses two letters from the name", () => {
    expect(personInitials("Priya Raman")).toBe("PR");
    expect(personInitials("Marcus")).toBe("MA");
  });
});

describe("permitManagerAction", () => {
  it("allows reorder and delete, refuses edit", () => {
    expect(permitManagerAction(DEFAULT_MANAGER_PERMISSIONS, "reorder")).toBe(
      true,
    );
    expect(permitManagerAction(DEFAULT_MANAGER_PERMISSIONS, "delete")).toBe(
      true,
    );
    expect(permitManagerAction(DEFAULT_MANAGER_PERMISSIONS, "comment")).toBe(
      true,
    );
    expect(permitManagerAction(DEFAULT_MANAGER_PERMISSIONS, "edit")).toBe(
      false,
    );
  });
});

describe("sendInboxTaskRequestSchema", () => {
  it("accepts the sender project id and rejects a free-text name", () => {
    expect(
      sendInboxTaskRequestSchema.parse({
        title: "Triage EGS inbox",
        projectId: "11111111-1111-4111-8111-111111111111",
      }).projectId,
    ).toBe("11111111-1111-4111-8111-111111111111");

    expect(
      sendInboxTaskRequestSchema.safeParse({
        title: "Triage EGS inbox",
        projectName: "EGS",
      }).success,
    ).toBe(true);
    expect(
      sendInboxTaskRequestSchema.parse({
        title: "Triage EGS inbox",
        projectName: "EGS",
      }).projectId,
    ).toBeUndefined();
  });
});
